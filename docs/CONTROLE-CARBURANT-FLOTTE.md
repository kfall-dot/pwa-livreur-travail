# Contrôle des dépenses et consommations de carburant — flotte EFPC

Date : 27 octobre 2026.

**Statut : proposition à valider avec le CdG et le client.** Ce document consigne les recommandations discutées. Il ne constitue ni une preuve de fraude, ni une procédure déjà approuvée, ni une fonctionnalité déjà développée. Sa rédaction n’engage pas de réalisation ou de déploiement.

## 1. Contexte et objectif

Le CdG signale que la flotte effectue ses pleins le lundi, alors que les véhicules n’accomplissent pas les mêmes parcours dans la semaine. Il soupçonne d’éventuelles irrégularités dans les dépenses de carburant. Les fonds sont actuellement perçus suivant un fonctionnement comparable au paiement de la main-d’œuvre.

Il reste à confirmer si les conducteurs reçoivent une somme fixe, une avance estimative ou le montant exact de l’achat, et comment les tickets et reliquats sont traités.

L’objectif est de rapprocher quatre éléments : **véhicule → déplacements → carburant acheté → argent décaissé**. Une consommation élevée est une anomalie à examiner, pas une preuve de fraude.

## 2. Principes de la procédure proposée

- Conserver le lundi comme rendez-vous de contrôle et de ravitaillement si ce rythme convient à l’exploitation ; il ne justifie pas une dotation identique pour tous les véhicules.
- Suivre chaque véhicule dans le temps et tenir compte de son usage, plutôt que comparer indistinctement tous les conducteurs.
- Enregistrer tous les achats, y compris les appoints en cours de semaine.
- Distinguer l’argent versé, le carburant acheté, la consommation estimée et les montants justifiés.
- Séparer la préparation, l’autorisation, le paiement et le contrôle indépendant.
- Tracer les exceptions et leur résolution sans qualifier automatiquement un écart de fraude.

## 3. Référentiel des véhicules

Créer une fiche par véhicule :

| Donnée | Utilité |
|---|---|
| Identifiant et immatriculation | Rattacher sans ambiguïté les achats et les avances. |
| Type de véhicule et carburant autorisé | Comparer des usages pertinents et détecter une erreur de carburant. |
| Capacité du réservoir | Contrôler les quantités achetées. Documenter tout réservoir auxiliaire autorisé. |
| Conducteur habituel | Identifier la responsabilité opérationnelle, sans assimiler une anomalie à sa responsabilité personnelle. |
| Historique des affectations | Conserver les changements de conducteur et leurs dates. |
| Kilométrage initial vérifié | Disposer d’une base de suivi. |
| État et événements techniques significatifs | Expliquer les variations liées à l’entretien ou à une panne. |

La consommation de référence devra être construite avec les données constatées et les caractéristiques du véhicule. Un chiffre constructeur ne doit pas devenir seul un seuil de sanction.

## 4. Justification de chaque ravitaillement

| Information requise | Justificatif ou contrôle proposé |
|---|---|
| Véhicule, conducteur et bénéficiaire de l’avance | Rapprochement avec les affectations et le décaissement. |
| Date et station | Ticket lisible et station identifiée. |
| Kilométrage au moment de l’achat | Photo du compteur et contrôle de progression. |
| Type et quantité de carburant en litres | Ticket et cohérence avec le véhicule. |
| Prix unitaire et montant total | Rapprochement du calcul ; tolérance d’arrondi à définir. |
| Plein complet ou appoint | Déclaration obligatoire pour déterminer si une consommation peut être calculée. |
| Mode de règlement | Espèces issues d’une avance, paiement direct à la station ou autre mode autorisé. |
| Mission, parcours ou usage professionnel | Rapprochement avec l’activité réelle du véhicule. |
| Référence de l’avance ou du paiement | Rattachement au circuit financier et prévention d’une double justification. |

Tous les ravitaillements intermédiaires doivent être saisis, quelle que soit leur date ou leur source de financement autorisée. Un ticket ou une photo apporte une trace, mais ne garantit pas à lui seul la réalité de l’achat ; prévoir des vérifications ponctuelles indépendantes.

