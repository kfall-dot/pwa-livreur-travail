# Notifications persistantes et performances

## Périmètre

Les notifications d’information ne doivent pas faire attendre l’enregistrement métier :

- demandes d’achats, changements de statut, validations et corrections ;
- génération et signature des BC, événements BT et paiements ;
- transmission des factures ;
- confirmations de réception et certificats de livraison ;
- affectation de tournées aux livreurs ;
- notifications internes demandant un SMS via `notifyManager`.

La notification interne et les jobs externes des notifications Achats sont insérés dans une même transaction, par lots. La réponse signifie « notification enregistrée/en attente », pas « e-mail ou SMS livré ». Les notifications de livraison sont limitées à la compagnie de la tournée.

Les OTP restent synchrones. Les invitations de comptes et réinitialisations de mots de passe restent aussi sur leur parcours d’accès existant. Aucun changement de politique de signature/NIP.

## File et worker

Migration additive : `20261025010000_notification_outbox`.

Le serveur Node démarre le worker après les migrations. Chaque cycle réserve jusqu’à 4 messages avec `FOR UPDATE SKIP LOCKED`. L’appel au fournisseur se fait hors transaction ; les utilisateurs n’attendent plus SMTP/SMS. Une mise en file réveille le worker local après persistance. Le cycle suivant attend la prochaine échéance de reprise ou de bail ; à vide, un contrôle de secours est espacé de 10 minutes pour éviter une interrogation constante de Neon. Le démarrage relit la file. Le cycle suivant ne chevauche pas le précédent dans un même processus. Plusieurs instances peuvent réserver des jobs sans traiter simultanément la même réservation.

- Baux de 5 minutes : une réservation abandonnée reprend après expiration, y compris après redémarrage.
- Jusqu’à 8 tentatives, avec délai croissant de 30 secondes à 1 heure maximum.
- États `pending`, `processing`, `sent`, `failed`. Un échec définitif reste conservé.
- Les échecs e-mail et SMS sont indépendants. Une réponse fournisseur `success:false` est un échec, pas un envoi réussi.
- L’indicateur interne `smsSent` est positionné seulement après acceptation par le fournisseur.
- L’endpoint d’exploitation existant `/admin/ops-status` expose uniquement les compteurs de file, sans corps des messages ni coordonnées.
- `NOTIFICATION_WORKER_DISABLED=1` permet de suspendre le traitement sans supprimer la file.

La livraison externe est au moins une fois : un crash après acceptation fournisseur et avant confirmation en base peut provoquer une répétition. Il n’existe pas de garantie « exactement une fois » SMTP/SMS. Les certificats utilisent une clé de déduplication par reçu/destinataire ; les canaux liés aux notifications internes utilisent leur identifiant.

L’insertion de notification reste un appel de base après certaines opérations métier déjà validées ; cette évolution ne transforme pas tous les workflows métier en une transaction globale unique. Une panne de base à cet instant exige une investigation : les reprises automatiques concernent les messages effectivement enregistrés dans la file.

## Autres gains

- Le HTML stocké des BC/BT (`pdfHtml`), qui inclut parfois un logo embarqué volumineux, n’est plus renvoyé dans les JSON de navigation Achats. Les documents restent accessibles par les endpoints HTML autorisés.
- Un BC est généré une seule fois avec sa référence définitive avant insertion ; suppression de la génération provisoire et de la seconde écriture HTML.
- Lectures indépendantes parallélisées ; résolution des fournisseurs sans recharger le dossier et tous ses documents ; réduction des lectures répétées dans l’émission multi-fournisseurs.
- Les BC restent créés successivement : aucune parallélisation des créations utilisant la numérotation existante.

## Vérification et exploitation

Tests : génération multi-BC, JSON allégé avec consultation HTML conservée, notifications internes immédiates, traitement concurrent, canaux en échec, reprises, baux expirés, arrêt après 8 tentatives et isolation compagnie.

Les tests d’intégration utilisent `NOTIFICATION_OUTBOX_TEST_MODE=1` en environnement non production. Ces jobs portent `test_only=true` et sont ignorés par le worker normal. Leur traitement manuel exige explicitement des transports simulés. Aucun test ne doit utiliser de destinataire réel.

Surveiller les compteurs `pending`, `processing` et surtout `failed`, ainsi que les logs `[notification-outbox]`. Corriger la configuration du fournisseur avant toute reprise opérateur des messages en échec définitif. Les messages peuvent contenir des données métier et des liens documentaires : appliquer les règles de sauvegarde, d’accès et de conservation de la base. Aucun destinataire ni contenu n’est exposé dans les compteurs d’exploitation.

Les temps mesurés sur des fixtures de développement ne sont pas une garantie de temps en production ; effectuer ensuite une mesure des parcours réels après déploiement.
