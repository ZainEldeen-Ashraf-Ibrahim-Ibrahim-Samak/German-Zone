# Manual Test Cases — Nursery Management System

> **How to use this document**
> Each test case has an ID, precondition, steps, and expected result.
> Tick the `[ ]` checkbox when you run the test, then mark the result column ✅ Pass / ❌ Fail / ⏭ Skip.
> Language: the UI is Arabic-first; steps describe Arabic labels where the UI shows them.

---

## 1  Authentication (TC-AUTH)

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-AUTH-001 | Login with valid admin credentials | App is open on login screen | 1. Enter username `admin` 2. Enter password `admin123` 3. Click login | Dashboard loads; header shows admin name | |
| [ ] | TC-AUTH-002 | Login with wrong password | Login screen | 1. Enter `admin` / `wrong123` 2. Click login | Error toast "اسم المستخدم أو كلمة المرور غير صحيحة"; stay on login | |
| [ ] | TC-AUTH-003 | Login with non-existent username | Login screen | 1. Enter `nobody` / `any` 2. Click login | Same error toast as TC-AUTH-002 | |
| [ ] | TC-AUTH-004 | Login with deactivated account | Admin has deactivated a user account | 1. Login as deactivated user | Error toast "تم إلغاء تنشيط هذا الحساب" | |
| [ ] | TC-AUTH-005 | Login with employee credentials | An employee account exists | 1. Login as employee | Dashboard loads; admin-only sidebar items are hidden | |
| [ ] | TC-AUTH-006 | Logout | Logged in as admin | 1. Click logout button in header | Returns to login screen; session cleared | |
| [ ] | TC-AUTH-007 | Session persists after browser refresh | Logged in; token stored | 1. Reload the Electron window (Ctrl+R) | Still logged in; current user shown in header | |
| [ ] | TC-AUTH-008 | Empty username/password blocked | Login screen | 1. Click login without typing anything | Validation error; no API call | |
| [ ] | TC-AUTH-009 | Login is case-sensitive (username) | Admin account exists | 1. Try `Admin` (capital A) | Should fail (username is case-sensitive) | |

---

## 2  Dashboard (TC-DASH)

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-DASH-001 | Dashboard loads without data | Logged in; no payments/expenses for selected month | 1. Open dashboard 2. Select current month | All KPIs show 0; no alerts related to arrears | |
| [ ] | TC-DASH-002 | Invoiced KPI matches generated payments | Payments generated for 3 children at 2500 EGP each | 1. Open dashboard for that month | Invoiced = 7500 EGP | |
| [ ] | TC-DASH-003 | Collected KPI reflects actual paid amounts | Two children partially paid | 1. Open dashboard | Collected = sum of paid amounts | |
| [ ] | TC-DASH-004 | Arrears KPI excludes credit balances | One child overpaid (negative balance) | 1. Open dashboard | Arrears = only positive balances summed | |
| [ ] | TC-DASH-005 | Net profit = collected − expenses − salaries | Known amounts for month | 1. Open dashboard | netProfit = collected − expensesTotal − salariesTotal | |
| [ ] | TC-DASH-006 | Target gap alert shown when below target | Expenses set; little collection | 1. Open dashboard | Warning alert mentioning gap amount | |
| [ ] | TC-DASH-007 | Arrears danger alert shown | Unpaid payments exist | 1. Open dashboard | Red alert showing arrears amount | |
| [ ] | TC-DASH-008 | Low collection rate info alert shown | Collection < 80% | 1. Open dashboard | Info alert showing collection percentage | |
| [ ] | TC-DASH-009 | 12-month summary chart renders | Full year has data | 1. Open dashboard | Bar/line chart shows 12 bars/months | |
| [ ] | TC-DASH-010 | Revenue by service donut shows 3 segments | Payments exist for all 3 service types | 1. Open dashboard | Donut chart shows حضانة, استضافة, جلسة segments | |
| [ ] | TC-DASH-011 | Month/year selector changes data | Dashboard open | 1. Change month dropdown to previous month | All KPIs and charts re-fetch for selected month | |
| [ ] | TC-DASH-012 | Employee sees dashboard but not expenses or salaries | Logged in as employee | 1. Open dashboard | KPIs visible; expenses/salaries tabs hidden in sidebar | |
| [ ] | TC-DASH-013 | Collection rate is 100% when all paid | All payments paid | 1. Open dashboard | collectionRate = 1.00 (100%) | |

---

## 3  Children Management (TC-CHLD)