## 5. Calcul de la consommation

### Méthode entre deux pleins complets

Lorsque le réservoir est plein au départ et de nouveau plein à l’arrivée :

**Consommation en L/100 km = litres ajoutés sur l’intervalle ÷ kilomètres parcourus × 100.**

- Les kilomètres correspondent à la différence entre les compteurs des deux pleins complets.
- Les litres comprennent les appoints intermédiaires et le plein final.
- Le plein initial est exclu des litres de l’intervalle.
- Les litres achetés n’équivalent à la consommation de l’intervalle que sous ces conditions, avec des données complètes et des niveaux de départ et d’arrivée comparables.

| Exemple fictif | Distance | Litres ajoutés | Résultat |
|---|---:|---:|---:|
| Véhicule A | 500 km | 45 L | 9 L/100 km |
| Véhicule B | 200 km | 36 L | 18 L/100 km |

Le résultat du véhicule B appelle une vérification, pas une conclusion de fraude. Examiner notamment la circulation, les charges, les temps moteur à l’arrêt, les conditions de parcours, les achats manquants et l’état mécanique.

### Cas non calculables ou à traiter séparément

Si les pleins complets ne sont pas fiables, les compteurs manquent, la distance est nulle ou les achats sont incomplets, afficher **« consommation non calculable sur cet intervalle »** avec le motif. Ne pas afficher une valeur trompeuse ou diviser par zéro.

Les engins dont l’usage dépend principalement des heures moteur nécessiteraient un suivi distinct, éventuellement en litres par heure. Ne pas leur appliquer automatiquement les règles des véhicules routiers.

## 6. Circuit financier et justification des avances

Réutiliser les principes du circuit financier de la main-d’œuvre, tout en créant une nature distincte **« Carburant »** et un rattachement obligatoire au véhicule. Le détail des rôles et validations reste à confirmer ; la proposition ne modifie pas implicitement les circuits existants.

### Étapes proposées

1. Le conducteur ou le responsable de flotte prépare la demande et indique le véhicule, le besoin et les missions prévues.
2. Le responsable désigné confirme le besoin opérationnel et le montant autorisé.
3. Les validations financières suivent le circuit convenu avec le client.
4. La Trésorerie remet l’avance au bénéficiaire identifié ou paie directement la station.
5. Les achats sont enregistrés avec leurs justificatifs et rapprochés du décaissement.
6. Le CdG examine les écarts et fait demander les compléments nécessaires.
7. Le dossier est soldé après justification des dépenses et traitement du reliquat.

Une personne ne doit pas pouvoir préparer, autoriser, payer et contrôler seule sa propre dépense. Le responsable de flotte peut être une personne désignée sans création automatique d’un nouveau rôle d’accès ; l’organisation doit être validée.

### Avance et reliquat

Exemple : avance de **40 000 FCFA**, achat justifié de **32 500 FCFA**, reliquat de **7 500 FCFA**. Le reliquat doit être restitué avec une preuve ou conservé comme solde explicitement suivi et rapproché de la prochaine avance. Il ne doit ni disparaître à la clôture hebdomadaire ni être financé une seconde fois.

La restitution et le report ne sont pas des consommations de carburant. Distinguer les dépenses réellement justifiées des sommes simplement décaissées pour éviter un double comptage financier.

Une avance précédente non justifiée devrait normalement empêcher une nouvelle avance. Prévoir une exception motivée et approuvée pour une mission urgente, avec montant, responsable, motif et délai de régularisation. Les délais ordinaires de justification restent à fixer avec le client.

Les paiements directs aux stations ne doivent pas être confondus avec les avances remises aux conducteurs. Les deux modes doivent être rapprochés des achats sans double règlement.

## 7. Réduction de la manipulation d’espèces

Option recommandée à étudier : une station partenaire payée directement, avec un bon précisant le véhicule, le carburant et un plafond en litres ou en montant.

