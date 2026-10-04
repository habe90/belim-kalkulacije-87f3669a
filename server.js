import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json({ limit: '2mb' }))

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false })
  : null

console.log('DB pool konfigurisan:', !!pool)

let schemaReady = false
async function ensureSchema() {
  if (!pool) throw new Error('DATABASE_URL nije postavljen na serveru.')
  if (schemaReady) return
  await pool.query(`CREATE TABLE IF NOT EXISTS offers (
    id uuid PRIMARY KEY,
    offer_number text,
    client_name text,
    product_names text,
    grand_total numeric,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`)
  await pool.query('CREATE INDEX IF NOT EXISTS offers_client_name_idx ON offers (lower(client_name))')
  await pool.query('CREATE INDEX IF NOT EXISTS offers_offer_number_idx ON offers (lower(offer_number))')
  await pool.query('CREATE INDEX IF NOT EXISTS offers_created_at_idx ON offers (created_at DESC)')
  schemaReady = true
}

async function requireDb(req, res, next) {
  try {
    await ensureSchema()
    next()
  } catch (err) {
    console.error('Baza nije dostupna:', err)
    res.status(503).json({ error: 'Baza podataka trenutno nije dostupna. Pokušajte ponovo za nekoliko trenutaka.' })
  }
}

function extractMeta(offerData) {
  const clientName = offerData?.client || ''
  const offerNumber = offerData?.offerNumber || ''
  const productNames = Array.isArray(offerData?.products) ? offerData.products.map(p => p.name).filter(Boolean).join(', ') : ''
  return { clientName, offerNumber, productNames }
}

app.get('/api/health', (req, res) => res.json({ name: 'Belim kalkulacije', status: 'ok' }))

app.get('/api/offers', requireDb, async (req, res) => {
  try {
    const { search } = req.query
    let query = 'SELECT id, offer_number, client_name, product_names, grand_total, data, created_at, updated_at FROM offers'
    const params = []
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim().toLowerCase()}%`)
      query += ' WHERE lower(client_name) LIKE $1 OR lower(offer_number) LIKE $1 OR lower(product_names) LIKE $1'
    }
    query += ' ORDER BY created_at DESC'
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Greška pri učitavanju ponuda.', detail: err.message })
  }
})

app.get('/api/offers/:id', requireDb, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM offers WHERE id = $1', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Ponuda nije pronađena.' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Greška pri učitavanju ponude.' })
  }
})

app.post('/api/offers', requireDb, async (req, res) => {
  try {
    const { offer, grandTotal } = req.body
    if (!offer) return res.status(400).json({ error: 'Nedostaju podaci ponude.' })
    const id = randomUUID()
    const { clientName, offerNumber, productNames } = extractMeta(offer)
    const result = await pool.query(
      `INSERT INTO offers (id, offer_number, client_name, product_names, grand_total, data, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, now(), now()) RETURNING *`,
      [id, offerNumber, clientName, productNames, grandTotal || 0, offer]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Greška pri čuvanju ponude.' })
  }
})

app.put('/api/offers/:id', requireDb, async (req, res) => {
  try {
    const { offer, grandTotal } = req.body
    if (!offer) return res.status(400).json({ error: 'Nedostaju podaci ponude.' })
    const { clientName, offerNumber, productNames } = extractMeta(offer)
    const result = await pool.query(
      `UPDATE offers SET offer_number=$1, client_name=$2, product_names=$3, grand_total=$4, data=$5, updated_at=now()
       WHERE id=$6 RETURNING *`,
      [offerNumber, clientName, productNames, grandTotal || 0, offer, req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Ponuda nije pronađena.' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Greška pri ažuriranju ponude.' })
  }
})

app.delete('/api/offers/:id', requireDb, async (req, res) => {
  try {
    await pool.query('DELETE FROM offers WHERE id = $1', [req.params.id])
    res.status(204).end()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Greška pri brisanju ponude.' })
  }
})

const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(distPath, 'index.html'))
})

const port = parseInt(process.env.PORT) || 3000
app.listen(port, '0.0.0.0', () => console.log(`Server pokrenut na portu ${port}`))
