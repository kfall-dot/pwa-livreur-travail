# Modèles SMS EFPC

Date : 27 octobre 2026.

Modèles inclus dans la livraison du 31 octobre 2026 ; vérifier le déploiement Railway avant recette. Aucun SMS réel n’a été envoyé pour les vérifications automatiques.

## Alertes métier

Préfixe `EFPC -`, titre court et lisible, référence EB/BC/BT lorsqu’elle est disponible dans le message, puis invitation à consulter l’espace utilisateur. Les détails financiers, pièces jointes et longs commentaires restent dans l’application et les e-mails.

Exemple :

```text
EFPC - EB-2026-0042 — Validation du DAF
Consultez votre espace dans l'application.
```

Les titres longs sont abrégés et les références répétées sont dédupliquées. Au maximum deux références supplémentaires sont ajoutées. Les SMS ne contiennent pas de logo et ne reprennent pas les anciens chemins internes non fonctionnels.

## Livraison

Les SMS de confirmation de livraison complète, partielle ou refusée commencent par `EFPC -`. Le code, la référence, les indications de livraison et les consignes de transmission au livreur sont conservés. Les SMS d’affectation de tournée portent également le préfixe EFPC.

Les messages contenant des produits ou noms longs peuvent encore occuper plusieurs segments ; aucune garantie de facturation sur un seul segment n’est donnée.

## Expéditeur et transport

Ce changement personnalise le corps du SMS. Il ne change ni le numéro d’expédition ni la configuration du fournisseur, et n’active pas un expéditeur alphanumérique. La possibilité d’afficher EFPC à la place d’un numéro nécessite une vérification séparée auprès du fournisseur utilisé.

Les transporteurs SMS, le circuit d’envoi et le fonctionnement des codes de confirmation restent ceux du code existant. La file persistante est incluse dans la même livraison ; elle reste un mécanisme distinct de la personnalisation.

## Vérifications

Tests des modèles : identité EFPC, statuts lisibles, références conservées sans répétition, titres longs abrégés, détails financiers absents des alertes et code de confirmation préservé. Avant remise au client : vérifier la réception réelle et le contenu sur un numéro de test autorisé, après déploiement.
