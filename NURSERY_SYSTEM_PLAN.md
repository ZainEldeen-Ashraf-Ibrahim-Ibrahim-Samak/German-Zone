# 🏫 Nursery & Autism Center Management System
## خطة مشروع Electron.js الكاملة

> **مبني على:** تحليل ملف `Nursery_V4_Final_5.xlsx`  
> **التقنيات:** Electron.js · React · Tailwind CSS · MongoDB · ExcelJS  
> **الأدوار:** Admin · Employee  
> **اللغات:** Arabic (RTL) · English (LTR)

---

## 📋 ملخص المشروع

نظام إدارة متكامل لحضانة ومركز توحد يشمل:
- إدارة بيانات الأطفال (100+ طفل)
- متابعة الإيرادات الشهرية لكل طفل
- إدارة الرواتب (11 موظف)
- المصروفات التشغيلية
- داشبورد مالي شامل
- تخطيط التارجت الشهري
- كشف حساب لكل طفل
- Export لـ Excel بنفس شكل الـ original
- مزامنة مع MongoDB للـ Admin

---

## 🎨 Branding & White-Label (تخصيص الهوية البصرية)

> Admin يقدر يغير كل حاجة من جوه التطبيق من غير ما يلمس كود.

### ما الذي يمكن تغييره:

| العنصر | التفاصيل |
|--------|----------|
| **اسم التطبيق** | يظهر في Sidebar + Header + Title Bar + نافذة Electron + الـ exports |
| **الشعار (Logo)** | رفع صورة PNG/SVG — تظهر في Sidebar + صفحة Login + رأس الـ Excel exports |
| **أيقونة التطبيق** | رفع .ico (Windows) / .icns (Mac) / .png (Linux) — تظهر في Taskbar + Dock |
| **الألوان الأساسية** | Primary color + Accent color — تتطبق على كل الـ UI فوراً |
| **اسم المؤسسة** | يظهر في كشوف الحساب والـ exports |
| **الوصف / Tagline** | يظهر في صفحة Login تحت الشعار |
| **معلومات التواصل** | هاتف + عنوان + إيميل — يظهر في footer الـ exports |

---

### 📁 Branding Files Structure

```
nursery-system/
├── assets/
│   ├── branding/
│   │   ├── logo.png           # الشعار الحالي (512x512 min)
│   │   ├── logo-dark.png      # نسخة للخلفية الداكنة (اختياري)
│   │   ├── icon.ico           # Windows taskbar icon
│   │   ├── icon.icns          # macOS icon
│   │   └── icon.png           # Linux + fallback (256x256)
│   └── default-branding/      # نسخة احتياطية من الـ branding الأصلي
│       ├── logo.png
│       └── icon.ico
```

---

### 🗄️ Branding in Database (settings table)

```sql
-- إضافة هذه الـ keys لجدول settings الموجود:

INSERT INTO settings (key, value) VALUES
  ('brand_app_name',        'نظام إدارة الحضانة'),
  ('brand_org_name',        'الحضانة ومركز التوحد'),
  ('brand_tagline',         'نظام الإدارة المالية الشاملة'),
  ('brand_primary_color',   '#3b82f6'),
  ('brand_accent_color',    '#10b981'),
  ('brand_logo_path',       'assets/branding/logo.png'),
  ('brand_icon_path',       'assets/branding/icon.ico'),
  ('brand_phone',           ''),
  ('brand_address',         ''),
  ('brand_email',           ''),
  ('brand_show_logo_sidebar', '1'),
  ('brand_show_logo_login',   '1'),
  ('brand_show_logo_export',  '1');
```

---

### ⚙️ Settings Page — Branding Tab

صفحة الإعدادات بتبقى فيها **3 تابات**:

#### Tab 1: الأسعار والأهداف (الموجود)
#### Tab 2: 🎨 الهوية البصرية (جديد)
#### Tab 3: 🔒 الأمان والمزامنة (Admin فقط)

**محتوى Tab الهوية البصرية:**

```
┌─────────────────────────────────────────────┐
│  🎨 تخصيص الهوية البصرية                    │
│                                             │
│  اسم التطبيق:  [________________]           │
│  اسم المؤسسة:  [________________]           │
│  وصف / Tagline: [________________]         │
│                                             │
│  ── الشعار ──────────────────────────────  │
│  [معاينة الشعار الحالي]  [رفع شعار جديد]   │
│  ☑ إظهار في Sidebar                        │
│  ☑ إظهار في صفحة الدخول                    │
│  ☑ إظهار في الـ Exports                    │
│                                             │
│  ── أيقونة التطبيق ─────────────────────── │
│  [معاينة الأيقونة]  [رفع أيقونة .ico/.png] │
│  ⚠️ يتطبق بعد إعادة تشغيل التطبيق          │
│                                             │
│  ── الألوان ────────────────────────────── │
│  اللون الأساسي:  [🎨 #3b82f6]              │
│  اللون الثانوي:  [🎨 #10b981]              │
│  [معاينة فورية]  [استعادة الألوان الافتراضية] │
│                                             │
│  ── معلومات التواصل ────────────────────── │
│  الهاتف:   [________________]              │
│  العنوان:  [________________]              │
│  الإيميل:  [________________]              │
│  (تظهر في footer الـ exports فقط)          │
│                                             │
│              [💾 حفظ التغييرات]             │
└─────────────────────────────────────────────┘
```

