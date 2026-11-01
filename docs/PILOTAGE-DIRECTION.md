# Pilotage DAF et PDG — première version

## Objectif

Une page d’entrée de prévention, distincte de la file de validation, pour la compagnie connectée. Le mode holding n’est pas activé par cette évolution. Les droits existants des API restent applicables.

## Sources et périmètre

- `/procurement/site-budgets` : enveloppes, engagé, réalisé et reste à engager. L’engagé et le réalisé ne s’additionnent pas.
- `/procurement/requests` : demandes accessibles au rôle, sans élargir leur visibilité. La file DAF inclut `daf_review` et `daf_bt_review` ; la file PDG inclut `pdg_review`.
- `/procurement/bc-register?month=all` : BC réceptionnés du registre, toutes périodes. Les factures transmises non marquées payées sont dédupliquées par BC. Leur montant est celui du registre BC ; il ne constitue ni un solde fournisseur ni une dette diminuée de paiements partiels.

Les sources se chargent indépendamment : un échec indique une vue partielle et une valeur indisponible, jamais un zéro de substitution. Date de lecture affichée ; actualisation manuelle et chaque minute lorsque la page est visible.

## Signaux indicatifs à confirmer avec la direction

- Engagement supérieur à l’enveloppe : dépassement.
- Engagement à partir de 90 % : point de vigilance.
- Dépense sans enveloppe renseignée : couverture impossible à évaluer.
- Dossier en préparation/validation sans modification depuis au moins 7 jours : à examiner. Il s’agit de l’ancienneté depuis `updatedAt`, pas du temps passé dans l’étape, d’un retard de paiement ou d’une échéance contractuelle.
- Dossier urgent à l’étape du rôle connecté : à examiner.

Chaque signal donne accès au dossier concerné ou au suivi budgétaire. Aucun signal ne modifie le circuit ni ne bloque une action. Les enveloppes absentes sont distinctes de zéro ; la couverture des chantiers est affichée.

## Présentation par rôle

- DAF : engagements, réalisé, factures à payer, décisions ; liste des factures du registre avec accès aux EB.
- PDG : décisions mises en tête, puis engagements, réalisé et factures à payer. Signaux et comparaison des chantiers restent accessibles.

## Limites assumées

Pas de solde bancaire, prévisionnel de trésorerie, classement des paiements par échéance ni comparaison dépenses/avancement : ces données ne sont pas suffisamment consolidées dans cette première version. L’absence de signal ne garantit pas l’absence de risque. Les totaux ne sont pas limités au mois courant.

Avant remise : faire valider par le DAF et le PDG les définitions, seuils, informations prioritaires et données manquantes sur quelques dossiers représentatifs.