### 3.1  Children List

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-CHLD-001 | List loads with all active children | At least 2 active children exist | 1. Open children list | Table shows all active children | |
| [ ] | TC-CHLD-002 | Inactive children hidden by default | One child is inactive | 1. Open children list | Inactive child not shown; toggle "عرض غير النشطين" to show | |
| [ ] | TC-CHLD-003 | Search by name (Arabic) | Children with Arabic names | 1. Type partial name in search box | Matching children shown; non-matches hidden | |
| [ ] | TC-CHLD-004 | Filter by service type | Children with different services | 1. Select "حضانة" from service dropdown | Only nursery children shown | |
| [ ] | TC-CHLD-005 | Search + service filter combined | Mixed data | 1. Search name AND select service | Only children matching both criteria shown | |
| [ ] | TC-CHLD-006 | Search is case-insensitive for English names | English name child exists | 1. Type lowercase version | Child found | |

### 3.2  Add Child

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-CHLD-007 | Add child with nursery service (admin) | Logged in as admin | 1. Click Add 2. Fill all fields 3. Submit | Child appears in list; service type shown | |
| [ ] | TC-CHLD-008 | Add child with session service (employee) | Logged in as employee | 1. Click Add 2. Fill fields with جلسة service | Child added; employee can add but not edit | |
| [ ] | TC-CHLD-009 | Guardian phone validation — too short | Add child form | 1. Enter phone `0101234` (7 digits) 2. Submit | Validation error "رقم هاتف ولي الأمر يجب أن يتكوّن من 11 رقماً" | |
| [ ] | TC-CHLD-010 | Guardian phone validation — not starting with 01 | Add child form | 1. Enter `02012345678` | Validation error | |
| [ ] | TC-CHLD-011 | Guardian phone validation — valid | Add child form | 1. Enter `01012345678` | Accepted | |
| [ ] | TC-CHLD-012 | Required fields enforced | Add child form | 1. Leave name empty 2. Submit | Validation error on name field | |
| [ ] | TC-CHLD-013 | Extra lessons add to monthly fee | Add child form | 1. Set session_price=100 2. Set extra_lessons=2 | monthly_fee preview = (8+2)×100 = 1000 | |
| [ ] | TC-CHLD-014 | Session price cannot be negative | Add child form | 1. Enter session_price = -50 | Validation error | |
| [ ] | TC-CHLD-015 | Lesson days multi-select | Add child form | 1. Select Sunday and Tuesday from lesson days | Saved as JSON array; shown as tags | |
| [ ] | TC-CHLD-016 | Teacher assignment | Teachers exist | 1. Select a teacher from dropdown | teacher_id saved; teacher name shown in list | |
| [ ] | TC-CHLD-017 | Photo upload | Add child form | 1. Upload photo via camera/file | Photo thumbnail shown; photo_url stored | |
| [ ] | TC-CHLD-018 | Multi-service enrollment | Add child form | 1. Add two services (حضانة + جلسة) | Both service rows appear in child_services | |
| [ ] | TC-CHLD-019 | Duplicate child name allowed | Same name child exists | 1. Add child with same name | Allowed (no unique constraint on name) | |

### 3.3  Edit Child

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-CHLD-020 | Admin can edit child | Admin logged in; child exists | 1. Click edit 2. Change name 3. Save | Updated name shown in list | |
| [ ] | TC-CHLD-021 | Employee cannot edit child | Employee logged in | 1. Click edit button | Forbidden error or button hidden | |
| [ ] | TC-CHLD-022 | Deactivate child | Admin logged in | 1. Toggle child to inactive | Child disappears from active list | |
| [ ] | TC-CHLD-023 | Reactivate child | Inactive child exists | 1. Show inactive, toggle active | Child reappears in active list | |

### 3.4  Child Statement

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-CHLD-024 | Statement shows all months from reg_date | Child registered Feb 2026; current month Jun 2026 | 1. Open child statement | 5 rows: Feb, Mar, Apr, May, Jun 2026 | |
| [ ] | TC-CHLD-025 | Paid months show correct amounts | Payments recorded for March | 1. Open statement | March row shows paid amount and "paid" badge | |
| [ ] | TC-CHLD-026 | Unpaid months show zero and unpaid status | No payment for April | 1. Open statement | April row shows 0 paid, "unpaid" badge | |
| [ ] | TC-CHLD-027 | Summary totals correct | 3 months × 2500; 2 months paid | 1. Open statement | totalInvoiced = 7500; totalCollected = 5000; balance = 2500 | |
| [ ] | TC-CHLD-028 | Export statement to PDF | Child statement open | 1. Click Export PDF | PDF generated; downloads/opens | |

---