---

### 🔧 IPC Methods للـ Branding

```javascript
// في preload.js — أضف هذه الـ methods:
window.api.branding = {
  // جلب كل إعدادات الـ branding
  get: () => ipcRenderer.invoke('branding:get'),

  // حفظ إعدادات الـ branding (نص فقط)
  save: (data) => ipcRenderer.invoke('branding:save', data),

  // رفع شعار جديد — يفتح file dialog ويحفظ في assets/branding/
  uploadLogo: () => ipcRenderer.invoke('branding:upload-logo'),

  // رفع أيقونة جديدة — .ico أو .png
  uploadIcon: () => ipcRenderer.invoke('branding:upload-icon'),

  // استعادة الـ branding الافتراضي
  reset: () => ipcRenderer.invoke('branding:reset'),

  // تطبيق الأيقونة الجديدة على الـ Taskbar فوراً
  applyIcon: (iconPath) => ipcRenderer.invoke('branding:apply-icon'),
}
```

---

### ⚡ IPC Handlers في main.js

```javascript
// branding:get
ipcMain.handle('branding:get', async () => {
  const keys = db.prepare(`
    SELECT key, value FROM settings WHERE key LIKE 'brand_%'
  `).all();
  return Object.fromEntries(keys.map(r => [r.key, r.value]));
});

// branding:save
ipcMain.handle('branding:save', async (_, data) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  Object.entries(data).forEach(([k, v]) => stmt.run(k, v));

  // تحديث Electron window title فوراً
  const win = BrowserWindow.getAllWindows()[0];
  if (data.brand_app_name) {
    win.setTitle(data.brand_app_name);
  }
  return { success: true };
});

// branding:upload-logo
ipcMain.handle('branding:upload-logo', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'svg', 'webp'] }],
    properties: ['openFile']
  });
  if (canceled) return null;

  const dest = path.join(__dirname, '../assets/branding/logo.png');
  fs.copyFileSync(filePaths[0], dest);

  // حفظ المسار في DB
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('brand_logo_path', ?)").run(dest);
  return dest;
});

// branding:upload-icon
ipcMain.handle('branding:upload-icon', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'Icons', extensions: ['ico', 'png', 'icns'] }],
    properties: ['openFile']
  });
  if (canceled) return null;

  const ext = path.extname(filePaths[0]);
  const dest = path.join(__dirname, `../assets/branding/icon${ext}`);
  fs.copyFileSync(filePaths[0], dest);

  // تطبيق الأيقونة على الـ Window فوراً (بدون restart)
  const win = BrowserWindow.getAllWindows()[0];
  win.setIcon(dest);

  db.prepare("INSERT OR REPLACE INTO settings VALUES ('brand_icon_path', ?)").run(dest);
  return dest;
});

// branding:reset
ipcMain.handle('branding:reset', async () => {
  // نسخ الـ default branding files
  ['logo.png', 'icon.ico'].forEach(file => {
    const src = path.join(__dirname, `../assets/default-branding/${file}`);
    const dst = path.join(__dirname, `../assets/branding/${file}`);
    if (fs.existsSync(src)) fs.copyFileSync(src, dst);
  });

  // reset DB keys
  const defaults = {
    brand_app_name: 'نظام إدارة الحضانة',
    brand_org_name: 'الحضانة ومركز التوحد',
    brand_primary_color: '#3b82f6',
    brand_accent_color: '#10b981',
  };
  const stmt = db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)');
  Object.entries(defaults).forEach(([k, v]) => stmt.run(k, v));
  return { success: true };
});
```

---

### 🎨 Dynamic Theme in React (CSS Variables)

```typescript
// src/hooks/useBranding.ts
export function useBranding() {
  const { data: branding } = useQuery('branding', window.api.branding.get);

  useEffect(() => {
    if (!branding) return;

    // تطبيق الألوان كـ CSS variables على كل التطبيق
    const root = document.documentElement;
    if (branding.brand_primary_color) {
      root.style.setProperty('--color-primary', branding.brand_primary_color);
    }
    if (branding.brand_accent_color) {
      root.style.setProperty('--color-accent', branding.brand_accent_color);
    }

    // تحديث عنوان الصفحة
    if (branding.brand_app_name) {
      document.title = branding.brand_app_name;
    }
  }, [branding]);

  return branding;
}
```

```css
/* src/index.css */
:root {
  --color-primary: #3b82f6;
  --color-accent:  #10b981;
}

/* Tailwind يستخدم الـ CSS variables */
.btn-primary  { background-color: var(--color-primary); }
.text-primary { color: var(--color-primary); }
.border-primary { border-color: var(--color-primary); }
```

---

### 🖼️ Logo Component

