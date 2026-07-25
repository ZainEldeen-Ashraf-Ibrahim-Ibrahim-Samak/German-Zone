import { test, expect } from '@playwright/test'

/**
 * US2 — Student photo via upload, offline-safe (feature 004, FR-002–FR-004a).
 * Skipped scaffold (no live app server in this harness).
 */
test.describe.skip('Student photo upload', () => {
  test('uploaded photo appears on the record', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.click('text=الطلاب')
    await page.click('text=إضافة طالب')

    await page.fill('input[name="name"]', 'Photo Student')
    await page.fill('input[name="guardian"]', 'Guardian')
    await page.fill('input[name="guardian_phone"]', '01088888888')

    // Upload a file via the hidden input.
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample.jpg')
    await page.click('text=حفظ')

    // Thumbnail visible in the list.
    await expect(page.locator('img[alt="Photo Student"]')).toBeVisible()
  })

  test('offline upload failure still saves the student without a photo', async ({ page }) => {
    // With Cloudinary unreachable, the form shows a notice and saves the student.
    await page.goto('http://localhost:5173/')
    await page.click('text=الطلاب')
    await page.click('text=إضافة طالب')
    await page.fill('input[name="name"]', 'No Photo Student')
    await page.fill('input[name="guardian"]', 'Guardian')
    await page.fill('input[name="guardian_phone"]', '01077777777')
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample.jpg')
    await page.click('text=حفظ')
    await expect(page.locator('text=No Photo Student')).toBeVisible()
  })
})