## 4  Monthly Payments (TC-PAY)

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-PAY-001 | Generate payments for current month | Active children exist | 1. Select month/year 2. Click Generate | One payment row per active child per service | |
| [ ] | TC-PAY-002 | Generate is idempotent (no duplicates) | Payments already generated | 1. Click Generate again | No new rows created; created=0 in response | |
| [ ] | TC-PAY-003 | Inactive children excluded from generation | One inactive child | 1. Generate payments | No payment row for inactive child | |
| [ ] | TC-PAY-004 | Payment row shows correct total (quantity × price) | Payment generated | 1. View payment grid | total = quantity × price | |
| [ ] | TC-PAY-005 | Update paid amount | Payment row shown | 1. Enter paid amount in row 2. Save | balance recalculated; status updated | |
| [ ] | TC-PAY-006 | Status changes to "partial" on partial payment | total = 2500 | 1. Enter paid = 1000 | Status = "partial"; balance = 1500 | |
| [ ] | TC-PAY-007 | Status changes to "paid" on full payment | total = 2500 | 1. Enter paid = 2500 | Status = "paid"; balance = 0 | |
| [ ] | TC-PAY-008 | Overpayment creates negative balance | total = 2500 | 1. Enter paid = 3000 | Status = "paid"; balance = −500 | |
| [ ] | TC-PAY-009 | Client cannot change price (server recalculates) | Payment exists at price 2000 | 1. Intercept and send price=1 | Server ignores client price; uses stored price | |
| [ ] | TC-PAY-010 | Bulk pay marks all selected as paid | Multiple unpaid payments | 1. Select all rows 2. Click bulk pay | All selected rows → paid, balance = 0 | |
| [ ] | TC-PAY-011 | Month/year selector filters payments | Payments in Jan and Feb | 1. Select January | Only January payments shown | |
| [ ] | TC-PAY-012 | Summary row shows totals | 3 children with varying paid | 1. View summary at bottom | totalInvoiced, totalCollected, arrears correct | |
| [ ] | TC-PAY-013 | Employee can view and update payments | Employee logged in | 1. Open payments page | Payments visible; update allowed | |
| [ ] | TC-PAY-014 | Notes field saved with payment | Update payment | 1. Enter notes 2. Save | Notes visible in payment row | |

---

## 5  Salaries (TC-SAL)

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-SAL-001 | Salary list blocked for employees | Employee session | 1. Navigate to salaries | FORBIDDEN error or page hidden | |
| [ ] | TC-SAL-002 | Admin sees employees salary grid | Admin session; employees exist | 1. Open salaries page | Grid shows one row per employee | |
| [ ] | TC-SAL-003 | net_salary = base + housing + transport | Employee added with those values | 1. View salary row | net_salary displayed correctly | |
| [ ] | TC-SAL-004 | Update bonus increases actual_paid | Employee net_salary = 3000 | 1. Set bonus = 500 2. Save | actual_paid = 3500 | |
| [ ] | TC-SAL-005 | Update deductions decreases actual_paid | net_salary = 3000, bonus = 500 | 1. Set deductions = 200 2. Save | actual_paid = 3300 | |
| [ ] | TC-SAL-006 | Pay date recorded when salary marked paid | Salary row | 1. Mark as paid; pick date | pay_date stored and shown | |
| [ ] | TC-SAL-007 | Month/year selector changes salary grid | Salary for Jan and Feb | 1. Select February | Only Feb salary rows shown | |
| [ ] | TC-SAL-008 | Notes saved with salary | Salary update form | 1. Enter notes 2. Save | Notes shown in grid row | |
| [ ] | TC-SAL-009 | Deactivated employee shown with 0 salary | Deactivated employee | 1. Open salaries | Deactivated employees not shown in grid | |

---

## 6  Expenses (TC-EXP)

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-EXP-001 | Expenses blocked for employees | Employee session | 1. Navigate to expenses | FORBIDDEN error | |
| [ ] | TC-EXP-002 | Admin sees 12-month expense grid | Expense items exist | 1. Open expenses | Grid: rows = items, columns = 12 months | |
| [ ] | TC-EXP-003 | Add new expense item | Admin session | 1. Click "إضافة بند" 2. Enter item name 3. Confirm | New row appears with 0 for all months | |
| [ ] | TC-EXP-004 | Enter amount for month | Expense item row visible | 1. Click cell for March 2. Enter 3500 3. Tab or click away | Amount saved; row totals update | |
| [ ] | TC-EXP-005 | Update amount (upsert, not duplicate) | Amount already entered | 1. Click same cell 2. Change amount | Old amount replaced; no duplicate row | |
| [ ] | TC-EXP-006 | Remove expense item | Item exists with amounts | 1. Click remove on item | Item row and all its amounts deleted | |
| [ ] | TC-EXP-007 | Annual total shown per item | 12 months entered | 1. View row total column | Sum of all 12 months shown | |
| [ ] | TC-EXP-008 | Category saved with item | Add item with category "ثابت" | 1. Add item 2. Set category | Category shown in row | |
| [ ] | TC-EXP-009 | Zero amounts shown for missing months | Item with only 3 months filled | 1. View grid | Remaining 9 months show 0 | |
| [ ] | TC-EXP-010 | Year switcher changes grid | Expenses in 2025 and 2026 | 1. Switch to 2025 | Grid shows only 2025 data | |

