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
    // Entrée par la sidebar (le sous-nav Équipe n'existe qu'une fois l'onglet ouvert).
    await page.getByTestId('mgr-tab-livreurs').click()
    await expect(page.getByTestId('mgr-tab-gestionnaires')).toBeVisible()
    await page.getByTestId('mgr-tab-gestionnaires').click()

    // I92 — Cellule « Membre » : le nom et l'e-mail occupent deux lignes distinctes
    // (« Aya DAFdaf@btp-pilote.ci » était illisible avant le CSS `.eqp .cat-*`).
    const memberCells = page.locator('#eq-gestionnaires tbody tr .cat-info')
    await expect(memberCells.first()).toBeVisible({ timeout: UI_READY_TIMEOUT })
    const memberLabels = await memberCells.allInnerTexts()
    expect(memberLabels.length).toBeGreaterThan(0)
    for (const label of memberLabels) {
      const lines = label.split('\n').filter((l) => l.trim() !== '')
      expect(lines.length, `libellé « Membre » ambigu : ${JSON.stringify(label)}`).toBeGreaterThanOrEqual(2)
    }

    // I93 — Colonne « Rôle » : le rôle métier (espace de travail) est affiché, jamais
    // la valeur brute du rôle d'accès (`manager` / `admin`).
    const roleLabels = (await page.locator('#eq-gestionnaires tbody tr td:nth-child(3)').allInnerTexts()).map((t) => t.trim())
    expect(roleLabels.length).toBe(memberLabels.length)
    for (const label of roleLabels) {
      expect(label.length, 'cellule « Rôle » vide').toBeGreaterThan(0)
      expect(['manager', 'admin'], `rôle d’accès brut affiché : ${JSON.stringify(label)}`).not.toContain(label)
    }

    await page.getByTestId('mgr-invite-name').fill('Collègue Test')
    await page.getByTestId('mgr-invite-email').fill('collegue@test.fr')
    await page.getByTestId('mgr-invite-procurement-role').selectOption('purchasing')
    await page.getByTestId('mgr-invite-send').click()
    await expect(page.getByText(/Invitation créée/i)).toBeVisible({ timeout: UI_READY_TIMEOUT })

    // I93 — Une invitation en attente montre son espace de travail (« Service achats »)
    // dès sa création, sans attendre l'acceptation.
    const pendingRow = page.locator('#eq-gestionnaires tbody tr', { hasText: 'collegue@test.fr' })
    await expect(pendingRow.locator('td').nth(2)).toHaveText('Service achats')
    await expect(pendingRow.locator('td').nth(3)).toHaveText('En attente')

    // I93 — le RENVOI d'invitation conserve l'espace de travail choisi : le
    // serveur recrée l'invitation avec son procurement_role (avant ce correctif,
    // le renvoi le perdait — la ligne retombait sur « Invitation en attente » et
    // l'acceptation créait un compte sans rôle achats).
    const invitesRes = await page.request.get(`${API_BASE}/api/v1/dashboard/managers/invites`)
    expect(invitesRes.ok(), await invitesRes.text()).toBeTruthy()
    const invitesBody = (await invitesRes.json()) as { invites: Array<{ id: string; email: string }> }
    const createdInvite = invitesBody.invites.find((i) => i.email === 'collegue@test.fr')
    expect(createdInvite, 'invitation créée absente de /dashboard/managers/invites').toBeTruthy()
    const resendRes = await page.request.post(
      `${API_BASE}/api/v1/dashboard/managers/invites/${createdInvite!.id}/resend`,
    )
    expect(resendRes.ok(), await resendRes.text()).toBeTruthy()
    await page.getByRole('button', { name: /Actualiser/ }).click()
    const pendingAfterResend = page.locator('#eq-gestionnaires tbody tr', { hasText: 'collegue@test.fr' })
    await expect(pendingAfterResend.locator('td').nth(2)).toHaveText('Service achats', {
      timeout: UI_READY_TIMEOUT,
    })

    const token = await getMockEmailToken(request, 'collegue@test.fr')
    await page.context().clearCookies()
    await page.goto(`/manager/invite?token=${token}`)
    await page.getByTestId('mgr-invite-password').fill('secret1234')
    await page.getByTestId('mgr-invite-confirm').fill('secret1234')
    await page.getByTestId('mgr-invite-submit').click()
    await page.waitForURL(/\/manager/, { timeout: UI_READY_TIMEOUT })

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
    await page.waitForURL(/\/manager/, { timeout: UI_READY_TIMEOUT })
  })
})
