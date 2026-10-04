import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json({ limit: '2mb' }))

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined })
  : null

function requireDb(req, res, next) {
  if (!pool) return res.status(500).json({ error: 'Baza nije konfigurisana.' })
  next()
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
    res.status(500).json({ error: 'Greška pri učitavanju ponuda.' })
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
