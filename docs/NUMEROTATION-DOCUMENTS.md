# Numérotation EB, BC et BT

Date : 27 octobre 2026.

## Règles

Le format reste `EB-2026-0001`, `BC-2026-0001` ou `BT-2026-0001`. Chaque compagnie possède des compteurs indépendants par type et par année. L’année est celle du fuseau métier `APP_TIMEZONE`, par défaut `Africa/Abidjan`.

La réservation est un `INSERT … ON CONFLICT … DO UPDATE … RETURNING` PostgreSQL sur `document_reference_counters`. Les créations concurrentes attendent sur la même ligne de compteur et reçoivent des numéros différents. Aucun calcul `nombre de documents + 1` ne subsiste pour ces trois types.

Le compteur est initialisé au plus grand suffixe existant, et non au nombre de documents. Les années et références existantes sont conservées. Un suffixe supérieur à 9999 continue sans troncature.

La réservation est durable et séparée de la création du document : si celle-ci échoue, le numéro réservé reste consommé. Des trous sont donc possibles. Cela protège contre la réutilisation d’un numéro réservé ; il ne s’agit pas d’une numérotation sans trous. Cette protection n’empêche pas, à elle seule, la double création métier d’une demande après deux soumissions distinctes.

## Protection en base

- Index unique `(company_id, reference)` sur les demandes EB et les documents de commande.
- Index unique identique sur les bons de trésorerie, hors dossiers de règlement `purpose=material_invoice` : ces derniers conservent une référence de règlement et ne sont pas des BT.
- Compteur BT partagé avec les anciens documents BT éventuellement stockés dans la table des commandes.
- Un trigger relève le maximum lors d’un import ou d’une mise à jour de référence. Une suppression ne diminue jamais le compteur.
- Aucun repli vers un numéro local ou un comptage en cas d’indisponibilité de la base.

Les contraintes d’unicité empêchent les doublons dans chacune des tables ; les nouveaux documents créés par l’application utilisent le compteur commun, y compris pour les BT historiques. Les imports doivent respecter le type et la table du document et être contrôlés avant reprise d’activité.

## Migrations et déploiement

1. `20261027120000_document_reference_counters` : contrôle préalable des doublons, initialisation des compteurs et index uniques.
2. `20261027123000_document_reference_tracking` : resynchronisation du maximum et suivi des imports par triggers.

Ces migrations s’exécutent transactionnellement au démarrage du serveur et verrouillent temporairement les écritures sur les trois tables. Elles ne renumérotent aucun historique. La première migration s’arrête explicitement si des références en doublon sont présentes, y compris des BT identiques répartis entre les deux anciennes tables. Faire un audit et décider de leur traitement avant de relancer ; ne pas renuméroter automatiquement des documents déjà diffusés.

Avant mise en service : sauvegarder, prévoir une courte interruption des créations pendant la bascule, appliquer les migrations puis utiliser le nouveau code. Les anciennes instances qui utilisent encore le comptage ne bénéficient pas du générateur atomique : les index peuvent refuser leurs collisions, sans les convertir automatiquement en nouvelles références.

**Ne jamais vider ou remettre à zéro les compteurs lors d’un nettoyage des documents.** Un nouveau départ commercial doit être décidé séparément. Les suppressions de compagnies et leurs effets sont hors de la procédure de nettoyage des documents.

## Vérifications

Tests unitaires : fuseau et passage d’année, grands suffixes et erreur de réservation sans repli.

Test PostgreSQL opt-in : six connexions, 60 créations concurrentes, trois types, deux compagnies, initialisation sur un historique avec trous, années séparées, migration rejouée, refus de doublons, import supérieur, suppression et réservation sans création. Les écritures de test utilisent un schéma temporaire explicite, fixé dans chaque transaction pour être compatible avec le pooler Neon ; elles ne doivent pas s’appuyer sur un `SET search_path` de session.

```powershell
npm run test:document-references
# Pour le test PostgreSQL (dans un environnement de recette configuré) :
$env:RUN_DOCUMENT_REFERENCES_INTEGRATION='1'
node --env-file=.env.development --import tsx --test server/db/documentReferences.integration.test.ts
```

Le test PostgreSQL supprime uniquement son schéma éphémère après validation. Ne pas activer d’envois externes ou de réinitialisation de base pour ce test.

## État de livraison

Le générateur atomique et les deux migrations sont inclus dans la livraison du 27 octobre 2026. Vérifier la réussite du déploiement Railway et des migrations avant de considérer cette version comme active. Le serveur de développement applique aussi automatiquement les migrations sur la base configurée ; cette configuration a été constatée sur le même hôte que la configuration de production enregistrée. Séparer les environnements avant la recette générale.
