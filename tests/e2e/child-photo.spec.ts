import { test, expect } from '@playwright/test'

/**
 * US2 — Child photo via upload, offline-safe (feature 004, FR-002–FR-004a).
 * Skipped scaffold (no live app server in this harness).
 */
test.describe.skip('Child photo upload', () => {
  test('uploaded photo appears on the record', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.click('text=الأطفال')
    await page.click('text=إضافة طفل')

    await page.fill('input[name="name"]', 'Photo Child')
    await page.fill('input[name="guardian"]', 'Guardian')
    await page.fill('input[name="guardian_phone"]', '01088888888')

    // Upload a file via the hidden input.
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample.jpg')
    await page.click('text=حفظ')

    // Thumbnail visible in the list.
    await expect(page.locator('img[alt="Photo Child"]')).toBeVisible()
  })

  test('offline upload failure still saves the child without a photo', async ({ page }) => {
    // With Cloudinary unreachable, the form shows a notice and saves the child.
    await page.goto('http://localhost:5173/')
    await page.click('text=الأطفال')
    await page.click('text=إضافة طفل')
    await page.fill('input[name="name"]', 'No Photo Child')
    await page.fill('input[name="guardian"]', 'Guardian')
    await page.fill('input[name="guardian_phone"]', '01077777777')
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample.jpg')
    await page.click('text=حفظ')
    await expect(page.locator('text=No Photo Child')).toBeVisible()
  })
})