---

## 7  Target Planning (TC-TGT)

### 7.1  Year Selector

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-TGT-001 | Year selector defaults to current year | Admin session; open Target page | 1. Open تخطيط الأهداف المالية | Year dropdown shows current year (e.g. 2026) | |
| [ ] | TC-TGT-002 | Selecting a different year reloads all data | Target page open; data exists for multiple years | 1. Change year dropdown to 2025 | 12-month table rows and annual KPIs update to 2025 data | |
| [ ] | TC-TGT-003 | Year dropdown lists 2024–2030 | Target page open | 1. Click the year dropdown | Options: 2024, 2025, 2026, 2027, 2028, 2029, 2030 | |
| [ ] | TC-TGT-004 | Annual KPIs recalculate when year changes | Data for 2025 and 2026 differs | 1. Switch year | Annual Collected, Expenses, Target Required, Gap all update | |
| [ ] | TC-TGT-005 | Loading state shown while fetching | Target page; slow connection simulated | 1. Change year | Table shows loading indicator; no stale data shown | |

### 7.2  Monthly Table

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-TGT-006 | Table shows all 12 Arabic months | Any year | 1. Open Target page | 12 rows: يناير → ديسمبر | |
| [ ] | TC-TGT-007 | Months shown in English when UI is English | Switch to English | 1. Open Target page | January → December | |
| [ ] | TC-TGT-008 | Required revenue calculated from expenses + profit % | expenses = 10000, target profit % = 20% | 1. View table for that month | targetRequired = 10000 / (1-0.20) = 12500 | |
| [ ] | TC-TGT-009 | Gap shows shortfall when collected < required | Required = 12500; collected = 8000 | 1. View gap column | gap = 4500 | |
| [ ] | TC-TGT-010 | Gap shows "—" when target met | Collected ≥ required | 1. View gap column | "—" in gap cell; green status badge | |
| [ ] | TC-TGT-011 | Coverage bar fills proportionally | 50% collection vs target | 1. View coverage column | Progress bar roughly half-filled | |
| [ ] | TC-TGT-012 | Coverage bar fills left-to-right in Arabic mode | UI in Arabic (RTL) | 1. View coverage bar | Bar still fills from LEFT; not reversed | |
| [ ] | TC-TGT-013 | Status "met" badge shown when gap = 0 | Target met | 1. View status column | Green ✅ محقق badge | |
| [ ] | TC-TGT-014 | Status "missed" badge shown when gap > 0 | Target not met | 1. View status column | Amber ⚠️ لم يتحقق badge | |
| [ ] | TC-TGT-015 | Footer row shows annual totals | Any year with data | 1. Scroll to bottom of table | Totals row with bold annual sums | |

### 7.3  Capacity & Revenue Planner

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-TGT-016 | Capacity preview appears when classrooms + capacity entered | Target page | 1. Enter 5 classrooms, 10 capacity | Preview banner shows "إجمالي الطاقة الاستيعابية: 50 طفل" | |
| [ ] | TC-TGT-017 | Capacity plan calculates correctly | Enter 5 classrooms, 10 capacity, 8 staff, 50000 revenue goal | 1. Click "احسب خطة التوزيع المثلى" | Results panel shows capacity=50, per-service scenarios, recommended mix | |
| [ ] | TC-TGT-018 | Feasibility badge green when children needed ≤ capacity | Small revenue goal vs large capacity | 1. Run calculation | "✅ ضمن الطاقة" badge on all services | |
| [ ] | TC-TGT-019 | Feasibility badge red when children needed > capacity | Large revenue goal vs small capacity | 1. Run calculation | "❌ يتجاوز الطاقة" badge on over-capacity services | |
| [ ] | TC-TGT-020 | Revenue gap card shown when capacity can't reach goal | recommendedRevenue < desiredRevenue | 1. Run calculation | Red "⚠️ فجوة في الإيراد" card with gap amount | |
| [ ] | TC-TGT-021 | Surplus card shown when capacity exceeds goal | recommendedRevenue ≥ desiredRevenue | 1. Run calculation | Green "✅ طاقتك تفوق الهدف" card | |
| [ ] | TC-TGT-022 | Utilisation bars fill left-to-right in Arabic mode | UI in Arabic | 1. Run capacity plan; view scenario bars | All capacity bars fill from LEFT (not reversed) | |
| [ ] | TC-TGT-023 | Target page blocked for employees | Employee session | 1. Navigate to target | FORBIDDEN error or page hidden | |

