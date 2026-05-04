import { execSync } from 'node:child_process'
import postgres from 'postgres'

const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres'
const TEST_DB = 'metamenu_test'
const TEST_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB}`

async function ensureTestDatabase() {
  const admin = postgres(ADMIN_URL, { max: 1 })
  try {
    const exists = await admin`
      SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}
    `
    if (exists.length === 0) {
      console.log(`[e2e] Creating database ${TEST_DB}…`)
      await admin.unsafe(`CREATE DATABASE "${TEST_DB}"`)
    }
  } finally {
    await admin.end({ timeout: 5 })
  }
}

async function truncateAll() {
  const sql = postgres(TEST_URL, { max: 1 })
  try {
    // Order matters because of FKs; CASCADE handles it.
    await sql`
      TRUNCATE TABLE
        "item", "category", "menu", "restaurant",
        "invitation", "member", "organization",
        "session", "account", "verification", "user"
      RESTART IDENTITY CASCADE
    `
  } finally {
    await sql.end({ timeout: 5 })
  }
}

export default async function globalSetup() {
  await ensureTestDatabase()
  console.log('[e2e] Running migrations against test DB…')
  execSync('bun --bun drizzle-kit migrate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_URL },
  })
  await truncateAll()
  console.log('[e2e] Test DB ready.')
}
