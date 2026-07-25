import type { Db } from '../connection.js'

interface Migration {
  name: string
  up: (db: Db) => void
  /** Set to true for schema-rebuild migrations that need PRAGMA foreign_keys = OFF.
   *  These run outside the normal transaction wrapper so the PRAGMA takes effect. */
  noTransaction?: boolean
}

const migrations: Migration[] = [
  {
    name: '001_initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL,
          name TEXT,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

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

        CREATE TABLE IF NOT EXISTS salary_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id INTEGER NOT NULL,
          month TEXT NOT NULL,
          year INTEGER NOT NULL,
          bonus REAL DEFAULT 0,
          deductions REAL DEFAULT 0,
          actual_paid REAL NOT NULL,
          paid_date TEXT,
          notes TEXT,
          synced INTEGER DEFAULT 0,
          FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
          UNIQUE (employee_id, month, year)
        );

        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item TEXT NOT NULL,
          month TEXT NOT NULL,
          year INTEGER NOT NULL,
          amount REAL NOT NULL,
          category TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );

        CREATE TABLE IF NOT EXISTS sync_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          table_name TEXT NOT NULL,
          record_id INTEGER NOT NULL,
          status TEXT NOT NULL,
          error TEXT,
          synced_at TEXT NOT NULL
        );
      `)
    }
  },
  {
    name: '002_expenses_unique_constraint',
    up: (db) => {
      // Recreate expenses table with UNIQUE(item, month, year) for upsert support
      db.exec(`
        CREATE TABLE IF NOT EXISTS expenses_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item TEXT NOT NULL,
          month TEXT NOT NULL,
          year INTEGER NOT NULL,
          amount REAL NOT NULL,
          category TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0,
          UNIQUE (item, month, year)
        );

        INSERT OR IGNORE INTO expenses_new (id, item, month, year, amount, category, notes, created_at, synced)
        SELECT id, item, month, year, amount, category, notes, created_at, synced FROM expenses;

        DROP TABLE expenses;

        ALTER TABLE expenses_new RENAME TO expenses;
      `)
    }
  },
  {
    name: '003_add_updated_at_columns',
    up: (db) => {
      // Add updated_at column to employees
      try {
        db.exec('ALTER TABLE employees ADD COLUMN updated_at TEXT;')
      } catch {
        // Ignore if already exists
      }
      db.exec("UPDATE employees SET updated_at = created_at WHERE updated_at IS NULL;")

      // Add updated_at column to salary_payments
      try {
        db.exec('ALTER TABLE salary_payments ADD COLUMN updated_at TEXT;')
      } catch {
        // Ignore if already exists
      }
      // Backfill to a fixed old sentinel (NOT "now") — stamping legacy rows with the current
      // migration time would make them look artificially freshest, so sync:pull's
      // most-recent-wins conflict resolution would always keep this local row and skip real,
      // older-but-still-newer-than-epoch cloud data. A sentinel from before this app existed
      // guarantees any genuine cloud update_at wins the conflict.
      db.exec("UPDATE salary_payments SET updated_at = COALESCE(paid_date, '2000-01-01T00:00:00Z') WHERE updated_at IS NULL;")

      // Add updated_at column to expenses
      try {
        db.exec('ALTER TABLE expenses ADD COLUMN updated_at TEXT;')
      } catch {
        // Ignore if already exists
      }
      db.exec("UPDATE expenses SET updated_at = created_at WHERE updated_at IS NULL;")
    }
  },
  {
    name: '004_child_services',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS child_services (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          child_id INTEGER NOT NULL,
          service TEXT NOT NULL,
          unit TEXT NOT NULL,
          price REAL NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0,
          FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE,
          UNIQUE (child_id, service)
        );

        INSERT INTO child_services (child_id, service, unit, price, created_at, updated_at, synced)
        SELECT id, service, unit, price, created_at, updated_at, 0 FROM children;
      `)
    }
  },
  {
    name: '005_payments_service_id',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS payments_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          child_id INTEGER NOT NULL,
          service_id INTEGER,
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
          FOREIGN KEY (service_id) REFERENCES child_services (id),
          UNIQUE (child_id, service_id, month, year)
        );

        INSERT INTO payments_new (
          id, child_id, month, year, service, unit, quantity, price, total, paid, balance, status, notes, created_at, updated_at, synced
        )
        SELECT id, child_id, month, year, service, unit, quantity, price, total, paid, balance, status, notes, created_at, updated_at, synced
        FROM payments;

        UPDATE payments_new
        SET service_id = (
          SELECT id FROM child_services 
          WHERE child_services.child_id = payments_new.child_id 
          AND child_services.service = payments_new.service
        );

        DROP TABLE payments;
        ALTER TABLE payments_new RENAME TO payments;
      `)
    }
  },
  {
    name: '006_tombstones',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tombstones (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity TEXT NOT NULL,
          record_id INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0,
          UNIQUE(entity, record_id)
        );
      `)
    }
  },
  {
    name: '007_settings_sync_columns',
    up: (db) => {
      try {
        db.exec('ALTER TABLE settings ADD COLUMN updated_at TEXT;')
      } catch {
        // Ignore if already exists
      }
      try {
        db.exec('ALTER TABLE settings ADD COLUMN synced INTEGER DEFAULT 0;')
      } catch {
        // Ignore if already exists
      }
      // Same fix as salary_payments above (migration 003) — a fixed old sentinel, not "now",
      // so sync:pull's conflict resolution doesn't treat every legacy settings row as
      // freshest-by-definition and silently skip real cloud updates during pull.
      db.exec("UPDATE settings SET updated_at = '2000-01-01T00:00:00Z' WHERE updated_at IS NULL;")
    }
  },
  {
    name: '008_users_sync_columns',
    up: (db) => {
      try {
        db.exec('ALTER TABLE users ADD COLUMN updated_at TEXT;')
      } catch {
        // Ignore if already exists
      }
      try {
        db.exec('ALTER TABLE users ADD COLUMN synced INTEGER DEFAULT 0;')
      } catch {
        // Ignore if already exists
      }
      db.exec("UPDATE users SET updated_at = created_at WHERE updated_at IS NULL;")
    }
  },
  {
    name: '009_backfill_missing_child_services',
    up: (db) => {
      // Repair children inserted after migration 004 (e.g. via Excel import / seed),
      // which created `children` rows but no matching `child_services` enrollment.
      // Create one enrollment per orphaned child from its legacy service/unit/price,
      // then link any payments still missing a service_id.
      db.exec(`
        INSERT INTO child_services (child_id, service, unit, price, created_at, updated_at, synced)
        SELECT id, service, unit, price, created_at, updated_at, 0
        FROM children
        WHERE id NOT IN (SELECT child_id FROM child_services);

        UPDATE payments
        SET service_id = (
          SELECT cs.id FROM child_services cs
          WHERE cs.child_id = payments.child_id
          AND cs.service = payments.service
        )
        WHERE service_id IS NULL;
      `)
    }
  },
  {
    name: '010_imported_snapshots',
    up: (db) => {
      // Generic snapshot store for non-relational workbook sheets imported verbatim
      // (📊 داشبورد، 📄 كشف حساب). These are snapshots only — the live dashboard and
      // statement views keep recomputing from source data and are not driven by this table.
      db.exec(`
        CREATE TABLE IF NOT EXISTS imported_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sheet TEXT NOT NULL,
          row_index INTEGER NOT NULL,
          data_json TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0,
          UNIQUE(sheet, row_index)
        );
      `)
    }
  },
  {
    name: '011_child_photo_teacher_lessons',
    up: (db) => {
      // Additive columns on `children` for the enrollment enhancements feature
      // (004): Cloudinary photo reference, assigned teacher (employees.id),
      // lesson schedule, and the computed monthly session fee. Each ALTER is
      // guarded so re-runs / partially-applied DBs are safe (pattern from 003/007/008).
      const addColumn = (ddl: string) => {
        try {
          db.exec(ddl)
        } catch {
          // Column already exists — ignore.
        }
      }
      addColumn('ALTER TABLE children ADD COLUMN photo_url TEXT;')
      addColumn('ALTER TABLE children ADD COLUMN photo_public_id TEXT;')
      addColumn('ALTER TABLE children ADD COLUMN teacher_id INTEGER;')
      addColumn('ALTER TABLE children ADD COLUMN lesson_days TEXT;')
      addColumn('ALTER TABLE children ADD COLUMN sessions_baseline INTEGER DEFAULT 8;')
      addColumn('ALTER TABLE children ADD COLUMN extra_lessons INTEGER DEFAULT 0;')
      addColumn('ALTER TABLE children ADD COLUMN session_price REAL;')
      addColumn('ALTER TABLE children ADD COLUMN monthly_fee REAL;')
    }
  },
  {
    name: '014_employee_roles_salary_types',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS salary_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          mode TEXT NOT NULL CHECK(mode IN ('fixed_monthly','per_session_fixed','per_session_pct','hybrid')),
          monthly_rate REAL,
          session_rate REAL,
          session_pct REAL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS employee_roles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          salary_type_id INTEGER REFERENCES salary_types(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
      `)

      // Additive columns — guarded so re-runs on existing DBs are safe
      const addCol = (ddl: string) => { try { db.exec(ddl) } catch { /* already exists */ } }
      addCol('ALTER TABLE employees ADD COLUMN role_id INTEGER REFERENCES employee_roles(id);')
      addCol('ALTER TABLE employees ADD COLUMN salary_type_override_id INTEGER REFERENCES salary_types(id);')
      addCol('ALTER TABLE salary_types ADD COLUMN synced INTEGER DEFAULT 0;')
      addCol('ALTER TABLE employee_roles ADD COLUMN synced INTEGER DEFAULT 0;')

      // Auto-migrate existing role strings into employee_roles
      const now = new Date().toISOString()
      const roles = db.prepare("SELECT DISTINCT role FROM employees WHERE role IS NOT NULL AND role != ''").all() as { role: string }[]
      for (const { role } of roles) {
        db.prepare(`
          INSERT OR IGNORE INTO employee_roles (name, created_at, updated_at, synced) VALUES (?, ?, ?, 0)
        `).run(role, now, now)
      }
      db.exec(`
        UPDATE employees SET role_id = (
          SELECT id FROM employee_roles WHERE employee_roles.name = employees.role
        ) WHERE role_id IS NULL;
      `)
    }
  },
  {
    name: '015_service_definitions',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS service_definitions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          is_custom INTEGER DEFAULT 1,
          price_monthly REAL,
          price_daily REAL,
          price_hourly REAL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
      `)
      const addCol = (ddl: string) => { try { db.exec(ddl) } catch { /* already exists */ } }
      addCol('ALTER TABLE service_definitions ADD COLUMN synced INTEGER DEFAULT 0;')

      const now = new Date().toISOString()
      const get = (key: string): number | null => {
        const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined
        return row?.value ? Number(row.value) : null
      }
      const seeds = [
        { name: 'حضانة', monthly: get('nursery_monthly'), daily: get('nursery_daily'), hourly: get('nursery_hourly') },
        { name: 'استضافة', monthly: get('hosting_monthly'), daily: get('hosting_daily'), hourly: get('hosting_hourly') },
        { name: 'جلسة', monthly: get('session_monthly'), daily: get('session_daily'), hourly: get('session_hourly') },
      ]
      for (const s of seeds) {
        db.prepare(`
          INSERT OR IGNORE INTO service_definitions (name, is_custom, price_monthly, price_daily, price_hourly, created_at, updated_at, synced)
          VALUES (?, 0, ?, ?, ?, ?, ?, 0)
        `).run(s.name, s.monthly, s.daily, s.hourly, now, now)
      }
    }
  },
  {
    name: '016_scheduled_sessions',
    up: (db) => {
      const addCol = (ddl: string) => { try { db.exec(ddl) } catch { /* already exists */ } }
      db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_date TEXT NOT NULL,
          service_id INTEGER REFERENCES service_definitions(id),
          group_name TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS session_teachers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL REFERENCES scheduled_sessions(id) ON DELETE CASCADE,
          employee_id INTEGER NOT NULL REFERENCES employees(id),
          synced INTEGER DEFAULT 0,
          UNIQUE(session_id, employee_id)
        );
      `)
      addCol('ALTER TABLE scheduled_sessions ADD COLUMN synced INTEGER DEFAULT 0;')
      addCol('ALTER TABLE session_teachers ADD COLUMN synced INTEGER DEFAULT 0;')
    }
  },
  {
    name: '017_attendance',
    up: (db) => {
      const addCol = (ddl: string) => { try { db.exec(ddl) } catch { /* already exists */ } }
      db.exec(`
        CREATE TABLE IF NOT EXISTS attendance_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL REFERENCES scheduled_sessions(id) ON DELETE CASCADE,
          child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK(status IN ('attended','absent_excused','absent_unexcused')),
          excuse_notes TEXT,
          recorded_by INTEGER REFERENCES users(id),
          recorded_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0,
          UNIQUE(session_id, child_id)
        );

        CREATE TABLE IF NOT EXISTS attendance_conflicts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          attendance_record_id INTEGER NOT NULL REFERENCES attendance_records(id),
          overwritten_status TEXT NOT NULL,
          overwritten_by TEXT,
          overwritten_at TEXT NOT NULL,
          winning_status TEXT NOT NULL,
          winning_by TEXT,
          winning_at TEXT NOT NULL,
          reviewed INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
      `)
      addCol('ALTER TABLE attendance_records ADD COLUMN synced INTEGER DEFAULT 0;')
      addCol('ALTER TABLE attendance_conflicts ADD COLUMN synced INTEGER DEFAULT 0;')
    }
  },
  {
    name: '018_payment_prorated_column',
    up: (db) => {
      try {
        db.exec('ALTER TABLE payments ADD COLUMN prorated_calculated REAL;')
      } catch {
        // Already exists
      }
    }
  },
  {
    name: '019_backfill_synced_columns',
    up: (db) => {
      // Tables created before the synced column was added (existing live DBs) need
      // this column added retroactively. ALTER TABLE is idempotent via try/catch.
      const addCol = (ddl: string) => { try { db.exec(ddl) } catch { /* already exists */ } }
      addCol('ALTER TABLE salary_types ADD COLUMN synced INTEGER DEFAULT 0;')
      addCol('ALTER TABLE employee_roles ADD COLUMN synced INTEGER DEFAULT 0;')
      addCol('ALTER TABLE service_definitions ADD COLUMN synced INTEGER DEFAULT 0;')
      addCol('ALTER TABLE scheduled_sessions ADD COLUMN synced INTEGER DEFAULT 0;')
      addCol('ALTER TABLE session_teachers ADD COLUMN synced INTEGER DEFAULT 0;')
      addCol('ALTER TABLE attendance_records ADD COLUMN synced INTEGER DEFAULT 0;')
    }
  },
  {
    name: '020_attendance_conflicts_synced',
    up: (db) => {
      try { db.exec('ALTER TABLE attendance_conflicts ADD COLUMN synced INTEGER DEFAULT 0;') } catch { /* already exists */ }
    }
  },
  {
    name: '021_payment_methods',
    up: (db) => {
      const addCol = (ddl: string) => { try { db.exec(ddl) } catch { /* already exists */ } }
      db.exec(`
        CREATE TABLE IF NOT EXISTS payment_methods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          is_active INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
      `)
      // Seed default methods
      const now = new Date().toISOString()
      const defaults = ['كاش', 'تحويل بنكي', 'فيزا / ماستركارد', 'فودافون كاش']
      for (const name of defaults) {
        db.prepare(`INSERT OR IGNORE INTO payment_methods (name, is_active, created_at, updated_at, synced) VALUES (?, 1, ?, ?, 0)`).run(name, now, now)
      }
      addCol('ALTER TABLE payments ADD COLUMN payment_method_id INTEGER REFERENCES payment_methods(id);')
      addCol('ALTER TABLE payments ADD COLUMN payment_method_name TEXT;')
    }
  },
  {
    name: '013_session_monthly_setting',
    up: (db) => {
      db.exec(`
        INSERT OR IGNORE INTO settings (key, value, updated_at, synced)
        VALUES ('session_monthly', '1200', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0);
      `)
    }
  },
  {
    name: '012_repush_payments_with_service_id',
    up: (db) => {
      // Payments pushed to MongoDB before service_id was added to the Mongoose schema
      // landed there without that field. Re-backfill any NULL service_id rows locally,
      // then mark all payments unsynced so the next push overwrites MongoDB documents
      // with the correct service_id.
      db.exec(`
        UPDATE payments
        SET service_id = (
          SELECT cs.id FROM child_services cs
          WHERE cs.child_id = payments.child_id
          AND cs.service = payments.service
        )
        WHERE service_id IS NULL;

        UPDATE payments SET synced = 0;
      `)
    }
  },
  {
    name: '022_employee_deductions',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS employee_deductions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id INTEGER NOT NULL REFERENCES employees(id),
          month TEXT NOT NULL,
          year INTEGER NOT NULL,
          reason TEXT NOT NULL,
          amount REAL NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
      `)
    }
  },
  {
    name: '023_payment_transactions',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS payment_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
          amount REAL NOT NULL,
          payment_method_id INTEGER REFERENCES payment_methods(id),
          payment_method_name TEXT,
          paid_date TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment ON payment_transactions(payment_id);
      `)
    }
  },
  {
    name: '024_child_services_teacher_days',
    up: (db) => {
      // Add teacher_id and lesson_days columns to child_services.
      // Use guarded ALTER TABLE (same pattern as 011/014/019) so re-runs are safe.
      // NOTE: We cannot DROP the old UNIQUE(child_id, service) constraint without
      // recreating the table; however the INSERT in childrenIPC now does DELETE+INSERT
      // (not ON CONFLICT upsert), so the constraint is bypassed at the app level.
      const addCol = (ddl: string) => {
        try { db.exec(ddl) } catch { /* column already exists — ignore */ }
      }
      addCol('ALTER TABLE child_services ADD COLUMN teacher_id INTEGER;')
      addCol('ALTER TABLE child_services ADD COLUMN lesson_days TEXT;')
      addCol('ALTER TABLE child_services ADD COLUMN extra_lessons INTEGER DEFAULT 0;')
      addCol('ALTER TABLE child_services ADD COLUMN session_price REAL;')
    }
  },
  {
    // MUST run outside a transaction so PRAGMA foreign_keys = OFF takes effect.
    // SQLite silently ignores that PRAGMA when issued inside a transaction.
    name: '025_child_services_drop_unique',
    noTransaction: true,
    up: (db) => {
      // Recreate child_services without the UNIQUE(child_id, service) constraint
      // so the same service can be enrolled more than once per child.
      // FK enforcement is disabled by the runner before this function is called.
      db.exec(`
        CREATE TABLE IF NOT EXISTS child_services_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          child_id INTEGER NOT NULL,
          service TEXT NOT NULL,
          unit TEXT NOT NULL,
          price REAL NOT NULL,
          teacher_id INTEGER,
          lesson_days TEXT,
          extra_lessons INTEGER DEFAULT 0,
          session_price REAL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0,
          FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE
        );

        INSERT INTO child_services_new
          (id, child_id, service, unit, price, teacher_id, lesson_days,
           extra_lessons, session_price, created_at, updated_at, synced)
        SELECT
          id, child_id, service, unit, price, teacher_id, lesson_days,
          COALESCE(extra_lessons, 0), session_price, created_at, updated_at, synced
        FROM child_services;

        DROP TABLE child_services;
        ALTER TABLE child_services_new RENAME TO child_services;
      `)

      // Restore the payments → child_services FK lookup index
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_child_services_child ON child_services(child_id);`)
      } catch { /* ignore */ }
    }
  },
  {
    name: '026_service_teachers',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS service_teachers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          service_id INTEGER NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
          employee_id INTEGER NOT NULL REFERENCES employees(id),
          created_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0,
          UNIQUE(service_id, employee_id)
        );
      `)
    }
  },
  {
    name: '027_teacher_session_rate',
    up: (db) => {
      try { db.exec('ALTER TABLE employees ADD COLUMN teacher_session_rate REAL;') } catch { /* already exists */ }
    }
  },
  {
    name: '028_attendance_teacher_status',
    up: (db) => {
      const addCol = (ddl: string) => { try { db.exec(ddl) } catch { /* already exists */ } }
      addCol('ALTER TABLE attendance_records ADD COLUMN attended_teacher_id INTEGER REFERENCES employees(id);')
      addCol("ALTER TABLE attendance_records ADD COLUMN teacher_status TEXT CHECK(teacher_status IN ('present','absent'));")

      // Best-effort backfill: existing rows predate teacher-attendance tracking, so treat the
      // teacher as having been present (matches the "attended-teacher earns pay" default that
      // was implicit in the old session_teachers-only model) and snapshot the child's current
      // assigned teacher.
      db.exec(`
        UPDATE attendance_records
        SET teacher_status = 'present'
        WHERE teacher_status IS NULL;
      `)
      db.exec(`
        UPDATE attendance_records
        SET attended_teacher_id = (
          SELECT teacher_id FROM children WHERE children.id = attendance_records.child_id
        )
        WHERE attended_teacher_id IS NULL;
      `)
    }
  },
  {
    name: '029_teacher_payments',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS teacher_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          teacher_id INTEGER NOT NULL REFERENCES employees(id),
          child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
          attendance_record_id INTEGER NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
          attendance_date TEXT NOT NULL,
          session_cost REAL NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending','paid','void')) DEFAULT 'pending',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0,
          UNIQUE(teacher_id, child_id, attendance_date)
        );
        CREATE INDEX IF NOT EXISTS idx_teacher_payments_teacher ON teacher_payments(teacher_id);
        CREATE INDEX IF NOT EXISTS idx_teacher_payments_month ON teacher_payments(attendance_date);
      `)
    }
  },
  {
    // MUST run outside a transaction so PRAGMA foreign_keys = OFF takes effect (same pattern
    // as 025_child_services_drop_unique).
    name: '030_attendance_records_per_teacher',
    noTransaction: true,
    up: (db) => {
      // A child can have more than one teacher (one per service enrollment in child_services).
      // The old UNIQUE(session_id, child_id) allowed only a single attendance/teacher row per
      // child per session, so a child with two teachers could never get a separate attendance
      // + payment for each. Rebuild with UNIQUE(session_id, child_id, attended_teacher_id) so
      // each (child, teacher) pair gets its own row.
      db.exec(`
        CREATE TABLE IF NOT EXISTS attendance_records_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL REFERENCES scheduled_sessions(id) ON DELETE CASCADE,
          child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK(status IN ('attended','absent_excused','absent_unexcused')),
          excuse_notes TEXT,
          recorded_by INTEGER REFERENCES users(id),
          recorded_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0,
          attended_teacher_id INTEGER REFERENCES employees(id),
          teacher_status TEXT CHECK(teacher_status IN ('present','absent')),
          UNIQUE(session_id, child_id, attended_teacher_id)
        );

        INSERT INTO attendance_records_new
          (id, session_id, child_id, status, excuse_notes, recorded_by, recorded_at, updated_at,
           synced, attended_teacher_id, teacher_status)
        SELECT
          id, session_id, child_id, status, excuse_notes, recorded_by, recorded_at, updated_at,
          synced, attended_teacher_id, teacher_status
        FROM attendance_records;

        DROP TABLE attendance_records;
        ALTER TABLE attendance_records_new RENAME TO attendance_records;
      `)

      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON attendance_records(session_id);`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_records_child ON attendance_records(child_id);`)
      } catch { /* ignore */ }
    }
  },
  {
    // Feature 007 — Attendance Edit Approval Workflow. "Locked" is a derived state (a row
    // already exists) — no locked column needed. See specs/007-.../research.md #4.
    name: '031_attendance_edit_requests',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS attendance_edit_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          attendance_record_id INTEGER NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
          child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
          teacher_id INTEGER REFERENCES employees(id),
          attendance_date TEXT NOT NULL,
          original_status TEXT NOT NULL,
          original_excuse_notes TEXT,
          original_teacher_status TEXT,
          requested_status TEXT NOT NULL CHECK(requested_status IN ('attended','absent_excused','absent_unexcused')),
          requested_excuse_notes TEXT,
          requested_teacher_status TEXT CHECK(requested_teacher_status IN ('present','absent')),
          reason TEXT NOT NULL,
          requested_by INTEGER NOT NULL REFERENCES users(id),
          requested_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
          decided_by INTEGER REFERENCES users(id),
          decided_at TEXT,
          decision_notes TEXT,
          synced INTEGER DEFAULT 0
        );
      `)
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_edit_requests_record ON attendance_edit_requests(attendance_record_id);`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_edit_requests_status ON attendance_edit_requests(status);`)
        // Enforce "at most one pending request per attendance record" at the DB level too.
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_edit_requests_one_pending ON attendance_edit_requests(attendance_record_id) WHERE status = 'pending';`)
      } catch { /* ignore */ }
    }
  },
  {
    name: '032_attendance_audit_log',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS attendance_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          attendance_record_id INTEGER NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
          edit_request_id INTEGER REFERENCES attendance_edit_requests(id),
          old_status TEXT,
          old_excuse_notes TEXT,
          old_teacher_status TEXT,
          new_status TEXT NOT NULL,
          new_excuse_notes TEXT,
          new_teacher_status TEXT,
          changed_by INTEGER NOT NULL REFERENCES users(id),
          approved_by INTEGER REFERENCES users(id),
          reason TEXT,
          changed_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
      `)
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_record ON attendance_audit_log(attendance_record_id);`)
      } catch { /* ignore */ }
    }
  },
  {
    name: '033_notifications',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('edit_request_submitted','edit_request_approved','edit_request_rejected')),
          related_id INTEGER,
          message_ar TEXT NOT NULL,
          message_en TEXT NOT NULL,
          read_at TEXT,
          created_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
      `)
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);`)
      } catch { /* ignore */ }
    }
  },
  {
    name: '034_daily_payments',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS daily_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          child_id INTEGER NOT NULL,
          service_id INTEGER,
          billing_date TEXT NOT NULL,
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
          payment_method_id INTEGER,
          payment_method_name TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0,
          FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
          UNIQUE (child_id, service_id, billing_date)
        );
      `)
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_daily_payments_date ON daily_payments(billing_date);`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_daily_payments_child ON daily_payments(child_id, billing_date);`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_daily_payments_synced ON daily_payments(synced);`)
      } catch { /* ignore */ }
    }
  },
  {
    name: '035_daily_payment_transactions',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS daily_payment_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          daily_payment_id INTEGER NOT NULL REFERENCES daily_payments(id) ON DELETE CASCADE,
          amount REAL NOT NULL,
          payment_method_id INTEGER REFERENCES payment_methods(id),
          payment_method_name TEXT,
          paid_date TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_daily_payment_tx_payment ON daily_payment_transactions(daily_payment_id);
      `)
    }
  },
  {
    // Feature 009: illness case tracking — presence of an 'open' row suppresses the
    // "Add Activity" diary action on the child details page.
    name: '036_child_illness_cases',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS child_illness_cases (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK(status IN ('open','resolved')),
          description TEXT,
          opened_at TEXT NOT NULL,
          resolved_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_illness_cases_child_status ON child_illness_cases(child_id, status);
      `)
    }
  },
  {
    // Feature 009: child activity/media diary entries (photo/video hosted on Cloudinary).
    name: '037_child_activities',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS child_activities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
          activity_date TEXT NOT NULL,
          note TEXT,
          media_url TEXT,
          media_type TEXT CHECK(media_type IN ('photo','video')),
          media_status TEXT CHECK(media_status IN ('uploaded','failed')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_child_activities_child_date ON child_activities(child_id, activity_date);
      `)
    }
  },
  {
    // Feature 009: Daily Billing is being replaced by the Transactions tab (derived from the
    // existing `payments` table). Per spec Clarifications, historical daily-billing data is
    // discarded outright rather than migrated.
    name: '038_drop_daily_payments',
    up: (db) => {
      db.exec(`
        DROP TABLE IF EXISTS daily_payment_transactions;
        DROP TABLE IF EXISTS daily_payments;
      `)
    }
  },
  {
    // Per-child override of the teacher's flat `teacher_session_rate` — lets the same teacher
    // be paid a different per-session amount for different children, without changing their
    // own profile rate. Falls back to the teacher's rate (then the org-wide default) when unset.
    name: '039_child_services_teacher_rate',
    up: (db) => {
      try { db.exec('ALTER TABLE child_services ADD COLUMN teacher_session_rate REAL;') } catch { /* already exists */ }
    }
  },
  {
    // New 'per_child_session' salary type mode: this employee's pay is driven entirely by the
    // attendance-based teacher_payments ledger (which already resolves the per-child override
    // above), rather than a role-level monthly/session/pct formula. Requires rebuilding
    // salary_types since SQLite cannot ALTER a CHECK constraint in place.
    // MUST run outside a transaction so PRAGMA foreign_keys = OFF takes effect (same pattern
    // as 025_child_services_drop_unique).
    name: '040_salary_types_per_child_mode',
    noTransaction: true,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS salary_types_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          mode TEXT NOT NULL CHECK(mode IN ('fixed_monthly','per_session_fixed','per_session_pct','hybrid','per_child_session')),
          monthly_rate REAL,
          session_rate REAL,
          session_pct REAL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );

        INSERT INTO salary_types_new
          (id, name, mode, monthly_rate, session_rate, session_pct, created_at, updated_at, synced)
        SELECT id, name, mode, monthly_rate, session_rate, session_pct, created_at, updated_at, synced
        FROM salary_types;

        DROP TABLE salary_types;
        ALTER TABLE salary_types_new RENAME TO salary_types;
      `)
    }
  },
  {
    // Child activity diary now accepts any attachment type, not just photo/video.
    // Rebuild child_activities to widen the media_type CHECK to include 'file'
    // (SQLite cannot ALTER a CHECK constraint in place — same pattern as 040).
    name: '041_child_activities_any_media_type',
    noTransaction: true,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS child_activities_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
          activity_date TEXT NOT NULL,
          note TEXT,
          media_url TEXT,
          media_type TEXT CHECK(media_type IN ('photo','video','file')),
          media_status TEXT CHECK(media_status IN ('uploaded','failed')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );

        INSERT INTO child_activities_new
          (id, child_id, activity_date, note, media_url, media_type, media_status, created_at, updated_at, synced)
        SELECT id, child_id, activity_date, note, media_url, media_type, media_status, created_at, updated_at, synced
        FROM child_activities;

        DROP TABLE child_activities;
        ALTER TABLE child_activities_new RENAME TO child_activities;
        CREATE INDEX IF NOT EXISTS idx_child_activities_child_date ON child_activities(child_id, activity_date);
      `)
    }
  },
  {
    // Employees can no longer delete attendance directly — deleting goes through the same
    // approval flow as edits, as a request with requested_status = 'delete'. Rebuild
    // attendance_edit_requests to (a) widen the requested_status CHECK to include 'delete' and
    // (b) make attendance_record_id nullable with ON DELETE SET NULL, so an approved delete
    // request survives as history instead of being cascade-deleted along with its record.
    name: '042_attendance_delete_requests',
    noTransaction: true,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS attendance_edit_requests_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          attendance_record_id INTEGER REFERENCES attendance_records(id) ON DELETE SET NULL,
          child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
          teacher_id INTEGER REFERENCES employees(id),
          attendance_date TEXT NOT NULL,
          original_status TEXT NOT NULL,
          original_excuse_notes TEXT,
          original_teacher_status TEXT,
          requested_status TEXT NOT NULL CHECK(requested_status IN ('attended','absent_excused','absent_unexcused','deleted')),
          requested_excuse_notes TEXT,
          requested_teacher_status TEXT CHECK(requested_teacher_status IN ('present','absent')),
          reason TEXT NOT NULL,
          requested_by INTEGER NOT NULL REFERENCES users(id),
          requested_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
          decided_by INTEGER REFERENCES users(id),
          decided_at TEXT,
          decision_notes TEXT,
          synced INTEGER DEFAULT 0
        );

        INSERT INTO attendance_edit_requests_new
          (id, attendance_record_id, child_id, teacher_id, attendance_date,
           original_status, original_excuse_notes, original_teacher_status,
           requested_status, requested_excuse_notes, requested_teacher_status,
           reason, requested_by, requested_at, status, decided_by, decided_at, decision_notes, synced)
        SELECT id, attendance_record_id, child_id, teacher_id, attendance_date,
           original_status, original_excuse_notes, original_teacher_status,
           requested_status, requested_excuse_notes, requested_teacher_status,
           reason, requested_by, requested_at, status, decided_by, decided_at, decision_notes, synced
        FROM attendance_edit_requests;

        DROP TABLE attendance_edit_requests;
        ALTER TABLE attendance_edit_requests_new RENAME TO attendance_edit_requests;
        CREATE INDEX IF NOT EXISTS idx_edit_requests_record ON attendance_edit_requests(attendance_record_id);
        CREATE INDEX IF NOT EXISTS idx_edit_requests_status ON attendance_edit_requests(status);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_edit_requests_one_pending ON attendance_edit_requests(attendance_record_id) WHERE status = 'pending';
      `)
    }
  }
]

export function runMigrations(db: Db): void {
  // Create migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      run_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const runMigrationList = db.prepare('SELECT name FROM migrations').all() as { name: string }[]
  const runMigrationNames = new Set(runMigrationList.map((m) => m.name))

  const insertMigration = db.prepare('INSERT INTO migrations (name) VALUES (?)')

  for (const migration of migrations) {
    if (!runMigrationNames.has(migration.name)) {
      console.log(`Running migration: ${migration.name}`)

      if (migration.noTransaction) {
        // Schema-rebuild migrations: disable FK enforcement at connection level
        // (PRAGMA foreign_keys cannot be changed inside a transaction in SQLite).
        db.pragma('foreign_keys = OFF')
        try {
          migration.up(db)
          insertMigration.run(migration.name)
        } finally {
          db.pragma('foreign_keys = ON')
        }
      } else {
        // Normal migrations: run inside a transaction for atomicity.
        const transaction = db.transaction(() => {
          migration.up(db)
          insertMigration.run(migration.name)
        })
        transaction()
      }
    }
  }
}
