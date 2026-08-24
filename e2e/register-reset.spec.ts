import { test, expect } from '@playwright/test'

test('Créer mon espace vide les champs inscription', async ({ page }) => {
  await page.goto('/manager/register', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('register-company-name').fill('Ancienne entreprise')
  await page.getByTestId('register-manager-name').fill('Ancien nom')
  await page.getByTestId('register-email').fill('ancien@example.com')
  await page.getByTestId('register-password').fill('password1234')
  await page.goto('/manager/login', { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: /Créer mon espace/i }).click()
  await expect(page).toHaveURL(/\/manager\/register/)
  await expect(page.getByTestId('register-company-name')).toHaveValue('')
  await expect(page.getByTestId('register-manager-name')).toHaveValue('')
  await expect(page.getByTestId('register-email')).toHaveValue('')
  await expect(page.getByTestId('register-password')).toHaveValue('')
})
