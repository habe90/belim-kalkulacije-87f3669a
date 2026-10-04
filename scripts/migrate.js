import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, '..', 'migrations')

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL nije postavljen — preskačem migracije.')
    return
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined })
  await client.connect()
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    console.log(`→ Primjenjujem migraciju: ${file}`)
    await client.query(sql)
  }
  await client.end()
  console.log('✓ Migracije završene.')
}

run().catch(err => { console.error('Greška pri migraciji:', err); process.exit(1) })
