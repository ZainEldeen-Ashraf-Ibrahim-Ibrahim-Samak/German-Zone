import { describe, it, expect, beforeAll } from 'vitest'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'

describe('Migration Backfill 004/005', () => {
  let db: any

  beforeAll(() => {
    db = initDb()

    // 1. Run migrations up to 003 manually or by removing 004/005 from the list 
    // Wait, since we are going to add 004 and 005 to index.js, 
    // we can't easily run "up to 003" without mocking.
    // Instead, we can just insert data as if it were the old schema, 
    // but the old schema columns still exist in 004/005 (we don't drop them).
    // So we can insert a child into `children`, and a payment into `payments`,
    // THEN run `runMigrations(db)`, which will run ALL migrations (including 001-005).
    // Wait, if `runMigrations(db)` runs 001-005 immediately, we can't insert "legacy" data *between* migrations!
    
    // So instead of doing this via initDb(), let's create an empty DB, run 001-003 manually,
    // insert data, then run runMigrations(db) which will see 001-003 are done and only run 004-005.
  })
  
  it('should backfill exactly one child_services row per existing child and link legacy payments', () => {
    const memDb = initDb()
    
    // We import the migrations array directly to run only up to 003
    // But since it's not exported, we can just create the tables directly as they were in 003.
    memDb.exec(`
      CREATE TABLE IF NOT EXISTS children (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        guardian TEXT NOT NULL,
        guardian_phone TEXT NOT NULL,
        child_phone TEXT,
        national_id TEXT,
        service TEXT NOT NULL,
        unit TEXT NOT NULL,
        price REAL NOT NULL,
        reg_date TEXT NOT NULL,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        child_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        year INTEGER NOT NULL,
        service TEXT NOT NULL,
        unit TEXT NOT NULL,
        quantity REAL DEFAULT 1,
        price REAL NOT NULL,
        total REAL NOT NULL,
        paid REAL DEFAULT 0,
        balance REAL NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE,
        UNIQUE (child_id, month, year)
      );

      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        run_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        name TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        base_salary REAL NOT NULL,
        housing REAL DEFAULT 0,
        transport REAL DEFAULT 0,
        net_salary REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      );

      INSERT INTO migrations (name) VALUES ('001_initial_schema'), ('002_expenses_unique_constraint'), ('003_add_updated_at_columns');
    `)

    // Insert legacy child
    const insertChild = memDb.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at)
      VALUES ('Test Child', 'Test Guardian', '123', 'حضانة', 'شهر', 1000, '2025-01-01', '2025-01-01', '2025-01-01')
    `)
    const childId = insertChild.run().lastInsertRowid

    // Insert legacy payment
    const insertPayment = memDb.prepare(`
      INSERT INTO payments (child_id, month, year, service, unit, price, total, balance, status, created_at, updated_at)
      VALUES (?, 'يناير', 2025, 'حضانة', 'شهر', 1000, 1000, 1000, 'unpaid', '2025-01-01', '2025-01-01')
    `)
    const paymentId = insertPayment.run(childId).lastInsertRowid

    // Run migrations (will run 004 and 005)
    runMigrations(memDb)

    // Verify backfill
    const services = memDb.prepare('SELECT * FROM child_services WHERE child_id = ?').all(childId)
    expect(services.length).toBe(1)
    expect(services[0].service).toBe('حضانة')
    expect(services[0].unit).toBe('شهر')
    expect(services[0].price).toBe(1000)

    const payment = memDb.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId)
    expect(payment.service_id).toBe(services[0].id)
  })
})
