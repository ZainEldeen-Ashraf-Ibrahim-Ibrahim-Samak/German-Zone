import { test, expect } from '@playwright/test'

/**
 * US3 — Employees can add children (feature 004, FR-012).
 * Skipped scaffold (no live app server in this harness).
 */
test.describe.skip('Employee adds a child', () => {
  test('employee sees Add Child and can create one', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    // Assume signed in as an employee.
    await page.click('text=الأطفال')

    // The Add Child action is available to employees.
    await expect(page.locator('text=إضافة طفل')).toBeVisible()
    await page.click('text=إضافة طفل')

    await page.fill('input[name="name"]', 'Employee Added Child')
    await page.fill('input[name="guardian"]', 'Guardian')
    await page.fill('input[name="guardian_phone"]', '01099999999')
    await page.click('text=حفظ')

    // Returns to the list and the new child appears.
    await expect(page.locator('text=Employee Added Child')).toBeVisible()
  })
})
