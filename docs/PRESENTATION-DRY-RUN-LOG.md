# Journal test sec présentation — del-k3

**Dernière mise à jour :** 26 juillet 2026  
**Commande :** `DELIVERY_ID=del-k3 LAT=5.367 LNG=-4.0702 npm run presentation:dry-run`  
**Cible :** https://pwa-livreur.netlify.app

---

## Identifiants prod à utiliser (présentation)

| Rôle | Identifiant | Secret | URL |
|------|-------------|--------|-----|
| **Manager** | `kfallet@gmail.com` | `admin1234` | [/manager/login](https://pwa-livreur.netlify.app/manager/login) |
| Livreur Aya | `0700430402` | `1234` | [/](https://pwa-livreur.netlify.app) |
| Livreur Kouassi | `0701234567` | `1234` | [/](https://pwa-livreur.netlify.app) |

`manager@demo.fr` = e-mail seed **local / historique** — **ne pas utiliser** sur la prod pilote (`SEED_MANAGER_EMAIL=kfallet@gmail.com` sur Netlify).

---

## Historique des tests

### 26 juil. 2026 — manager OK

| Étape | Statut | Détail |
|-------|--------|--------|
| Manager `kfallet@gmail.com` / `admin1234` | **OK** | `mgr-demo-1`, `co-demo` |
| Manager `manager@demo.fr` / `admin1234` | **ÉCHEC** | `Identifiants invalides` — attendu |

### 25 juil. 2026 — tests initiaux

| Étape | Statut | Détail |
|-------|--------|--------|
| Livreur Aya / Kouassi PIN `1234` | Variable | Vérifier J-0 via dry-run |
| Déverrouillage rate-limit Blobs | Procédure | [`SUPPORT-PILOTE.md`](SUPPORT-PILOTE.md) |

---

## Actions avant le jour J (obligatoire)

1. **Retester** manager + livreur le matin même (pas la veille)
2. `DELIVERY_ID=del-k3 npm run presentation:dry-run` → **6/6 OK**
3. Textbee : Android allumé, SIM CI
4. En cas de reset mot de passe manager : mettre à jour [`PRESENTATION-LIVE-SCRIPT.md`](PRESENTATION-LIVE-SCRIPT.md)

---

## Arrêt del-k3 (rappel)

| Champ | Valeur |
|-------|--------|
| ID | `del-k3` |
| Nom | Entrepôt Yopougon |
| Livreur | Aya (`drv-demo-2`) |
| GPS démo | lat `5.367`, lng `-4.0702` |
| Photos requises | 2 |
| OTP | `+2250700430402` (si point catalogue inchangé) |

---

*Journal opérationnel — à compléter après chaque test sec.*
