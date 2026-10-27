# Checklist de mise en service — EFPC

Dernière mise à jour : 27 octobre 2026.

Périmètre : achats et gestion de chantier de la filiale BTP EFPC, hébergés sur Railway, avec PostgreSQL chez Neon et les e-mails via l’API HTTPS de Brevo.

**Cette checklist prépare la remise au client. Une case non cochée reste à vérifier ; une case cochée correspond uniquement à une vérification effectivement réalisée.** Elle ne vaut pas autorisation de nettoyer une base ou de déployer des changements.

## 1. Version et périmètre de remise

- [ ] Identifier la version exacte retenue pour la recette puis la remise : commit, date et responsable.
- [ ] Confirmer que Railway affiche un déploiement réussi pour cette version.
- [ ] Établir la liste des fonctions incluses et des réserves acceptées par le client.
- [ ] Comparer la version locale à la production et ne pas considérer une fonction locale comme livrée.
- [ ] Vérifier que la numérotation EB, BC et BT ne produit pas de doublons lors de créations simultanées, avant l’utilisation réelle.
- [ ] Désigner un responsable client pour la recette et un interlocuteur technique.

Référence vérifiée le 26 octobre 2026 : modèles d’e-mails EFPC déployés, commit `c1931c2`. Il s’agit d’un point de repère, pas d’une garantie sur la version active au moment de la remise.

Numérotation : générateur atomique implémenté et testé, inclus dans la livraison du 27 octobre 2026. Vérifier le déploiement de cette livraison ; la case de recette de production reste ouverte. Voir [Numérotation des documents](NUMEROTATION-DOCUMENTS.md). La configuration de développement pointe vers le même hôte que la configuration de production enregistrée : séparer ces environnements avant de poursuivre la recette générale.

## 2. Application, base et pièces jointes

- [ ] L’application répond sur https://pwa-livreur-travail-production.up.railway.app/.
- [ ] La connexion des utilisateurs fonctionne sur https://pwa-livreur-travail-production.up.railway.app/manager/login.
- [ ] La base PostgreSQL Neon utilisée est bien celle de production ; les migrations de la version livrée sont appliquées.
- [ ] La connexion DB est configurée dans Railway sous `NETLIFY_DB_URL` : nom technique hérité conservé par le serveur, sans hébergement Netlify.
- [ ] `PUBLIC_BASE_URL` correspond à l’adresse publique de production, sans adresse locale.
- [ ] Les secrets de production sont conservés dans les variables Railway, sans dépôt dans Git ni dans les documents de remise.
- [ ] `JWT_SECRET` est renseigné avec une valeur forte ; les accès Railway et Neon sont limités aux personnes désignées.
- [ ] Le volume persistant Railway est monté sur `/data`.
- [ ] Les photos et pièces jointes sont effectivement stockées sur ce volume : `PHOTO_STORAGE=local`, `PHOTOS_DIR=/data/delivery-photos` et pièces EB sous `/data/eb-attachments`, sauf surcharge explicitement vérifiée.
- [ ] Une photo et une pièce jointe de recette restent consultables après un redéploiement.
- [ ] Les documents EB, BC, BT, BL et les factures du périmètre sont accessibles aux seuls utilisateurs autorisés.
- [ ] Les documents produits présentent l’identité EFPC attendue.

## 3. E-mails Brevo

Configuration retenue : **API HTTPS**, sans utilisation du relais SMTP.

- [ ] `EMAIL_PROVIDER=brevo`.
- [ ] `BREVO_API_KEY` contient une clé API Brevo active, différente de la clé SMTP.
- [ ] `EMAIL_FROM` correspond à un expéditeur validé dans Brevo ; expéditeur utilisé pendant les tests : `kfallet@gmail.com`.
- [ ] Le client valide l’adresse d’expédition à conserver pour la remise et son identité dans Brevo.
- [ ] L’IP de sortie du service est autorisée dans Brevo lorsque la protection des clés API est active ; vérifier la continuité de cette autorisation après redéploiement et prévoir une IP de sortie stable si nécessaire.
- [x] Test direct depuis le conteneur Railway accepté par l’API Brevo et reçu sur Gmail et Hotmail le 26 octobre 2026.
- [x] Nouveaux modèles EFPC déployés le 26 octobre 2026 : logo, coordonnées, libellés lisibles et boutons d’action.
- [ ] Vérifier un e-mail effectivement déclenché par le parcours d’achat, son destinataire et son rendu dans la boîte de réception.
- [ ] Vérifier les liens d’invitation et de réinitialisation du mot de passe, avec des comptes de recette.
- [ ] Vérifier les boutons vers les demandes et certificats ainsi que les contrôles d’accès après ouverture.
- [ ] Désigner la personne qui consulte les journaux transactionnels Brevo en cas d’échec.

