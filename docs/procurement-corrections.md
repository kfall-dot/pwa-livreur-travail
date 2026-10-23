# Retours de validation des EB

Une demande de correction est distincte d'un refus définitif. Elle exige une nature,
un destinataire et un motif. La fiche présente le retour, son auteur, la réponse et
les versions antérieures des BC/BT.

| Contrôleur | Retour autorisé |
| --- | --- |
| DT | Préparateur de l'EB au stade de validation DT |
| Chef SA | Ressource de son équipe, pour le chiffrage ou la préparation du BC |
| CdG / DAF / PDG | Responsable SA pour le commercial ; DT pour le besoin, ou initiateur SA pour une EB créée par le SA |
| Trésorerie | Responsable SA pour les matériaux, DT pour le circuit hors SA |

Seuls le DAF et le PDG peuvent refuser définitivement à leur étape, avec motif et
NIP. Le CdG ne dispose pas de ce droit.

## Traitement

- La personne désignée prend en charge la demande et renseigne les corrections.
- Un adjoint SA repasse obligatoirement par son chef. Le chef peut valider avec son
  NIP ou retourner à nouveau la correction à une ressource de son équipe.
- Une modification économique invalide les anciens visas financiers et archive les BC
  remplacés. Les validations financières reprennent sur le contenu corrigé.
  Le visa DT est conservé si le besoin reste identique ; un besoin modifié exige
  une nouvelle validation DT.
- Un complément documentaire conserve les visas et revient à l'étape demandeuse.
- Un BC corrigé reste soumis à la signature habituelle du chef SA après validation
  de la correction ; la validation du retour ne signe pas automatiquement le BC.
- La livraison et les dépenses réalisées restent comptabilisées pendant un retour
  documentaire. Le paiement est suspendu jusqu'à la fin de la correction.
- Une EB planifiée ou livrée ne peut recevoir qu'un complément documentaire. Une
  demande comportant déjà un paiement exige une régularisation hors de ce circuit.

La correction porte sur les lignes existantes : désignation, quantité, unité,
commercial ou pièces selon la nature du retour. Elle ne permet pas d'ajouter ou
de supprimer des lignes. Un changement de fournisseur exige une nouvelle pièce.

## Vérification

Les tests unitaires couvrent les droits par rôle et les étapes de reprise.
`server/services/procurementCorrections.integration.test.ts` vérifie les routes
authentifiées, la prise en charge, les retours successifs, le chef SA, la
régénération du BC, les archives, l'invalidation des visas et les paiements bloqués.
Il s'active avec `RUN_PROCUREMENT_CORRECTION_INTEGRATION=1`, utilise une entreprise
fictive UUID et nettoie uniquement ses données.

Les deux migrations `20261024120000_procurement_corrections` et
`20261024121000_correction_head_review` sont requises avant l'utilisation des routes.
Le serveur les applique normalement au démarrage.
