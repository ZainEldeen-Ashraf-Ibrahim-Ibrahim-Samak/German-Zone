import { test, expect } from '@playwright/test'

/**
 * US3 — Employees can add students (feature 004, FR-012).
 * Skipped scaffold (no live app server in this harness).
 */
test.describe.skip('Employee adds a student', () => {
  test('employee sees Add Student and can create one', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    // Assume signed in as an employee.
    await page.click('text=الطلاب')

    // The Add Student action is available to employees.
    await expect(page.locator('text=إضافة طالب')).toBeVisible()
    await page.click('text=إضافة طالب')

    await page.fill('input[name="name"]', 'Employee Added Student')
    await page.fill('input[name="guardian"]', 'Guardian')
    await page.fill('input[name="guardian_phone"]', '01099999999')
    await page.click('text=حفظ')

    // Returns to the list and the new student appears.
    await expect(page.locator('text=Employee Added Student')).toBeVisible()
  })
})