Le relevé périodique de la station est rapproché des tickets, autorisations et ravitaillements enregistrés. Un achat ne doit pas être réglé à la fois par une avance et par le relevé de la station.

Cette organisation réduit la manipulation d’espèces, mais ne supprime pas les risques d’erreur ou de collusion. Conserver des vérifications ponctuelles auprès de la station et sur les véhicules. Si les espèces sont maintenues, le suivi des avances et des reliquats est indispensable.

## 8. Contrôles, alertes et traitement des anomalies

| Situation | Traitement proposé |
|---|---|
| Quantité supérieure à la capacité du réservoir | Bloquer ou exiger une exception documentée correspondant à une situation autorisée ; ne pas imputer à un véhicule un achat destiné à plusieurs véhicules ou à un stockage. |
| Compteur inférieur au précédent | Vérifier une erreur, une saisie tardive ou un remplacement de compteur ; correction ou exception tracée. |
| Même ticket utilisé plusieurs fois | Détection de doublon et contrôle avant validation. Une ressemblance seule appelle une vérification. |
| Nouveau plein très rapproché du précédent | Demander l’explication et vérifier parcours, kilométrage et quantités. |
| Consommation inhabituelle pour ce véhicule | Alerte au CdG et analyse de l’usage et de l’état mécanique. |
| Montant versé supérieur aux achats justifiés | Suivre le reliquat, la restitution ou le montant encore à justifier. |
| Ravitaillement sans mission connue ou dans une station inhabituelle | Vérification de la justification opérationnelle. |
| Mauvais carburant ou incohérence litres × prix / montant | Contrôle avant validation ; tolérances à définir. |

Les incohérences certaines peuvent bloquer la saisie ou la validation. Les écarts de consommation doivent en principe produire une demande d’explication, pas une accusation ni une sanction automatique.

Pour chaque anomalie, conserver l’auteur de la détection, la date, les pièces, la réponse, le responsable de revue et la conclusion : mission particulière, erreur corrigée, maintenance nécessaire, justificatif insuffisant ou anomalie non résolue. Une correction d’une donnée validée doit laisser une trace ; ne pas écraser silencieusement les justificatifs et valeurs précédents.

Les seuils et tolérances seront approuvés après observation. Il n’est pas proposé de seuil universel identique pour toute la flotte.

## 9. Contrôle hebdomadaire du lundi

- Vérifier les relevés des véhicules et la complétude des achats de la semaine écoulée.
- Rapprocher les avances, achats justifiés, paiements directs et restitutions.
- Examiner les reliquats et les anomalies non résolues avant les nouvelles dotations.
- Vérifier les missions et besoins de la semaine suivante.
- Autoriser les nouveaux besoins par véhicule, sans déduire une dotation identique du seul calendrier.
- Consigner les exceptions et leur suivi.

Prévoir aussi des contrôles ponctuels sur place : compteur, véhicule concerné, réalité du ticket et rapprochement avec la station. Les contrôles physiques doivent être répartis et réalisés par une personne distincte de celle qui prépare les dépenses.

## 10. Tableau de contrôle du CdG

Prévoir une vue hebdomadaire et mensuelle filtrable par véhicule, conducteur, période et, lorsque pertinent, mission ou chantier :

- Kilomètres parcourus et complétude des données.
- Litres achetés et coût des achats justifiés.
- Consommation calculable en L/100 km et comparaison à l’historique du véhicule.
- Avances versées, dépenses justifiées, restitutions, soldes reportés et montants restant à justifier.
- Achats payés directement aux stations, distincts des avances.
- Alertes ouvertes, réponses attendues et conclusions des contrôles.

Les carburants utilisés pour plusieurs chantiers nécessitent une règle d’affectation fondée sur les missions ou une clé validée. Ne pas affecter arbitrairement toute la dépense à un chantier pour remplir un champ.

## 11. Mise en place progressive dans l’application

### Phase de préparation

Valider la procédure, les rôles, les pièces, la gestion des reliquats et le périmètre des véhicules. Réaliser un inventaire initial vérifié.

### Phase d’observation proposée

