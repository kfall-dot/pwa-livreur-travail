# Test d’envoi Brevo

Le script utilise `sendEmail`, comme l’application. Il envoie uniquement aux adresses passées en arguments, sans écriture en base ni notification métier. Il refuse le mode simulé et Mailtrap. Les secrets SMTP ne sont jamais affichés.

Après déploiement du script, dans un terminal du conteneur Railway du service de production (variables déjà présentes) :

```sh
npm run email:test -- kfallet@gmail.com kfallet@hotmail.com
```

Chaque exécution envoie un message par destinataire ; ne pas répéter inutilement. Ne pas utiliser cette commande comme commande de démarrage du service.

Le résultat `accepted_by_smtp` signifie que l’appel SMTP a été accepté, pas que le message est arrivé en boîte de réception. Rechercher la référence `EFPC-TEST-…` dans les journaux transactionnels Brevo et vérifier les deux boîtes et leurs indésirables. `failed` indique un échec ; les codes affichés permettent le diagnostic sans exposer les identifiants.

Le test direct ne vérifie pas les déclencheurs métier ni la file de notifications. Il vérifie la fonction d’envoi avec les variables de l’environnement dans lequel la commande est exécutée.

En local, compiler d’abord avec `npm run build:server`. Le script ne charge aucun fichier `.env` automatiquement et ne remplace jamais les variables Railway.