Test technique, à lancer une seule fois dans la console du service Railway avec les destinataires autorisés :

```sh
npm run email:test -- kfallet@gmail.com kfallet@hotmail.com
```

`accepted_by_brevo_api` confirme l’acceptation par Brevo ; la réception doit aussi être vérifiée. Ce test ne remplace pas la recette des déclencheurs métier. Voir [Test e-mail production](TEST-EMAIL-PRODUCTION.md).

## 4. SMS

- [ ] Identifier le fournisseur SMS réellement configuré en production et la personne qui le gère.
- [ ] Vérifier la configuration du fournisseur et la disponibilité des moyens nécessaires à l’envoi.
- [ ] Vérifier les numéros des destinataires, avec indicatif international.
- [ ] Réaliser un envoi réel vers un numéro de test autorisé et confirmer sa réception.
- [ ] Vérifier au moins une notification SMS issue du parcours métier retenu avec le client.

**Réception réelle des SMS non encore confirmée dans la recette consignée.** Le succès des e-mails Brevo ne valide pas les SMS.

## 5. Données et accès client

- [ ] Faire valider les utilisateurs réels : CdC, DT, adjoints SA, chef SA, CdG, DAF, PDG, Comptabilité et Trésorerie, selon l’organisation du client.
- [ ] Vérifier les adresses e-mail et téléphones des comptes.
- [ ] Vérifier les affectations aux chantiers et les relations adjoints/chef SA.
- [ ] Vérifier que le CdC ne voit que les EB qu’il est autorisé à consulter.
- [ ] Vérifier que les adjoints SA ne peuvent pas transmettre directement au CdG lorsque la validation du chef est requise.
- [ ] Vérifier que seule la Trésorerie peut enregistrer le paiement dans le parcours retenu.
- [ ] Faire remplacer les mots de passe et NIP de test avant la remise ; vérifier concrètement la procédure de modification ou de réinitialisation.
- [ ] Retirer les accès de démonstration inutiles après validation des comptes de remplacement.
- [ ] Contrôler que les fonctions de peuplement et de réinitialisation de test ne sont pas actives en production : `ALLOW_SEED` et `ALLOW_RESET` désactivés.
- [ ] Valider les données de référence : chantiers, fournisseurs, produits, unités, budgets et désignations de main-d’œuvre.
- [ ] Définir les quantités et soldes de départ à reprendre, s’il y en a ; ne pas assimiler automatiquement les données de test à une situation réelle.

## 6. Recette des parcours métier

Utiliser des dossiers de recette identifiés et consigner, pour chaque scénario, le résultat attendu, le résultat constaté, les preuves et les anomalies. Privilégier un environnement séparé ; aucune réinitialisation de production pour exécuter la recette.

- [ ] EB matériaux à crédit jusqu’à la facture, sa transmission et son paiement.
- [ ] EB matériaux au comptant avec BT et validations applicables.
- [ ] EB main-d’œuvre jusqu’au paiement.
- [ ] Création d’une EB par le SA et par un adjoint SA.
- [ ] Validation des montants et signature du BC par le chef SA lorsque l’action a été préparée par un adjoint.
- [ ] Passage de relais entre CdC, DT, SA, CdG, DAF, PDG, Comptabilité et Trésorerie selon les cas applicables.
- [ ] Retour pour correction, nouvelle soumission et reprise des validations.
- [ ] Refus définitif limité au DAF et au PDG, conformément à la règle retenue à ce stade.
- [ ] Réception fournisseur complète, partielle et refusée ; conservation et consultation des photos et justificatifs.
- [ ] Stock chantier calculé à partir des livraisons confirmées et diminué des consommations de « Ma journée ».
- [ ] Modification ou suppression d’une consommation avec recalcul du disponible.
- [ ] Quantités disponibles visibles lors de la saisie de consommation.
- [ ] Statuts, montants et indicateurs cohérents entre les espaces des différents rôles.
- [ ] Filtre de dates de la Comptabilité vérifié avec des opérations sur des périodes différentes.
- [ ] Dépenses de main-d’œuvre correctement prises en compte dans les indicateurs de l’Enveloppe du CdG.
- [ ] Verrou de prise en charge entre chef SA et adjoints vérifié, y compris sur deux sessions simultanées.
- [ ] Double clic ou nouvelle tentative après interruption sans création en double ni perte de pièces jointes.
- [ ] Temps de génération d’un BC et temps des principales validations mesurés sur la version de production retenue.
- [ ] Aucun blocage ni anomalie majeure restante sur les droits, montants, stocks, pièces ou paiements ; réserves mineures acceptées par le client.