```tsx
// src/components/ui/AppLogo.tsx
interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
}

export function AppLogo({ size = 'md', showName = true }: AppLogoProps) {
  const branding = useBranding();
  const sizes = { sm: 'h-8', md: 'h-12', lg: 'h-20' };

  return (
    <div className="flex items-center gap-3">
      {branding?.brand_logo_path ? (
        // getAssetPath = IPC call تحول المسار لـ file:// URL
        <img
          src={`asset://${branding.brand_logo_path}`}
          className={`${sizes[size]} w-auto object-contain`}
          alt="logo"
        />
      ) : (
        // Default icon لو مفيش شعار
        <div className={`${sizes[size]} aspect-square rounded-xl bg-primary flex items-center justify-center text-white text-2xl`}>
          🏫
        </div>
      )}
      {showName && (
        <div>
          <p className="font-bold text-gray-900 dark:text-white">
            {branding?.brand_app_name ?? 'نظام الحضانة'}
          </p>
          {branding?.brand_tagline && (
            <p className="text-xs text-gray-500">{branding.brand_tagline}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

---

### 📤 Branding في الـ Exports (ExcelJS)

```javascript
// في exportService.js — كل export بيجيب الـ branding أولاً
async function getExportHeader(db) {
  const settings = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'brand_%'").all();
  const b = Object.fromEntries(settings.map(s => [s.key, s.value]));

  return {
    appName:  b.brand_app_name  ?? 'نظام إدارة الحضانة',
    orgName:  b.brand_org_name  ?? '',
    phone:    b.brand_phone     ?? '',
    address:  b.brand_address   ?? '',
    email:    b.brand_email     ?? '',
    logoPath: b.brand_logo_path ?? null,
  };
}

// إضافة الـ logo للـ Excel file
async function addLogoToWorkbook(workbook, worksheet, logoPath) {
  if (!logoPath || !fs.existsSync(logoPath)) return;

  const imageId = workbook.addImage({
    filename: logoPath,
    extension: 'png',
  });

  worksheet.addImage(imageId, {
    tl: { col: 0, row: 0 },
    ext: { width: 120, height: 60 },
  });
}
```

---

### 📦 electron-builder Config للأيقونة الديناميكية

```yaml
# electron-builder.yml
appId: com.nursery.management
productName: نظام إدارة الحضانة

# الأيقونة الافتراضية عند البناء
# (المستخدم يقدر يغييرها بعدين من داخل التطبيق)
win:
  icon: assets/branding/icon.ico
mac:
  icon: assets/branding/icon.icns
linux:
  icon: assets/branding/icon.png
```

> **ملاحظة مهمة للـ Claude Code:**  
> الأيقونة في الـ Taskbar بيتغير فوراً بـ `win.setIcon(newPath)` بدون restart.  
> لكن أيقونة الـ installer (.exe setup) بتتحدد وقت البناء من `electron-builder.yml`.  
> لو المستخدم عايز تغيير دايم في الـ installer، لازم يعيد البناء.

---

## 🏗️ Project Structure

```
nursery-system/
├── electron/
│   ├── main.js                    # Electron main process
│   ├── preload.js                 # IPC bridge (contextBridge)
│   └── ipc/
│       ├── childrenIPC.js
│       ├── salariesIPC.js
│       ├── expensesIPC.js
│       ├── paymentsIPC.js
│       ├── settingsIPC.js
│       ├── brandingIPC.js             # رفع logo/icon + حفظ ألوان
│       ├── exportIPC.js
│       └── syncIPC.js
│
├── src/
│   ├── main.tsx                   # React entry
│   ├── App.tsx                    # Router + i18n provider
│   ├── i18n/
│   │   ├── ar.json                # Arabic translations
│   │   └── en.json                # English translations
│   │
│   ├── components/                # Reusable Components
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Stat.tsx
│   │   │   ├── Alert.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   ├── Pagination.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── AppLogo.tsx            # الشعار الديناميكي
│   │   │   ├── ColorPicker.tsx        # color picker للـ branding
│   │   │   └── ImageUpload.tsx        # رفع الصور والأيقونات
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── LanguageSwitcher.tsx
│   │   │   └── RoleGuard.tsx
│   │   └── charts/
│   │       ├── RevenueChart.tsx   # Recharts line/bar
│   │       ├── CollectionDonut.tsx
│   │       └── MonthlyProfitBar.tsx
│   │
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx          # الداشبورد المالي الشامل
│   │   ├── Children/
│   │   │   ├── ChildrenList.tsx   # بيانات الأطفال
│   │   │   ├── ChildForm.tsx      # إضافة / تعديل طفل
│   │   │   └── ChildStatement.tsx # كشف حساب طفل
│   │   ├── Payments/
│   │   │   ├── MonthlyPayments.tsx # يناير → ديسمبر
│   │   │   └── PaymentRow.tsx
│   │   ├── Salaries/
│   │   │   ├── SalariesList.tsx   # شيت الرواتب
│   │   │   └── SalaryForm.tsx
│   │   ├── Expenses/
│   │   │   ├── ExpensesList.tsx   # المصروفات التشغيلية
│   │   │   └── ExpenseForm.tsx
│   │   ├── Target/
│   │   │   └── TargetPlanning.tsx # تخطيط التارجت
│   │   ├── Settings/
│   │   │   ├── Settings.tsx           # container بالتابات الـ 3
│   │   │   ├── PricingSettings.tsx    # Tab 1: الأسعار والأهداف
│   │   │   ├── BrandingSettings.tsx   # Tab 2: الهوية البصرية
│   │   │   └── SecuritySettings.tsx   # Tab 3: الأمان والمزامنة
│   │   ├── Storage/
│   │   │   └── StorageManager.tsx # إدارة قاعدة البيانات المحلية
│   │   └── Sync/
│   │       └── SyncManager.tsx    # مزامنة مع MongoDB
│   │
│   ├── store/                     # Zustand State Management
│   │   ├── useAuthStore.ts
│   │   ├── useChildrenStore.ts
│   │   ├── usePaymentsStore.ts
│   │   ├── useSalariesStore.ts
│   │   ├── useExpensesStore.ts
│   │   ├── useSettingsStore.ts
│   │   ├── useBrandingStore.ts        # الهوية البصرية state
│   │   └── useSyncStore.ts
│   │
│   ├── hooks/
│   │   ├── useLocalDB.ts          # SQLite/LowDB wrapper
│   │   ├── useExport.ts           # Excel export logic
│   │   ├── useSync.ts             # MongoDB sync
│   │   ├── useTranslation.ts      # i18n hook
│   │   ├── useDashboard.ts        # computed financial stats
│   │   └── useBranding.ts         # الهوية البصرية + CSS vars
│   │
│   ├── services/
│   │   ├── db.ts                  # better-sqlite3 operations
│   │   ├── mongoSync.ts           # MongoDB Atlas connection
│   │   ├── exportService.ts       # ExcelJS export
│   │   └── authService.ts         # JWT-based local auth
│   │
│   └── types/
│       ├── child.ts
│       ├── payment.ts
│       ├── salary.ts
│       ├── expense.ts
│       └── settings.ts
│
├── assets/
│   ├── branding/
│   │   ├── logo.png               # الشعار الحالي (يُرفع من الإعدادات)
│   │   ├── logo-dark.png          # نسخة للخلفية الداكنة (اختياري)
│   │   ├── icon.ico               # Windows taskbar icon
│   │   ├── icon.icns              # macOS icon
│   │   └── icon.png               # Linux + fallback
│   └── default-branding/          # نسخ احتياطية لا تُمس
│       ├── logo.png
│       └── icon.ico
│
├── database/
│   └── nursery.db                 # SQLite local database
│
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── electron-builder.yml
└── .env                           # MONGO_URI, JWT_SECRET
```

---

## 🗄️ Database Schema (SQLite - Local)

### Table: `children`
```sql
CREATE TABLE children (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  guardian    TEXT,
  guardian_phone TEXT,
  child_phone TEXT,
  national_id TEXT,
  service     TEXT CHECK(service IN ('حضانة','استضافة','جلسة')),
  unit        TEXT CHECK(unit IN ('شهر','يوم','ساعة','جلسة')),
  price       REAL,
  reg_date    TEXT,
  notes       TEXT,
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  synced      INTEGER DEFAULT 0
);
```

### Table: `payments`
```sql
CREATE TABLE payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id    INTEGER REFERENCES children(id),
  month       TEXT NOT NULL,            -- 'يناير', 'فبراير' ...
  year        INTEGER NOT NULL,
  service     TEXT,
  unit        TEXT,
  quantity    REAL DEFAULT 1,
  price       REAL,
  total       REAL,
  paid        REAL DEFAULT 0,
  balance     REAL,
  status      TEXT,                     -- 'paid','partial','unpaid'
  notes       TEXT,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  synced      INTEGER DEFAULT 0
);
```

### Table: `employees`
```sql
CREATE TABLE employees (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  role          TEXT,
  base_salary   REAL,
  housing       REAL DEFAULT 0,
  transport     REAL DEFAULT 0,
  net_salary    REAL,
  is_active     INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  synced        INTEGER DEFAULT 0
);
```

### Table: `salary_payments`
```sql
CREATE TABLE salary_payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  month       TEXT NOT NULL,
  year        INTEGER NOT NULL,
  bonus       REAL DEFAULT 0,
  deductions  REAL DEFAULT 0,
  actual_paid REAL,
  paid_date   TEXT,
  notes       TEXT,
  synced      INTEGER DEFAULT 0
);
```

### Table: `expenses`
```sql
CREATE TABLE expenses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item        TEXT NOT NULL,
  month       TEXT NOT NULL,
  year        INTEGER NOT NULL,
  amount      REAL,
  category    TEXT,
  notes       TEXT,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  synced      INTEGER DEFAULT 0
);
```

### Table: `settings`
```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- Keys: nursery_hourly, nursery_daily, nursery_monthly
--       hosting_hourly, hosting_daily, hosting_monthly
--       session_hourly, session_daily
--       target_profit_pct, max_capacity, work_days, work_hours
--       app_password, mongo_uri, last_sync
```

### Table: `users`
```sql
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,           -- bcrypt hashed
  role       TEXT CHECK(role IN ('admin','employee')),
  name       TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Table: `sync_log`
```sql
CREATE TABLE sync_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT,
  table_name TEXT,
  record_id  INTEGER,
  status     TEXT,
  error      TEXT,
  synced_at  TEXT
);
```

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "electron": "^28.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "zustand": "^4.4.0",
    "better-sqlite3": "^9.2.0",
    "exceljs": "^4.4.0",
    "mongoose": "^8.0.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.0",
    "recharts": "^2.9.0",
    "react-i18next": "^13.5.0",
    "i18next": "^23.7.0",
    "date-fns": "^2.30.0",
    "clsx": "^2.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "vite-plugin-electron": "^0.15.0",
    "tailwindcss": "^3.3.0",
    "electron-builder": "^24.0.0",
    "@types/react": "^18.2.0",
    "typescript": "^5.0.0"
  }
}
```

---

## 🎭 Roles & Permissions

### Admin
- ✅ كل الصلاحيات
- ✅ إضافة / تعديل / حذف أطفال وموظفين
- ✅ تعديل الأسعار والإعدادات
- ✅ مشاهدة الداشبورد الكامل
- ✅ Export Excel
- ✅ Sync مع MongoDB
- ✅ إدارة المستخدمين (Employee accounts)
- ✅ Storage Manager (backup/restore/clear)

### Employee
- ✅ مشاهدة بيانات الأطفال
- ✅ تسجيل المدفوعات الشهرية
- ✅ البحث وكشف حساب طفل
- ✅ Export كشف حساب طفل واحد
- ❌ لا يشوف الرواتب
- ❌ لا يعدل الإعدادات والأسعار
- ❌ لا يشوف Sync / Storage
- ❌ لا يحذف بيانات

---

## 📱 Pages Detail

### 1. Login Page
- حقلي Username + Password
- Language switcher (AR/EN)
- JWT token يُحفظ locally
- Auto-login لو token valid

### 2. Dashboard (الداشبورد)
يطابق شيت `📊 داشبورد` بالكامل:
- Month selector (dropdown يناير → ديسمبر)
- **KPI Cards:**
  - إجمالي الفواتير المستحقة
  - إجمالي المحصّل
  - المتأخرات
  - المصروفات التشغيلية
  - رواتب الشهر
  - نسبة التحصيل (progress bar)
- **Target Calculator:** كم محتاج تجيب عشان تكسب؟
- **Revenue by Service:** جدول حضانة / استضافة / جلسة
- **12-Month Summary Table:** المحصّل · المصروفات · صافي الربح · الحالة
- **Smart Alerts:** تنبيهات ذكية (هل وصلت للتارجت؟ متأخرات؟ نسبة تحصيل؟)
- **Charts:**
  - Bar Chart: المحصّل vs المصروفات شهرياً
  - Donut: توزيع الإيرادات حسب الخدمة

### 3. Children (بيانات الأطفال)
يطابق شيت `👶 بيانات الأطفال`:
- جدول 100 طفل قابل للـ sort والـ filter
- Search بـ: اسم الطفل / ولي الأمر / رقم هاتف / رقم قومي
- Filter بـ: الخدمة (حضانة/استضافة/جلسة)
- Add / Edit / Delete (Admin فقط)
- Export الجدول كـ Excel
- كل صف فيه زر "كشف الحساب"

#### ChildForm Fields:
```
- اسم الطفل *
- اسم ولي الأمر *
- رقم هاتف ولي الأمر *
- رقم هاتف الطفل
- الرقم القومي
- الخدمة (select: حضانة/استضافة/جلسة)
- الوحدة (auto based on service: شهر/يوم/ساعة/جلسة)
- السعر (auto from settings, editable)
- تاريخ التسجيل
- ملاحظات
```

### 4. Monthly Payments (المتابعة الشهرية)
يطابق شيتات `يناير → ديسمبر`:
- Month/Year selector
- جدول كل الأطفال للشهر المختار
- كل صف:
  - اسم الطفل · الخدمة · الوحدة · الكمية (editable) · السعر · الإجمالي
  - المدفوع (input) → يحسب الرصيد تلقائياً
  - Status badge (❌ لم يُدفع / ✅ مدفوع / ⚠️ جزئي)
  - ملاحظات
- Bulk: تحديد كل / إلغاء تحديد
- Quick payment: "تسجيل دفع كامل" لأكثر من طفل
- Summary bar: إجمالي مستحق · محصّل · متأخرات
- Export شيت الشهر كـ Excel

### 5. Child Statement (كشف حساب)
يطابق شيت `📄 كشف حساب`:
- بيانات الطفل الكاملة في الأعلى
- جدول 12 شهر: الخدمة · الكمية · السعر · الإجمالي · المدفوع · الرصيد · الحالة
- الإجمالي الكلي من تاريخ التسجيل
- إحصائيات: شهور نشطة · مدفوع · متأخر
- Export PDF + Excel للكشف

### 6. Salaries (الرواتب)
يطابق شيت `👔 الرواتب`:
- جدول 11 موظف
- كل موظف: الاسم · الوظيفة · الراتب الأساسي · بدل سكن · بدل مواصلات · حوافز · خصومات · صافي
- 12 column للأشهر (editable per month)
- إجمالي شهري في الأسفل
- Add/Edit/Delete موظف (Admin فقط)
- Export كـ Excel

### 7. Expenses (المصروفات)
يطابق شيت `💸 المصروفات`:
- جدول البنود (11 بند ثابت + قابل للإضافة)
- كل بند: اسم البند + 12 خانة شهرية + الإجمالي السنوي
- Editable per cell
- Add/Delete بنود
- إجمالي المصروفات التشغيلية
- إجمالي الكل (مصروفات + رواتب) - auto calculated
- Export كـ Excel

### 8. Target Planning (تخطيط التارجت)
يطابق شيت `🎯 تخطيط التارجت`:
- جدول 12 شهر: المصروفات · نسبة الربح المستهدفة (editable) · التارجت · المحصّل · الفجوة · الحالة
- Smart suggestions section: لكل خدمة كم وحدة محتاج
- Custom Distribution Calculator:
  - أدخل عدد أطفال/جلسات/أيام لكل خدمة
  - يحسب الإيراد المتوقع تلقائياً
  - Progress bar للتغطية
- Export كـ Excel

### 9. Settings (الإعدادات)
يطابق شيت `⚙️ الإعدادات` — **3 تابات:**

**Tab 1: 💰 الأسعار والأهداف**
- أسعار الخدمات (بالساعة/اليوم/الشهر) لكل خدمة
- نسبة الربح المستهدفة %
- الطاقة الاستيعابية القصوى
- عدد أيام/ساعات العمل
- Reference table: السعر المحسوب تلقائياً

**Tab 2: 🎨 الهوية البصرية (Admin فقط)**
- اسم التطبيق + اسم المؤسسة + Tagline
- رفع شعار (Logo) PNG/SVG — معاينة فورية
- رفع أيقونة التطبيق .ico/.png — تتطبق فوراً في Taskbar
- Color picker للـ Primary + Accent colors — تتطبق فوراً
- معلومات التواصل (هاتف / عنوان / إيميل) تظهر في الـ exports
- زر "استعادة الإعدادات الافتراضية"

**Tab 3: 🔒 الأمان والمزامنة (Admin فقط)**
- App Password (تعديل كلمة السر)
- MongoDB URI
- إعدادات الـ Auto-sync

### 10. Storage Manager
- إحصائيات DB: عدد الأطفال · المدفوعات · الموظفين · المصروفات
- Database size
- **Backup:** تصدير قاعدة البيانات كـ `.db` أو `.json`
- **Restore:** استيراد backup
- **Import from Excel:** رفع الـ Excel الأصلي واستيراد بياناته
- **Clear Data:** حذف بيانات (Admin فقط، مع تأكيد)
- Audit log: آخر 50 عملية

### 11. Sync Manager (Admin فقط)
- MongoDB connection status (connected/disconnected)
- آخر مزامنة (timestamp)
- **Manual Sync:** رفع كل البيانات المحلية لـ MongoDB
- **Pull from Cloud:** جلب أحدث البيانات
- **Sync Status:** جدول بـ pending/synced records per table
- Conflict resolution strategy (local wins / cloud wins)
- Auto-sync toggle (كل X دقيقة)

---

## 📤 Export System (ExcelJS)

### Export Capabilities:
```
1. Full Export - نفس شكل الـ Excel الأصلي:
   - شيت الداشبورد بالأرقام المحسوبة
   - شيت الإعدادات
   - شيت بيانات الأطفال
   - شيت الرواتب
   - شيت المصروفات
   - شيت كشف الحساب
   - شيت تخطيط التارجت
   - شيتات الأشهر 12 (يناير → ديسمبر)

2. Partial Exports:
   - شيت شهر محدد فقط
   - كشف حساب طفل واحد (PDF + Excel)
   - تقرير الرواتب شهر محدد
   - تقرير المصروفات
   - تقرير الداشبورد السنوي

3. Export Options:
   - اختيار الشهر أو السنة
   - اختيار format: .xlsx أو .pdf
   - اختيار اللغة (AR/EN) للـ headers
```

### ExcelJS Styling (نفس الملف الأصلي):
```javascript
// Header cells: bold, colored background
// RTL direction for Arabic sheets
// Number format: #,##0.00
// Status colors: red for unpaid, green for paid
// Summary rows: bold with borders
// Emoji in headers preserved
```

---

## 🔄 MongoDB Sync Strategy

### Collections (نفس جداول SQLite):
```
- nursery_children
- nursery_payments
- nursery_employees
- nursery_salary_payments
- nursery_expenses
- nursery_settings
- nursery_sync_log
```

### Sync Logic:
```javascript
// Each record has: synced (0/1) + updated_at
// On Push: filter WHERE synced = 0, upsert to MongoDB
// On Pull: fetch records with updated_at > last_sync
// Conflict: last-write-wins based on updated_at
// After sync: UPDATE synced = 1 for pushed records
```

### Admin MongoDB Dashboard:
- Real-time connection status
- Total records per collection
- Last sync time
- Charts: data growth over time
- Multi-branch support (future): filter by branch_id

---

## 🌐 i18n (Arabic / English)

```json
// ar.json sample
{
  "dashboard": "الداشبورد",
  "children": "الأطفال",
  "monthly_payments": "المتابعة الشهرية",
  "salaries": "الرواتب",
  "expenses": "المصروفات",
  "target": "التارجت",
  "settings": "الإعدادات",
  "total_invoiced": "إجمالي الفواتير",
  "collected": "المحصّل",
  "arrears": "المتأخرات",
  "paid": "مدفوع",
  "unpaid": "لم يُدفع",
  "partial": "جزئي",
  "export": "تصدير",
  "sync": "مزامنة",
  "add_child": "إضافة طفل",
  "months": {
    "يناير": "January",
    "فبراير": "February",
    ...
  }
}
```

**RTL/LTR handling:**
- `dir="rtl"` على الـ HTML لما اللغة عربي
- Tailwind `rtl:` variants للـ spacing
- Font: Cairo للعربي, Inter للإنجليزي

---

## 🎨 UI Design System (Tailwind)

```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{tsx,ts}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          900: '#1e3a8a'
        },
        success: '#22c55e',
        danger: '#ef4444',
        warning: '#f59e0b'
      },
      fontFamily: {
        ar: ['Cairo', 'sans-serif'],
        en: ['Inter', 'sans-serif']
      }
    }
  }
}
```

### Reusable Components Spec:
```tsx
// Button variants: primary | secondary | danger | ghost
<Button variant="primary" size="sm|md|lg" loading={false} />

// Badge for payment status
<Badge status="paid|unpaid|partial" />

// Stat card for dashboard KPIs
<Stat label="المحصّل" value={0} currency trend={+5.2} />

// Data table with sort/filter
<Table columns={[...]} data={[...]} sortable filterable exportable />

// Search bar with debounce
<SearchBar onSearch={fn} placeholder="ابحث..." />

// Modal with confirm dialog
<Modal title="..." onClose={fn} size="sm|md|lg" />

// Month/Year selector
<MonthSelector value={month} onChange={fn} />
```

---

## 🔧 IPC Architecture (Electron)

```javascript
// preload.js - exposed APIs
window.api = {
  // Children
  getChildren: (filters) => ipcRenderer.invoke('children:get', filters),
  addChild: (data) => ipcRenderer.invoke('children:add', data),
  updateChild: (id, data) => ipcRenderer.invoke('children:update', id, data),
  deleteChild: (id) => ipcRenderer.invoke('children:delete', id),

  // Payments
  getPayments: (month, year) => ipcRenderer.invoke('payments:get', month, year),
  updatePayment: (id, paid) => ipcRenderer.invoke('payments:update', id, paid),
  generateMonthPayments: (month, year) => ipcRenderer.invoke('payments:generate', month, year),

  // Salaries
  getEmployees: () => ipcRenderer.invoke('employees:get'),
  updateSalaryPayment: (data) => ipcRenderer.invoke('salary:update', data),

  // Expenses
  getExpenses: (year) => ipcRenderer.invoke('expenses:get', year),
  updateExpense: (data) => ipcRenderer.invoke('expenses:update', data),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (data) => ipcRenderer.invoke('settings:update', data),

  // Export
  exportFull: (year) => ipcRenderer.invoke('export:full', year),
  exportMonth: (month, year) => ipcRenderer.invoke('export:month', month, year),
  exportChildStatement: (childId) => ipcRenderer.invoke('export:child', childId),

  // Sync
  syncToMongo: () => ipcRenderer.invoke('sync:push'),
  syncFromMongo: () => ipcRenderer.invoke('sync:pull'),
  getSyncStatus: () => ipcRenderer.invoke('sync:status'),

  // Storage
  backupDB: () => ipcRenderer.invoke('storage:backup'),
  restoreDB: (path) => ipcRenderer.invoke('storage:restore', path),
  importFromExcel: (path) => ipcRenderer.invoke('storage:import', path),
  getDBStats: () => ipcRenderer.invoke('storage:stats'),

  // Auth
  login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getCurrentUser: () => ipcRenderer.invoke('auth:current'),

  // Branding (Admin only)
  getBranding: () => ipcRenderer.invoke('branding:get'),
  saveBranding: (data) => ipcRenderer.invoke('branding:save', data),
  uploadLogo: () => ipcRenderer.invoke('branding:upload-logo'),
  uploadIcon: () => ipcRenderer.invoke('branding:upload-icon'),
  resetBranding: () => ipcRenderer.invoke('branding:reset'),
}
```

---

## 🚀 Development Phases

### Phase 1 - Foundation (3-4 days)
```
✅ Electron + React + Vite + Tailwind setup
✅ SQLite database setup (better-sqlite3)
✅ IPC architecture (main ↔ renderer)
✅ Auth system (login, roles, JWT)
✅ i18n setup (AR/EN)
✅ Layout: Sidebar + Header + Router
✅ Reusable UI components
✅ Branding system: CSS variables + useBranding hook
✅ AppLogo component + default assets/branding files
```

### Phase 2 - Core Features (5-7 days)
```
✅ Children CRUD (list, add, edit, delete)
✅ Monthly payments tracking (12 months)
✅ Child statement page
✅ Dashboard with computed KPIs
✅ Settings page
```

### Phase 3 - Financial Modules (3-4 days)
```
✅ Salaries management
✅ Expenses management
✅ Target planning with smart calculator
✅ Dashboard charts (Recharts)
✅ Settings page — Tab 2 Branding (upload logo, icon, color picker)
```

### Phase 4 - Export & Storage (2-3 days)
```
✅ ExcelJS: full export (matches original file)
✅ ExcelJS: partial exports (month, child, salaries)
✅ Storage Manager (backup/restore/import)
✅ Import from Excel (parse original file)
```

### Phase 5 - MongoDB Sync (2-3 days)
```
✅ MongoDB Atlas connection
✅ Sync push/pull logic
✅ Admin sync dashboard
✅ Auto-sync with conflict resolution
```

### Phase 6 - Polish (2-3 days)
```
✅ RTL/LTR fully tested
✅ Error handling & loading states
✅ Keyboard shortcuts
✅ Print stylesheets
✅ electron-builder packaging (.exe / .dmg)
```

---

## 📝 Claude Code Instructions

### Step 1: Init project
```bash
npm create vite@latest nursery-system -- --template react-ts
cd nursery-system
npm install electron vite-plugin-electron
npm install tailwindcss postcss autoprefixer
npx tailwindcss init
npm install zustand react-router-dom react-i18next i18next
npm install better-sqlite3 exceljs bcryptjs jsonwebtoken
npm install recharts date-fns clsx
npm install --save-dev electron-builder @types/better-sqlite3
```

### Step 2: Build electron/main.js first
- Setup BrowserWindow with RTL support
- Register all IPC handlers
- Setup SQLite with schema migrations

### Step 3: Build components bottom-up
1. UI primitives (Button, Input, Badge, Card)
2. Layout (Sidebar, Header)
3. Pages in order: Login → Dashboard → Children → Payments → ...

### Step 4: Wire IPC in each page
- Each page calls `window.api.*` methods
- Zustand store holds the state
- React Query (optional) for caching

### Step 5: Export
- ExcelJS in main process (not renderer)
- Trigger via IPC, open save dialog with `dialog.showSaveDialog`

### Step 6: MongoDB
- Use mongoose in main process
- Store URI in settings table (encrypted)

---

## ⚠️ Important Notes for Claude Code

1. **Never use localStorage** — all data goes to SQLite via IPC
2. **better-sqlite3 runs in main process only** — never import in renderer
3. **ExcelJS in main process** — too heavy for renderer
4. **RTL**: use `document.documentElement.dir = 'rtl'` when language = AR
5. **Arabic months** mapping: `['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']`
6. **Payment generation**: when a new month starts, auto-generate payment rows for all active children based on their service/price
7. **Price override**: employee can edit `quantity` and `paid` only — price comes from settings
8. **Admin password**: stored hashed in settings table — default `1234` (from original Excel)
9. **Export must match original**: same sheet names (Arabic with emojis), same column structure, same formatting
10. **Branding — local file path**: Logo/icon المرفوعة تُحفظ في `assets/branding/` داخل app directory — استخدم `app.getAppPath()` للمسار
11. **Branding — serve local images**: في Electron لازم تسجّل `protocol.registerFileProtocol('asset', ...)` عشان الـ React يعرض `asset://` URLs
12. **Branding — icon update**: `win.setIcon(path)` بيشتغل فوراً على Windows/Linux — على macOS استخدم `app.dock.setIcon(path)`
13. **Branding — colors**: الألوان بتتحفظ في DB وبتتحمل كـ CSS variables عند startup — أضف `useBranding()` في `App.tsx` مباشرةً
14. **Branding — export**: كل export يجيب `brand_org_name`, `brand_phone`, `brand_address` من settings ويضيفهم في أول صف في الـ Excel

---

## 🎯 Key Business Logic

### Dashboard Calculations:
```javascript
// Total invoiced for month
totalInvoiced = payments.filter(m === month).reduce(sum of total)

// Collection rate
collectionRate = totalPaid / totalInvoiced * 100

// Target required
targetRequired = totalExpenses / (1 - targetProfitPct)

// Gap
gap = targetRequired - totalCollected

// Monthly profit
netProfit = totalCollected - (operationalExpenses + salaries)
```

### Smart Target Calculator:
```javascript
// For each service, units needed to hit target alone:
unitsNeeded = targetRequired / servicePrice

// Coverage percentage with custom distribution:
coveragePct = (nursery * nurseryPrice + hosting * hostingPrice + sessions * sessionPrice) / targetRequired * 100
```

### Child Statement:
```javascript
// For each month from reg_date to now:
statement = months.map(m => ({
  month: m,
  service: child.service,
  unit: child.unit,
  quantity: payments[m]?.quantity ?? defaultQty,
  price: child.price,
  total: quantity * price,
  paid: payments[m]?.paid ?? 0,
  balance: total - paid,
  status: paid === 0 ? 'unpaid' : paid < total ? 'partial' : 'paid'
}))
```

---

*Plan generated from: Nursery_V4_Final_5.xlsx — 19 sheets analyzed*  
*System: Nursery & Autism Center Financial Management*