### 7.4  Manual Distribution Calculator

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-TGT-024 | Year selector defaults to current year | Target page open; Manual Distribution card | 1. View Year dropdown in the card | Shows current year (e.g. 2026) | |
| [ ] | TC-TGT-025 | Selecting a past year uses that year's cost data | Expenses/salaries entered for 2025 | 1. Set Year to 2025; set Month to يناير 2. Click Calculate | targetRequired reflects 2025 costs, not 2026 | |
| [ ] | TC-TGT-026 | Selecting a future year with no cost data gives targetRequired = 0 | No data for 2028 | 1. Set Year to 2028 2. Click Calculate | targetRequired = 0; projected revenue shown; coverage bar not shown or 0 | |
| [ ] | TC-TGT-027 | Month and Year dropdowns sit side-by-side | Manual Distribution Calculator card | 1. View the card | Month and Year dropdowns are in a 2-column grid on the same row | |
| [ ] | TC-TGT-028 | Custom profit % input changes targetRequired | Default 20%; change to 30% | 1. Enter 30 in profit % field 2. Click Calculate | targetRequired increases | |
| [ ] | TC-TGT-029 | Distribution input changes projected revenue | Enter child counts per service | 1. Set حضانة=10, جلسة=20 2. Click Calculate | Projected revenue = 10×nursery_price + 20×session_price | |
| [ ] | TC-TGT-030 | Coverage bar reflects projected vs required | projectedRevenue = 75% of targetRequired | 1. View result | Bar fills ~75%; amber colour; "لم يتحقق" label | |
| [ ] | TC-TGT-031 | Suggested units shown for each service | After any calculation | 1. View "الوحدات المقترحة" section | Count per service to meet target; prices shown beside each | |
| [ ] | TC-TGT-032 | Profit % saved to settings persists | Admin changes profit % | 1. Change and save 2. Reload page | Same profit % shown on reload | |

---

## 8  Employees (TC-EMP)

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-EMP-001 | Employee list blocked for employees | Employee session | 1. Navigate to employees | FORBIDDEN | |
| [ ] | TC-EMP-002 | Add employee with all fields | Admin session | 1. Click Add 2. Fill name, role, base_salary, housing, transport 3. Save | Employee appears in list; net_salary = base + housing + transport | |
| [ ] | TC-EMP-003 | Net salary computed automatically | base=4000, housing=500, transport=300 | 1. Save employee | net_salary = 4800 displayed | |
| [ ] | TC-EMP-004 | Update employee base salary recalculates net | Employee exists | 1. Edit; change base to 4500 | net_salary updates instantly | |
| [ ] | TC-EMP-005 | Deactivate employee | Active employee | 1. Click deactivate | Employee marked inactive; removed from salary grid | |
| [ ] | TC-EMP-006 | Missing required fields rejected | Add form | 1. Submit without name | Validation error | |
| [ ] | TC-EMP-007 | Employee role/label persists | Set role "معلمة" | 1. Save and view | Role shown in list | |

---

## 9  Users (TC-USR)

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-USR-001 | User list blocked for employees | Employee session | 1. Navigate to users | FORBIDDEN | |
| [ ] | TC-USR-002 | Admin sees user list (without passwords) | Admin session | 1. Open users page | List shows username, role, status; no password column | |
| [ ] | TC-USR-003 | Create new employee account | Admin session | 1. Click Create 2. Fill username/password/role=employee 3. Save | User appears in list with employee role | |
| [ ] | TC-USR-004 | Create new admin account | Admin session | 1. Create with role=admin | User appears with admin role | |
| [ ] | TC-USR-005 | Duplicate username rejected | Username already exists | 1. Try to create same username | Error "username already exists" or similar | |
| [ ] | TC-USR-006 | Update user name | Admin session | 1. Edit user name 2. Save | New name shown in list | |
| [ ] | TC-USR-007 | Deactivate another user | Admin session; another user active | 1. Deactivate user | User marked inactive; cannot login | |
| [ ] | TC-USR-008 | Admin cannot self-deactivate | Logged in as admin | 1. Try to deactivate own account | Error "Cannot deactivate your own active session" | |
| [ ] | TC-USR-009 | Deactivated user cannot login | User deactivated | 1. Try to login as deactivated user | Error "تم إلغاء تنشيط هذا الحساب" | |
| [ ] | TC-USR-010 | Reactivate user | Deactivated user | 1. Toggle user active | User can login again | |
| [ ] | TC-USR-011 | Password change via update | Admin session | 1. Update user password | User can login with new password; old fails | |

---

## 10  Settings (TC-SET)

