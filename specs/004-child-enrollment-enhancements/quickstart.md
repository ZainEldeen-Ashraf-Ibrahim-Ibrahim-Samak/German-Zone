# Quickstart: Child Enrollment Enhancements

This feature is brownfield — no new app scaffolding. Below is how to configure, run, and validate the six enhancements.

## 1. Configure Cloudinary (for child photos)

Add to your `.env` (dev: repo root; packaged: next to the executable — see `electron/env.ts`):

```dotenv
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
# or, instead of the three above:
# CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
```

Without these, photo upload fails gracefully and children still save (no photo) — the rest of the feature works offline.

## 2. Run

```bash
npm install        # no new runtime deps; Cloudinary upload uses Node's global fetch
npm run dev        # Vite renderer + Electron main
```

The DB migration `011_child_photo_teacher_lessons` runs automatically on first launch (additive columns on `children`).

## 3. Manual validation (maps to spec acceptance scenarios)

**Guardian phone (US4 / FR-001)**
1. Children → Add. Type a guardian phone — the field stops at 11 digits and rejects non-digits.
2. Enter `0123` (too short) → Save → inline validation error, not saved. Enter `01012345678` → passes.

**Child photo (US2 / FR-002–FR-004a)**
1. Add a child → choose "Use Camera" → pick a capture device → take a photo. Save → the photo appears on the record and in the list.
2. Add another child → "Upload" an image file → Save → image attached.
3. Disconnect from the network → add a child with a chosen photo → Save still succeeds; a message notes the photo wasn't uploaded; child is created without a photo (add later via edit).
4. A child with no photo shows a neutral placeholder (no broken image).

**Employee adds child (US3 / FR-012)**
1. Sign in as an employee → the "Add Child" action is available.
2. Submit a valid child → saved successfully. (Editing/deactivating remain admin-only.)

**Index number (US5 / FR-005)**
1. Open the children list → every row shows a 1-based index.
2. Filter/search → indexes stay consecutive for the visible rows.

**Teacher + lessons + fee (US1 / FR-006–FR-011, FR-013)**
1. Add a child → assign a teacher (list comes from Employees) → select two lesson weekdays.
2. Confirm the default shows **8 sessions** and a monthly fee = `8 × session price`.
3. Add `extra_lessons` = 2 → session count shows 10 and fee = `10 × session price`.
4. Try any month (28/29/30/31 days) → the 8 baseline does not change automatically.
5. Open the child record → assigned teacher and lesson days are shown.

**Service calculator input (US6 / FR-014–FR-015)**
1. Target Planning → Service Distribution Calculator → a new **Target Profit %** field appears, pre-filled from settings.
2. Leave it at the saved value and Calculate → outputs (projected revenue, coverage %, suggested units) match the pre-change results exactly.
3. Change Target Profit % → outputs recompute via the same formula; reset it to the saved value → identical results again.

## 4. Automated tests

```bash
npm run test          # vitest unit: phone regex, fee calc, cloudinary signature, calc parity
npx playwright test   # e2e: enrollment+photo, employee-add-child, calculator input
```

Key regression guard: a unit test asserts `target:calc` with `targetProfitPct` equal to `settings.target_profit_pct` returns byte-identical output to the prior (settings-only) path (FR-015).

## 5. Notes / out of scope

- The computed `monthly_fee` is persisted and displayed on the child; **wiring it into automatic `payments:generate` is out of scope** for this feature.
- Cloudinary credentials live only in the main process / `.env`; the renderer never holds the API secret.
- New child columns sync to MongoDB via the extended `childSchema` (admin sync, last-write-wins).
