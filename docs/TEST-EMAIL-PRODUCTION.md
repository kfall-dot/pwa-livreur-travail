# Test d’envoi Brevo

## API HTTPS (production Railway)

Configurer dans Railway : `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY` (clé API Brevo, différente de la clé SMTP), `EMAIL_FROM=kfallet@gmail.com` (expéditeur validé). Saisir la clé directement dans Railway, jamais dans le dépôt ni dans le chat. Appliquer les variables et attendre le redéploiement. La configuration SMTP peut rester présente ; elle n’est pas utilisée avec `EMAIL_PROVIDER=brevo`.

Le résultat `accepted_by_brevo_api` et un `messageId` confirment l’acceptation par l’API, pas la livraison. Un code HTTP 401/403 indique un problème d’authentification/autorisation ; 400 une requête refusée ; 429 une limitation. Aucun corps d’erreur externe ni clé n’est affiché. Aucun repli silencieux vers le mode simulé ou SMTP n’a lieu.

Le script utilise `sendEmail`, comme l’application. Il envoie uniquement aux adresses passées en arguments, sans écriture en base ni notification métier. Il refuse le mode simulé et Mailtrap. Les secrets SMTP ne sont jamais affichés.

Après déploiement du script, dans un terminal du conteneur Railway du service de production (variables déjà présentes) :

```sh
npm run email:test -- kfallet@gmail.com kfallet@hotmail.com
```

Chaque exécution envoie un message par destinataire ; ne pas répéter inutilement. Ne pas utiliser cette commande comme commande de démarrage du service.

Le résultat `accepted_by_smtp` signifie que l’appel SMTP a été accepté, pas que le message est arrivé en boîte de réception. Rechercher la référence `EFPC-TEST-…` dans les journaux transactionnels Brevo et vérifier les deux boîtes et leurs indésirables. `failed` indique un échec ; les codes affichés permettent le diagnostic sans exposer les identifiants.

Le test direct ne vérifie pas les déclencheurs métier ni la file de notifications. Il vérifie la fonction d’envoi avec les variables de l’environnement dans lequel la commande est exécutée.

En local, compiler d’abord avec `npm run build:server`. Le script ne charge aucun fichier `.env` automatiquement et ne remplace jamais les variables Railway.
