# Modèles d’e-mails EFPC

Les modèles sont générés par l’application ; aucun modèle Brevo ni identifiant de modèle externe n’est nécessaire. `server/services/emailTemplates.ts` fournit l’en-tête, le logo public, le pied de page EFPC et les libellés métier. Le service d’envoi enveloppe aussi les messages sans mise en forme spécifique.

Le nom d’affichage de l’expéditeur est `EFPC` par défaut, personnalisable avec `EMAIL_FROM_NAME`. L’adresse `EMAIL_FROM` reste celle validée chez Brevo : par exemple `EFPC <kfallet@gmail.com>`. Le nom est transmis à l’API Brevo et au transport SMTP ; aucune modification de l’adresse ou des identifiants n’est nécessaire. Un carnet de contacts du destinataire peut toutefois afficher son propre nom enregistré.

- Invitation : entreprise, auteur, activation du compte, expiration de 72 heures.
- Réinitialisation du mot de passe : lien individuel, expiration d’une heure.
- Achats : étapes d’EB, BC prêt, révision, corrections, facture et paiement ; bouton vers `/manager?tab=achats`.
- Livraison : quantités attendues/livrées et bouton vers le certificat fourni par le circuit existant.

Les anciens chemins `/manager/procurement/…` ne correspondent pas aux routes du frontal. Le bouton des e-mails achats ouvre donc la liste des demandes, pas directement une fiche. Il est nommé « Consulter les demandes ». Les contrôles d’accès continuent de s’appliquer dans l’application.

Le logo est chargé depuis `${PUBLIC_BASE_URL}/branding/efpc-logo.png`. PUBLIC_BASE_URL doit être l’URL publique de production ; un client mail peut masquer les images distantes. Le nom EFPC et les coordonnées restent lisibles sans image. L’identité est celle du pilote EFPC ; l’adaptation par filiale appartient au futur lot holding.

Les saisies dynamiques sont échappées dans les modèles ; seuls les liens HTTP/HTTPS sont proposés. Les modèles d’accès au compte conservent les liens et jetons existants. La version texte est conservée dans les charges utiles ; l’API Brevo envoie le HTML lorsqu’il est présent.

Les modifications de modèles ne rejouent pas les anciens messages. La file persistante des notifications reste un changement local distinct tant qu’elle n’a pas été déployée. Le déploiement des modèles n’est pas automatique lors de leur édition locale.