## 7. Nettoyage et sauvegardes

- [ ] Définir précisément les données de test à retirer et les données de référence à conserver ; faire valider ce périmètre avant toute suppression.
- [ ] Sauvegarder la base Neon et les fichiers du volume Railway avant le nettoyage.
- [ ] Effectuer une restauration de test dans un environnement séparé, couvrant la base et les pièces jointes.
- [ ] Définir la fréquence des sauvegardes, leur conservation, leur accès et le responsable de restauration.
- [ ] Réaliser le nettoyage autorisé, puis vérifier les liens entre chantiers, comptes, documents et pièces jointes.
- [ ] Vérifier les compteurs et règles de numérotation après nettoyage ; ne pas réutiliser implicitement une référence déjà remise ou utilisée réellement.
- [ ] Rejouer un parcours de contrôle après préparation des données client.

## 8. Remise et démarrage accompagné

- [ ] Former chaque rôle à ses actions, validations, retours pour correction et consultation des pièces.
- [ ] Fournir les accès au client par un canal approprié, sans secrets dans cette checklist.
- [ ] Définir la propriété et la gestion des comptes Railway, Neon, Brevo et du fournisseur SMS, ainsi que le paiement des abonnements.
- [ ] Identifier l’administrateur client, le contact support, les horaires de prise en charge et la procédure de signalement d’un incident.
- [ ] Vérifier l’accès aux journaux Railway et aux journaux Brevo pour le responsable du support.
- [ ] Remettre le guide utilisateur correspondant à la version livrée et les procédures de récupération d’accès.
- [ ] Signer la recette : version, périmètre, réserves, responsables et date de démarrage.
- [ ] Démarrer sur un chantier accompagné, puis élargir après vérification des premières EB, réceptions, consommations et paiements.
- [ ] Organiser un point de suivi après les premières opérations réelles.

## 9. Dépannage de premier niveau

| Symptôme | Vérification |
|---|---|
| Application indisponible | État du déploiement, domaine public et journaux du service Railway. |
| Erreur de base | Connexion Neon, variable DB du service et migrations de la version déployée. |
| Photo ou pièce jointe absente | Volume `/data`, chemins de stockage, droits d’accès et journaux Railway. Ne pas supprimer les fichiers pour tenter de résoudre le problème. |
| E-mail refusé avec HTTP 401 | Clé API Brevo, variables appliquées au conteneur, autorisation de l’IP de sortie. |
| E-mail accepté mais absent | Journaux transactionnels Brevo, adresse destinataire et courriers indésirables. |
| SMS absent | Fournisseur réellement configuré, destinataire, résultat de l’envoi et moyens nécessaires au fonctionnement du fournisseur. |
| Mauvais accès ou action indisponible | Rôle d’accès, espace de travail, affectation chantier, relation d’équipe, état de la demande et verrou de prise en charge. |
| Statut ou montant différent selon le rôle | Référence exacte du dossier, actualisation, étape du parcours et journaux ; consigner l’écart avant correction. |

## Documents de travail associés

- [Plan de fiabilisation, factures et prévisions](PLAN-FIABILISATION-FACTURES-PREVISIONS.md).
- [Test d’envoi en production](TEST-EMAIL-PRODUCTION.md).
- [Modèles d’e-mails EFPC](MODELES-EMAILS-EFPC.md).

Les propositions de holding, prévisions avancées et clôture de chantier ne sont pas des fonctions présumées livrées ni des étapes obligatoires de cette mise en service. Toute extension du périmètre doit être explicitement convenue avec le client.
