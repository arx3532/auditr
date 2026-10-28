import { expect, test } from '@playwright/test'

test('drafts and confirms an invoice in chat', async ({ page }) => {
  await page.goto('/chat')

  await expect(page.getByRole('heading', { name: /what would you like to bill today/i })).toBeVisible()
  await page.getByRole('button', { name: /invoice adtech/i }).click()

  await expect(page.getByText('Review draft before issuing')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /confirm & issue/i })).toBeEnabled()

  await page.getByRole('button', { name: /confirm & issue/i }).click()
  await expect(page.getByText(/invoice issued/i)).toBeVisible({ timeout: 10_000 })
})

test('renders a public invoice without authentication', async ({ page }) => {
  await page.goto('/pay/pubtok-inv-0005')
  await expect(page.getByText(/invoice/i).first()).toBeVisible()
  await expect(page).toHaveTitle(/invoice agent/i)
})