### 10.1  Branding

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-SET-001 | Branding blocked for employees | Employee session | 1. Navigate to settings | Branding tab hidden or save button disabled | |
| [ ] | TC-SET-002 | Change nursery name | Admin session; Settings > Branding | 1. Change nursery name 2. Save | Name shown in header/logo area | |
| [ ] | TC-SET-003 | Change primary color | Settings > Branding | 1. Pick new color 2. Save | Sidebar/header color updates to new color | |
| [ ] | TC-SET-004 | Upload logo | Settings > Branding | 1. Upload logo image 2. Save | Logo shown in header | |
| [ ] | TC-SET-005 | Settings persist after reload | After saving settings | 1. Reload app | Saved settings still applied | |

### 10.2  Pricing

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-SET-006 | Update nursery monthly price | Settings > Pricing | 1. Change nursery_monthly to 3500 2. Save | New price used in payment generation | |
| [ ] | TC-SET-007 | Update session hourly price | Settings > Pricing | 1. Change session_hourly to 200 2. Save | New price reflected in target calculations | |
| [ ] | TC-SET-008 | Update hosting monthly price | Settings > Pricing | 1. Change hosting_monthly to 2500 2. Save | Saved; used in projections | |
| [ ] | TC-SET-009 | Pricing blocked for employees | Employee session | 1. Try to update pricing | FORBIDDEN | |

### 10.3  Security

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-SET-010 | Change admin password | Admin session; Security tab | 1. Enter current + new password 2. Save | Can login with new password; old fails | |
| [ ] | TC-SET-011 | Wrong current password rejected | Security tab | 1. Enter wrong current password | Error message shown | |

---

## 11  Storage / Backup (TC-STG)

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-STG-001 | Storage page blocked for employees | Employee session | 1. Navigate to storage | FORBIDDEN or hidden | |
| [ ] | TC-STG-002 | Database size displayed | Admin session | 1. Open storage page | DB size shown in KB/MB | |
| [ ] | TC-STG-003 | Create backup | Admin session | 1. Click "إنشاء نسخة احتياطية" | File saved to disk; success message shown | |
| [ ] | TC-STG-004 | Restore backup restores data | Backup exists; DB has new data after backup | 1. Click Restore 2. Select backup file | Data restored to backup state; new data gone | |
| [ ] | TC-STG-005 | Backup roundtrip — data integrity | Known set of children before backup | 1. Backup 2. Add more children 3. Restore | Exactly the pre-backup children restored | |
| [ ] | TC-STG-006 | Restore confirms before overwriting | Admin clicks restore | 1. Click Restore | Confirmation dialog appears before proceeding | |

---

## 12  Cloud Sync (TC-SYN)

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-SYN-001 | Sync page blocked for employees | Employee session | 1. Navigate to sync | FORBIDDEN | |
| [ ] | TC-SYN-002 | Sync status shows "never synced" initially | Fresh installation | 1. Open sync page | Last sync: never | |
| [ ] | TC-SYN-003 | Push to cloud | Valid MongoDB URI in .env; data exists | 1. Click Push | Progress shown; success message; records count shown | |
| [ ] | TC-SYN-004 | Pull from cloud | Cloud has newer records | 1. Click Pull | Local DB updated with cloud data | |
| [ ] | TC-SYN-005 | Conflict: cloud wins when cloud is newer | Local record older | 1. Trigger pull after cloud update | Cloud version replaces local | |
| [ ] | TC-SYN-006 | Conflict: local wins when local is newer | Local record newer | 1. Trigger pull | Local version kept | |
| [ ] | TC-SYN-007 | Tombstone: deleted record not re-pulled | Child deleted locally | 1. Pull from cloud | Deleted child not restored | |
| [ ] | TC-SYN-008 | Sync log shows history | After push/pull | 1. View sync log | Entries show action, table, status, timestamp | |
| [ ] | TC-SYN-009 | Missing MONGODB_URI shows error | .env has no MONGODB_URI | 1. Click Push | Clear error "MongoDB URI not configured" | |

---

## 13  Export (TC-XPRT)

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-XPRT-001 | Export full database to Excel | Admin session; some data | 1. Click Export All 2. Select Excel | .xlsx file downloaded with all sheets | |
| [ ] | TC-XPRT-002 | Export monthly payments to Excel | Payments for current month | 1. Export > Monthly Payments | Sheet contains all payment rows for month | |
| [ ] | TC-XPRT-003 | Export child statement to PDF | Child selected | 1. Open statement 2. Export PDF | PDF with child name, monthly breakdown, totals | |
| [ ] | TC-XPRT-004 | Export salaries to Excel | Salaries entered | 1. Export > Salaries | Salary sheet with employee names and amounts | |
| [ ] | TC-XPRT-005 | Export expenses to Excel | Expenses entered | 1. Export > Expenses | 12-month grid exported | |
| [ ] | TC-XPRT-006 | Export blocked for employees on admin-only data | Employee session | 1. Try to export salaries/expenses | FORBIDDEN | |
| [ ] | TC-XPRT-007 | Arabic content renders correctly in Excel | Arabic names in data | 1. Open exported Excel | Arabic text readable; not garbled | |
| [ ] | TC-XPRT-008 | PDF text direction is RTL | Arabic PDF exported | 1. Open PDF | Text is right-to-left | |
| [ ] | TC-XPRT-009 | Progress indicator shown during large export | Many records | 1. Start export | Progress bar or spinner visible | |

