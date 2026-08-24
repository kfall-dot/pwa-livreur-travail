import { test, expect } from '@playwright/test'
import {
  API_BASE,
  ADMIN_API_TOKEN,
  DEMO_MANAGER,
  loginManager,
  resetAndSeed,
  UI_READY_TIMEOUT,
} from './helpers'

function adminHeaders(): Record<string, string> {
  return { 'X-Admin-Token': ADMIN_API_TOKEN }
}

async function getMockEmailToken(request: import('@playwright/test').APIRequestContext, email: string): Promise<string> {
  const res = await request.get(`${API_BASE}/api/v1/admin/mock-email/${encodeURIComponent(email)}`, {
    headers: adminHeaders(),
  })
  if (!res.ok()) throw new Error(`Mock email not found: ${await res.text()}`)
  const data = (await res.json()) as { text?: string }
  const match = data.text?.match(/token=([a-f0-9]+)/)
  if (!match) throw new Error('Token not found in mock email')
  return match[1]
}

test.describe('Manager invite & roles', () => {
  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request)
  })

  test('admin voit l’onglet Gestionnaires et peut inviter', async ({ page, request }) => {
    await loginManager(page)
    await page.getByTestId('mgr-tab-livreurs').click()
    await expect(page.getByTestId('mgr-tab-gestionnaires')).toBeVisible()
    await page.getByTestId('mgr-tab-gestionnaires').click()
    await page.getByTestId('mgr-invite-name').fill('Collègue Test')
    await page.getByTestId('mgr-invite-email').fill('collegue@test.fr')
    await page.getByTestId('mgr-invite-send').click()
    await expect(page.getByText(/Invitation envoyée/i)).toBeVisible({ timeout: UI_READY_TIMEOUT })

    const token = await getMockEmailToken(request, 'collegue@test.fr')
    await page.context().clearCookies()
    await page.goto(`/manager/invite?token=${token}`)
    await page.getByTestId('mgr-invite-password').fill('secret1234')
    await page.getByTestId('mgr-invite-confirm').fill('secret1234')
    await page.getByTestId('mgr-invite-submit').click()
    await page.waitForURL('/manager', { timeout: UI_READY_TIMEOUT })

    await page.getByTestId('mgr-tab-livreurs').click()
    await expect(page.getByTestId('mgr-tab-gestionnaires')).toHaveCount(0)
  })

  test('mot de passe oublié manager', async ({ page, request }) => {
    await page.goto('/manager/forgot-password')
    await page.getByTestId('mgr-forgot-email').fill(DEMO_MANAGER.email)
    await page.getByTestId('mgr-forgot-submit').click()
    await expect(page.getByText(/lien de réinitialisation/i)).toBeVisible()

    const token = await getMockEmailToken(request, DEMO_MANAGER.email)
    await page.goto(`/manager/reset-password?token=${token}`)
    await page.getByTestId('mgr-reset-password').fill('newpass1234')
    await page.getByTestId('mgr-reset-confirm').fill('newpass1234')
    await page.getByTestId('mgr-reset-submit').click()
    await expect(page.getByText(/Mot de passe mis à jour/i)).toBeVisible()

    await page.goto('/manager/login')
    await page.getByTestId('mgr-login-email').fill(DEMO_MANAGER.email)
    await page.getByTestId('mgr-login-password').fill('newpass1234')
    await page.getByTestId('mgr-login-submit').click()
    await page.waitForURL('/manager', { timeout: UI_READY_TIMEOUT })
  })
})
