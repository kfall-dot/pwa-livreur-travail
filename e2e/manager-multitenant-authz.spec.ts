import { test, expect } from '@playwright/test'
import { API_BASE, resetAndSeed } from './helpers'

/**
 * Isolation multi-entreprises (anti-IDOR).
 *
 * Un gestionnaire fraîchement inscrit (entreprise « pirate ») ne doit JAMAIS
 * pouvoir lire ni modifier une ressource de l'entreprise démo en devinant son
 * identifiant (del-1, tour-demo-today, prod-demo-1…).
 *
 * Contrôle positif : le pirate est bien authentifié (ses propres listes
 * répondent 200), donc les 404 ci-dessous prouvent le cloisonnement par
 * entreprise, pas un simple défaut d'authentification.
 */
test.describe('Isolation multi-entreprises (IDOR)', () => {
  test('un gestionnaire d’une autre entreprise ne peut pas accéder aux ressources du démo', async ({
    playwright,
  }) => {
    const attacker = await playwright.request.newContext({ baseURL: API_BASE })

    try {
      // Seed l'entreprise démo (del-1, tour-demo-today, prod-demo-1) via jeton admin.
      await resetAndSeed(attacker)

      // Entreprise « pirate » via self-signup → cookie de session sur `attacker`.
      const reg = await attacker.post('/api/auth/register-company', {
        data: {
          companyName: 'Pirate SARL',
          managerName: 'Mallory',
          email: `mallory+${Date.now()}@evil.test`,
          password: 'password1234',
        },
      })
      expect(reg.status(), await reg.text()).toBe(201)

      // Contrôle positif : session valide → listes propres à l'entreprise = 200.
      const ownTours = await attacker.get('/api/dashboard/tours')
      expect(ownTours.status(), 'session pirate valide (tours)').toBe(200)
      const ownProducts = await attacker.get('/api/dashboard/products')
      expect(ownProducts.status(), 'session pirate valide (produits)').toBe(200)

      // A. Photos d'une livraison démo → refusé.
      const photos = await attacker.get('/api/dashboard/deliveries/del-1/photos')
      expect(photos.status(), 'photos livraison tierce').toBe(404)

      // B. Gabarit de replanification d'une tournée démo → refusé.
      const replan = await attacker.get('/api/dashboard/tours/tour-demo-today/replan-template')
      expect(replan.status(), 'replan-template tournée tierce').toBe(404)

      // C. Reliquat de replanification d'une livraison démo → refusé.
      const partial = await attacker.get(
        '/api/dashboard/deliveries/del-1/partial-replan-template',
      )
      expect(partial.status(), 'partial-replan livraison tierce').toBe(404)

      // D. Modification d'un produit démo → refusé (aucune mutation possible).
      const patch = await attacker.patch('/api/dashboard/products/prod-demo-1', {
        data: { displayOrder: 99 },
      })
      expect(patch.status(), 'PATCH produit tiers').toBe(404)

      // E. Photo par clé devinée (fail-closed) → jamais 200.
      const byKey = await attacker.get('/api/dashboard/photos?key=del-1/photo-0')
      expect(byKey.status(), 'photo par clé tierce').not.toBe(200)

      // F. Résolution d'une tâche par identifiant deviné → refusé.
      const resolve = await attacker.post('/api/dashboard/manager-tasks/task-demo-1/resolve')
      expect(resolve.status(), 'resolve tâche tierce').toBe(404)
    } finally {
      await attacker.dispose()
    }
  })
})