Collecter pendant **quatre semaines** des relevés fiables afin de construire une première référence par véhicule. Cette durée est une proposition opérationnelle à adapter, pas une norme. Vérifier la qualité des relevés avant de définir les seuils.

### Première version fonctionnelle recommandée

1. Fiches véhicules et affectations des conducteurs.
2. Enregistrement des ravitaillements avec compteurs et justificatifs.
3. Avances et paiements rattachés aux véhicules, justification et reliquats.
4. Tableau de contrôle et traitement tracé des anomalies par le CdG.

Les accès et contrôles doivent être appliqués côté serveur, avec historique des validations et corrections. Le calcul de consommation doit expliquer l’intervalle utilisé et signaler les données manquantes.

Le GPS ou la télématique peuvent être étudiés ensuite pour corroborer les parcours et les temps d’utilisation. Ils ne remplacent pas les tickets, les contrôles de la dépense ou le rapprochement de l’argent. Leur mise en place n’est pas un préalable proposé à la première version.

## 12. Questions à confirmer avec le CdG et le client

1. Les conducteurs reçoivent-ils une somme fixe chaque lundi, une avance estimée ou le coût exact du plein ?
2. Qui récupère et contrôle les tickets ? Qui constate et encaisse les restitutions ?
3. Les véhicules sont-ils réellement remis au plein complet chaque lundi ? Existe-t-il des appoints intermédiaires ?
4. Quels véhicules, carburants, conducteurs et capacités de réservoir sont concernés ?
5. Les missions et kilométrages sont-ils déjà consignés ? Qui peut les confirmer ?
6. Qui autorise le besoin opérationnel et qui réalise le contrôle indépendant ?
7. Quel circuit financier exact faut-il reprendre du paiement de la main-d’œuvre ?
8. Quel délai de justification, quelle règle de report et quel circuit d’exception retenir ?
9. Une station partenaire et un paiement direct sont-ils possibles ?
10. Comment affecter les dépenses des véhicules intervenant sur plusieurs chantiers ?
11. Quels seuils et quelles tolérances retenir après la période d’observation ?
12. Qui décide de la suite donnée à une anomalie non résolue ?

## 13. Cas de recette à prévoir lors de la réalisation

- Deux véhicules aux parcours différents obtiennent des consommations calculées à partir de leurs propres données.
- Un intervalle comprend un plein initial, un appoint et un plein final : le plein initial est exclu, l’appoint et le plein final sont inclus.
- Un intervalle incomplet ou sans distance valide ne produit pas de ratio trompeur.
- Une avance de 40 000 FCFA avec achat de 32 500 FCFA conserve un reliquat suivi de 7 500 FCFA, sans double comptage.
- Une nouvelle avance sur un dossier non justifié nécessite le traitement prévu ou une exception autorisée.
- Un achat payé directement à la station n’est pas également imputé comme utilisation d’une avance.
- Un ticket réutilisé ou un compteur incohérent est signalé avant validation.
- Une consommation élevée peut être expliquée et clôturée avec justificatifs sans être automatiquement qualifiée de fraude.
- Les corrections et validations restent attribuables et les accès directs non autorisés sont refusés.

## Références utilisées

Ces références étayent des pratiques de gestion de flotte ; elles ne sont pas présentées comme des obligations réglementaires applicables au client en Côte d’Ivoire.

- [Georgia Department of Administrative Services — contrôle des achats de carburant et relevés de compteur](https://www.doas.ga.gov/fleet-management/how-to/how-to-obtain-fuel-within-policy-guidelines).
- [Department of Energy — suivi de flotte, consommation et temps moteur à l’arrêt](https://www.energy.gov/cmei/femp/telematics-federal-fleets-guide-efficient-fleet-management).
- [Spécification interne des natures de charge, section 6.1](BTP-SPEC-F02-NATURES-CHARGE-DEPENSES-HORS-SA.md) : mention antérieure du suivi de carburant distinct des frais administratifs. Le présent document précise une proposition dédiée ; il ne valide pas les autres hypothèses historiques de cette spécification.