---

## 14  Import (TC-IMP)

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-IMP-001 | Import blocked for employees | Employee session | 1. Try import | FORBIDDEN | |
| [ ] | TC-IMP-002 | Import valid Excel workbook | Admin session; valid .xlsx file | 1. Click Import 2. Select file | Success summary: X children, Y payments imported | |
| [ ] | TC-IMP-003 | Import is idempotent (no duplicates on re-import) | Already imported | 1. Import same file again | Same record counts; no duplicates | |
| [ ] | TC-IMP-004 | Invalid rows reported but don't crash | File with bad rows | 1. Import file | rowErrors > 0; valid rows still imported | |
| [ ] | TC-IMP-005 | Settings (pricing) imported from settings sheet | Settings sheet has pricing data | 1. Import | nursery_monthly, hosting_monthly updated | |
| [ ] | TC-IMP-006 | Progress shown during import | Large file | 1. Start import | Progress bar visible | |
| [ ] | TC-IMP-007 | Wrong file type rejected | .csv or .docx selected | 1. Select wrong file | Error "invalid file type" | |
| [ ] | TC-IMP-008 | Missing required columns handled | Sheet missing column | 1. Import file | Clear error describing missing column | |

---

## 15  Language / Bilingual (TC-I18N)

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-I18N-001 | Switch from Arabic to English | App in Arabic mode | 1. Click language switcher | All labels switch to English; layout switches to LTR | |
| [ ] | TC-I18N-002 | Switch from English back to Arabic | App in English mode | 1. Click language switcher | Labels back to Arabic; layout RTL | |
| [ ] | TC-I18N-003 | Arabic dates and month names | Dashboard open in Arabic mode | 1. View month selector | Arabic month names shown (يناير..ديسمبر) | |
| [ ] | TC-I18N-004 | English dates and month names | Dashboard open in English mode | 1. View month selector | English month names shown | |
| [ ] | TC-I18N-005 | Language preference persists | Switch to English | 1. Reload app | Still in English | |
| [ ] | TC-I18N-006 | Error messages bilingual | Trigger a validation error | 1. Submit invalid form | Error in both Arabic and English | |

---

## 16  Role-Based Access Control (TC-RBAC)

| ✓ | ID | Title | Role | Action | Expected | Result |
|---|----|-------|------|--------|----------|--------|
| [ ] | TC-RBAC-001 | Children read | Employee | View children list | Allowed | |
| [ ] | TC-RBAC-002 | Children add | Employee | Add new child | Allowed | |
| [ ] | TC-RBAC-003 | Children update | Employee | Edit existing child | FORBIDDEN | |
| [ ] | TC-RBAC-004 | Children deactivate | Employee | Toggle child inactive | FORBIDDEN | |
| [ ] | TC-RBAC-005 | Payments view | Employee | View payment grid | Allowed | |
| [ ] | TC-RBAC-006 | Payments update | Employee | Record payment | Allowed | |
| [ ] | TC-RBAC-007 | Expenses view | Employee | Navigate to expenses | FORBIDDEN | |
| [ ] | TC-RBAC-008 | Expenses update | Employee | Enter expense amount | FORBIDDEN | |
| [ ] | TC-RBAC-009 | Salaries view | Employee | Navigate to salaries | FORBIDDEN | |
| [ ] | TC-RBAC-010 | Employees view | Employee | Navigate to employees | FORBIDDEN | |
| [ ] | TC-RBAC-011 | Users view | Employee | Navigate to users | FORBIDDEN | |
| [ ] | TC-RBAC-012 | Settings update | Employee | Save any setting | FORBIDDEN | |
| [ ] | TC-RBAC-013 | Storage backup | Employee | Open storage page | FORBIDDEN | |
| [ ] | TC-RBAC-014 | Cloud sync | Employee | Open sync page | FORBIDDEN | |
| [ ] | TC-RBAC-015 | Dashboard view | Employee | Open dashboard | Allowed | |
| [ ] | TC-RBAC-016 | Admin all-access | Admin | All pages/actions | All allowed | |
| [ ] | TC-RBAC-017 | Anonymous blocked everywhere | No session | Call any IPC channel | UNAUTHORIZED | |

