# Arrêtés mensuels de gestion

## Nature de la première version

Photographie de gestion validée par le DAF, distincte d’une clôture comptable. Aucun dossier, facture, réception, consommation ou paiement n’est bloqué à la fin du mois. Aucune écriture comptable n’est produite dans le logiciel externe.

## Périmètre et dates

- Le mois sélectionné est celui de la réception dans le registre BC existant (`filterBcRegisterByMonth`). Les montants sont ceux du registre, dédupliqués par BC. Ce n’est ni un journal exhaustif des dépenses du mois, ni une balance fournisseur : les montants réceptionnés sont séparés des paiements.
- Les paiements de Trésorerie (matériaux et main-d’œuvre) sont listés séparément selon `paidAt`, dans le fuseau métier. Ils ne sont jamais additionnés aux montants réceptionnés, pour éviter un double compte.
- Les indicateurs de factures et de paiement décrivent leur état **lors de la lecture/validation**, même si le mois sélectionné est ancien. Aucun état historique de fin de mois n’est reconstitué.
- Les budgets sont conservés séparément comme contexte cumulé à la date de lecture. Ils n’entrent pas dans le total mensuel des BC.
- Le nom et la présence des fichiers sont conservés dans la photographie ; les copies des pièces jointes elles-mêmes ne sont pas archivées par ce mécanisme. Une pièce remplacée sous le même nom ne peut pas être détectée par ce seul arrêté.

## Rôles

- Comptabilité : consultation/préparation des contrôles ; aucune validation d’arrêté.
- DAF : consultation, contrôle explicite du registre, NIP puis validation d’un mois terminé.
- PDG : consultation et impression des versions validées.
- Les autres rôles, y compris un administrateur SA, n’ont pas cet accès.

La première version ne comporte pas de statut distinct « préparé par la Comptabilité » ; le DAF atteste avoir effectué les contrôles nécessaires et consigne les réserves.

## Versions et corrections

Une version contient le détail chiffré, le contexte budgétaire, l’auteur DAF, l’horodatage serveur et son commentaire. Les tables métier continuent à évoluer. L’interface compare la lecture actuelle à la dernière version (BC ajoutés, retirés, modifiés). Une évolution du contexte budgétaire peut aussi modifier l’empreinte.

- Une nouvelle validation d’un contenu modifié exige un motif d’au moins 10 caractères.
- Le serveur recalcule l’empreinte de la lecture avant validation ; en cas de changement, il demande une actualisation.
- Une même lecture validée deux fois conserve la même version. Les numéros de version sont attribués sous verrou transactionnel par compagnie/mois.
- Aucun endpoint de modification ou suppression d’une version n’est exposé. Les versions antérieures restent consultables et imprimables avec l’identité de la compagnie.

Il s’agit d’une trace entre lectures validées, pas d’un journal de toutes les modifications intermédiaires ni de leur auteur. Les sources du registre et des budgets sont lues à la demande ; ce mécanisme ne verrouille pas les transactions métier pendant cette lecture.

## Installation et exploitation

Migration additive : `20261024230000_management_statements`. Les tables et les données de production ne sont pas purgées. Le démarrage du serveur applique les migrations par le mécanisme habituel. La table doit être incluse dans les sauvegardes.

Avant remise client : confirmer avec le DAF la portée du mois, la reprise des factures tardives, l’archivage des justificatifs, le rôle de préparation comptable et le raccord avec son logiciel de comptabilité. Cette version ne doit pas être présentée comme une clôture comptable officielle.
