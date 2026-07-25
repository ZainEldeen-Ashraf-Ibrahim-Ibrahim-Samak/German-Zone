import { test, expect } from '@playwright/test'

/**
 * US1 — Teacher + lesson days + monthly fee (feature 004).
 * Skipped like the other e2e scaffolds (no live app server in this harness);
 * documents the manual/automated flow from quickstart.md.
 */
test.describe.skip('Enroll child with teacher and computed fee', () => {
  test('default 8 sessions, extras increase count and fee', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.click('text=الأطفال')
    await page.click('text=إضافة طفل')

    await page.fill('input[name="name"]', 'Fee Test Child')
    await page.fill('input[name="guardian"]', 'Guardian')
    await page.fill('input[name="guardian_phone"]', '01012345678')

    // Assign a teacher (from Employees) and two lesson days.
    await page.selectOption('select', { index: 1 }) // teacher select
    await page.click('text=Mon')
    await page.click('text=Wed')

    // Session price drives the fee; baseline is 8.
    await page.fill('input[type="number"] >> nth=0', '100') // session price (illustrative)
    await expect(page.locator('text=800')).toBeVisible() // 8 × 100

    // Add 2 extra lessons → 10 sessions → 1000.
    await page.fill('input[type="number"] >> nth=1', '2')
    await expect(page.locator('text=1000')).toBeVisible()

    await page.click('text=حفظ')
  })
})