---

## 17  UI Components (TC-UI)

### 17.1  Button

| ✓ | ID | Title | Precondition | Steps | Expected | Result |
|---|----|-------|-------------|-------|----------|--------|
| [ ] | TC-UI-001 | Primary button has teal background | Any page with a primary Button | 1. View a primary Button | Teal background; white text | |
| [ ] | TC-UI-002 | Secondary button has amber background | Any page with secondary Button | 1. View a secondary Button | Amber background; white text | |
| [ ] | TC-UI-003 | Danger button has red background | Any page with danger Button | 1. View a danger Button | Red background; white text | |
| [ ] | TC-UI-004 | Outline button has no background fill | Any page with outline Button | 1. View an outline Button | Transparent bg; slate border; slate text | |
| [ ] | TC-UI-005 | Ghost button has no border | Any page with ghost Button | 1. View a ghost Button | No border; shows background only on hover | |
| [ ] | TC-UI-006 | Loading state shows spinner + disables click | Any Button; simulate loading | 1. Trigger an action that sets isLoading | Spinner appears; button disabled; click has no effect | |
| [ ] | TC-UI-007 | Spinner appears on correct side in Arabic (RTL) | UI in Arabic mode; trigger loading | 1. Observe spinner position | Spinner on RIGHT side; gap is between spinner and label text | |
| [ ] | TC-UI-008 | Spinner appears on correct side in English (LTR) | UI in English mode; trigger loading | 1. Observe spinner position | Spinner on LEFT side; gap between spinner and label text | |
| [ ] | TC-UI-009 | Disabled button cannot be clicked | Any Button with `disabled` | 1. Click disabled button | No action; 50% opacity; cursor not-allowed | |
| [ ] | TC-UI-010 | Small button (sm) is visibly smaller than md | Side by side if possible | 1. Compare sm and md buttons | sm has tighter padding and smaller font | |
| [ ] | TC-UI-011 | Large button (lg) is visibly larger than md | Side by side | 1. Compare lg and md buttons | lg has more padding and larger font | |
| [ ] | TC-UI-012 | w-full class stretches button to container width | Capacity planner Calculate button | 1. View "احسب خطة التوزيع" button | Button spans full card width | |
| [ ] | TC-UI-013 | Focus ring visible on keyboard Tab | Any page | 1. Tab to a button | Visible focus ring around button | |

---

## 18  Performance & Edge Cases (TC-PERF)

| ✓ | ID | Title | Steps | Expected | Result |
|---|----|-------|-------|----------|--------|
| [ ] | TC-PERF-001 | List renders 200+ children | Seed 200 children; open children list | Loads in < 3 seconds; no browser hang | |
| [ ] | TC-PERF-002 | Payment grid with 200 rows | Generate for 200 children; open payment grid | Scrollable; no freeze | |
| [ ] | TC-PERF-003 | Export 12 months of data | Full year data exists; export full DB | File generated < 30 seconds | |
| [ ] | TC-PERF-004 | Import large workbook | 300-row Excel file; import | Completes with progress; no timeout | |
| [ ] | TC-PERF-005 | Empty state messages | No children in DB; open children list | "لا توجد بيانات" or equivalent empty state | |
| [ ] | TC-PERF-006 | Concurrent IPC calls | Rapid clicking of generate | No duplicate records created | |
| [ ] | TC-PERF-007 | Very long Arabic names | Child name 100 chars; add and view | Name truncated with ellipsis in table; full name in form | |

---

## 19  Data Integrity (TC-INT)

| ✓ | ID | Title | Steps | Expected | Result |
|---|----|-------|-------|----------|--------|
| [ ] | TC-INT-001 | Delete child cascades payments | Delete (deactivate) child with payments; view payments | Payments remain linked but child shown as inactive | |
| [ ] | TC-INT-002 | Payment total always = quantity × price | Update quantity to 2; view payment | total = 2 × price, server computed | |
| [ ] | TC-INT-003 | Balance always = total − paid | Set total=2500, paid=1000; view balance | balance = 1500 always | |
| [ ] | TC-INT-004 | Status consistent with paid/balance | Set paid = total; check status | Status = "paid"; no mismatch possible | |
| [ ] | TC-INT-005 | Backup file is valid SQLite | Create backup; open with DB browser | Valid SQLite; all tables present | |
| [ ] | TC-INT-006 | Settings key uniqueness | Update same key twice; view settings | Only latest value stored (no duplicates) | |
| [ ] | TC-INT-007 | Child services uniqueness per child | Add same service twice to same child | Only one service row per service type | |

---

*Last updated: 2026-06-14*
*App version: 1.0.0 — Electron 42 + React 19 + SQLite (node:sqlite)*
