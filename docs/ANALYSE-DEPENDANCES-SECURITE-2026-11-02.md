# Analyse des dépendances élevées et critiques — EFPC

Analyse initiale : 2 novembre 2026. État des corrections locales ci-dessous, au 3 novembre 2026. Aucun déploiement effectué.

## Second lot : les 22 alertes élevées corrigées — 3 novembre 2026

État final de l’audit complet : **0 élevée, 0 critique, 21 modérées et 3 faibles**. La commande `npm audit --audit-level=high` réussit. Cela décrit les dépendances connues par npm au moment du contrôle ; ce n’est pas une certification de sécurité globale de l’application.

Changements :

- Retrait de `netlify-cli` et `@netlify/functions`, sans usage dans le démarrage Railway, la compilation ou les tests actuels. Suppression des commandes npm et du script de démarrage Netlify devenus obsolètes. Les migrations historiques et `@netlify/blobs`, encore importé par le serveur, sont conservés.
- Les composants vulnérables propres à cet ancien outillage ne font plus partie du verrou : Fastify/static, packaging Functions, outils d’images, extraction ZIP, anciennes copies Zod, TOML et Forge concernés par les 22 entrées.
- Nodemailer 10.3.1 et Vite 8.3.5 ; mises à jour compatibles de `follow-redirects`, `brace-expansion`, `fast-uri` et `source-map-js`.
- Vite écoute par défaut sur `127.0.0.1`. Pour un test volontaire depuis un autre appareil, lancer explicitement `npm run dev -- --host 0.0.0.0` sur un réseau maîtrisé. Le démarrage Railway n’utilise pas ce serveur Vite.
- GitHub Security ne tolère plus l’échec de l’étape audit : une alerte élevée ou critique fera échouer le contrôle. Les valeurs simulées reflètent désormais Brevo HTTPS et Railway.

Vérifications réussies : **359 tests unitaires sous Node 20**, compilation serveur, compilation frontend avec Node 20, lint des modules de sécurité/import modifiés, cohérence du verrou par `npm ci --dry-run`, tests HTTP isolés et tests navigateur des imports après mise à jour de Vite. Le test SMTP compose réellement un message avec Nodemailer, sans connexion SMTP ; le test Brevo vérifie le chemin HTTPS avec une réponse simulée. Aucun mail ou SMS réel, aucun accès à la base métier, aucun déploiement.

Traces : `.deployment/security-audit-final.json`, `.deployment/security-final-unit.log`, `.deployment/security-final-front-build.log`, `.deployment/security-final-node20-build.log`, `.deployment/security-final-server-build.log`, `.deployment/security-final-lint.log`, `.deployment/security-final-install-check.log` et `.deployment/security-final-browser.log`.

## Corrections locales du 3 novembre 2026

- Express 5.3.0, body-parser 2.4.0, proxy-addr 2.0.8, Multer 2.5.0 et Zod métier 4.6.7.
- shell-quote 1.12.0 et concurrently 9.2.5 : les deux entrées critiques de développement sont corrigées.
- SheetJS 0.20.3 installé depuis le CDN officiel, avec intégrité verrouillée dans package-lock.json. L’ancienne distribution npm xlsx 0.18.5 a été remplacée.
- Imports Catalogue et historique CdG exécutés dans un Web Worker : limite de 10 Mo, 5 000 lignes (en-tête compris), 100 colonnes et arrêt après 15 secondes. Les fichiers trop grands sont refusés, sans troncature silencieuse. La lecture des formules et du HTML de cellules est désactivée.
- Résolution commune des IP pour rate-limit, journal de sécurité et signatures. En local/direct : socket uniquement. Dans un service Railway identifié par ses variables de plateforme : X-Real-IP valide fourni par l’ingress HTTP ; listes, doublons et valeurs invalides sont refusés. Aucun repli sur X-Forwarded-For. Les appels privés à ce service appartiennent au périmètre de confiance : ne pas exposer de port TCP public qui contournerait l’ingress Railway. Référence : [spécifications Railway](https://docs.railway.com/networking/public-networking/specs-and-limits).
- Correction de la structure des tests BL qui échouaient sous Node 20 dans GitHub Actions.

Résultat du nouvel audit : **60 entrées, dont 0 critique et 22 élevées** (32 modérées et 6 faibles). Les alertes des copies Zod 3.x de Netlify restent présentes ; la copie 4.6.7 utilisée par les validations métier n’est plus signalée. Les alertes SMTP/Twilio, Vite et d’ancien outillage restent à traiter dans un lot suivant. Les entrées ci-après décrivent l’état initial, pas le nouvel état des versions.

Validation : 357 tests unitaires réussis sous Node 20 ; compilations serveur et frontend réussies. Test isolé des parseurs HTTP (JSON, requête compressée malformée, upload multipart et limite de taille) et tests Edge des deux modes Excel, de la limite de fichier, de l’arrêt sur délai et du worker compilé sous CSP. Aucun accès à la base métier, aucune notification réelle et aucun déploiement dans ces vérifications.

Traces locales : `.deployment/security-audit-after-priority.json`, `.deployment/security-priority-unit.log`, `.deployment/security-priority-server-build.log`, `.deployment/security-priority-front-build.log` et script isolé `.deployment/test-security-imports.cjs`.

## Résultat et limites

Rapport actuel : 67 entrées, dont 25 élevées et 3 critiques. Même package-lock.json que le clone de publication au commit 47ed2eb. Analyse du rapport, des avis, du verrou et des chemins de code ; pas de test offensif, ni preuve d’exploitation de production. Les 3 critiques représentent 2 causes : proxy-addr et shell-quote, cette dernière propagée à concurrently.

Le Dockerfile installe et conserve aussi les dépendances de développement. Présence dans l’image ne signifie pas exposition HTTP : la production lance Express compilé, pas Vite, Fastify ou Netlify CLI. Les imports Excel sont exécutés dans le navigateur et restent concernés.

## Inventaire des 28 entrées

### @fastify/static — élevée

Version(s) verrouillées : 9.3.0.

Ancien outillage Netlify : contournement de protections de routes/fichiers Fastify. Pas le serveur statique Express de production.

- [@fastify/static vulnerable to Authorization Bypass via Non-Canonical URL Paths](https://github.com/advisories/GHSA-8pvw-jcv7-9cmj)
- [@fastify/static vulnerable to route guard bypass via path traversal](https://github.com/advisories/GHSA-83w8-p2f5-377r)

### @netlify/build — élevée

Version(s) verrouillées : 35.15.0.

Construction Netlify : alerte héritée de ses dépendances, pas une cause indépendante.

Alerte propagée depuis : @netlify/config, @netlify/edge-bundler, @netlify/functions-utils, @netlify/zip-it-and-ship-it, minimatch, zod.

### @netlify/dev — élevée

Version(s) verrouillées : 4.18.13.

Serveur de développement Netlify : alerte héritée de ses dépendances.

Alerte propagée depuis : @netlify/config, @netlify/functions-dev, @netlify/images.

### @netlify/functions — élevée

Version(s) verrouillées : 3.1.10.

Anciennes Functions Netlify : alerte héritée du packaging et extract-zip. Réévaluer ces usages avant suppression.

Alerte propagée depuis : @netlify/zip-it-and-ship-it, extract-zip.

### @netlify/functions-dev — élevée

Version(s) verrouillées : 1.3.5.

Développement Netlify : alerte héritée de extract-zip et du packaging.

Alerte propagée depuis : @netlify/zip-it-and-ship-it, extract-zip.

### @netlify/images — élevée

Version(s) verrouillées : 1.3.12.

Images Netlify : alerte héritée de ipx → sharp.

Alerte propagée depuis : ipx.

### @netlify/zip-it-and-ship-it — élevée

Version(s) verrouillées : 15.4.0, 14.7.1, 12.2.1.

Packaging Netlify : alerte héritée de plusieurs composants, dont esbuild, TOML et Zod.

Alerte propagée depuis : @vercel/nft, archiver, esbuild, minimatch, precinct, toml, zod.

### body-parser — élevée

Version(s) verrouillées : 2.3.0.

Priorité serveur : express.json global avant authentification, limite 10 Mo mais inflate activé par défaut. Requête compressée malformée pouvant arrêter le processus. Mettre à jour 2.3.0 vers au moins 2.4.0 via une résolution Express compatible.

- [body-parser vulnerable to Denial of Service via trailing bytes after a compressed request body](https://github.com/advisories/GHSA-27r3-jxmh-p828)

### brace-expansion — élevée

Version(s) verrouillées : 5.0.9, 2.1.4.

Construction : récursion et consommation CPU via motifs piégés, copies utilisées par glob/ESLint/Workbox/Netlify. Aucun usage métier direct trouvé. Mettre à jour les branches concernées.

- [brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)
- [brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)
- [brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7)
- [brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7)
- [brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p)
- [brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p)

### concurrently — critique

Version(s) verrouillées : 9.2.4.

Développement : dev:all et scripts/dev-local.mjs, pas démarrage Docker. Hérite de shell-quote : même cause critique comptée deux fois.

Alerte propagée depuis : shell-quote.

### extract-zip — élevée

Version(s) verrouillées : 2.0.1.

Ancien outillage Netlify : écritures hors répertoire via liens dans des archives. Aucune extraction ZIP de pièces jointes métier trouvée.

- [extract-zip unvalidated symlink path traversal](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)
- [extract-zip allows arbitrary file writes through symlink archive entries](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3)

### fast-uri — élevée

Version(s) verrouillées : 3.1.6, 4.1.3.

Construction/Netlify/Workbox : normalisation URI incohérente, confusion d’hôte/schéma et injection d’autorité selon les avis. Aucun usage métier direct trouvé. Correctifs des branches 3.1.9/4.2.3 selon le rapport.

- [fast-uri vulnerable to authority injection via an unvalidated port in serialize](https://github.com/advisories/GHSA-qw65-cvwx-89v3)
- [fast-uri vulnerable to authority injection via an unvalidated port in serialize](https://github.com/advisories/GHSA-qw65-cvwx-89v3)
- [fast-uri vulnerable to host confusion via an unclosed bracket in the URI authority](https://github.com/advisories/GHSA-58mr-gqgx-xq4g)
- [fast-uri vulnerable to host confusion via an unclosed bracket in the URI authority](https://github.com/advisories/GHSA-58mr-gqgx-xq4g)
- [fast-uri vulnerable to inconsistent host case normalization via percent-encoded octets](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj)
- [fast-uri vulnerable to inconsistent host case normalization via percent-encoded octets](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj)
- [fast-uri vulnerable to mailto header injection via percent-encoded field-name desynchronization](https://github.com/advisories/GHSA-jvvf-x445-j334)
- [fast-uri vulnerable to URI scheme spoofing via percent-encoded scheme decoding](https://github.com/advisories/GHSA-w74x-v6f9-j3xg)
- [fast-uri vulnerable to URI scheme spoofing via percent-encoded scheme decoding](https://github.com/advisories/GHSA-w74x-v6f9-j3xg)
- [fast-uri vulnerable to improper path equivalence in relative reference normalization](https://github.com/advisories/GHSA-xhq7-xmqj-769h)
- [fast-uri vulnerable to improper path equivalence in relative reference normalization](https://github.com/advisories/GHSA-xhq7-xmqj-769h)
- [fast-uri vulnerable to host confusion via unchecked WHATWG host canonicalization](https://github.com/advisories/GHSA-wjr9-j795-jxcr)
- [fast-uri vulnerable to host confusion via unchecked WHATWG host canonicalization](https://github.com/advisories/GHSA-wjr9-j795-jxcr)
- [fast-uri vulnerable to scheme injection via an unescaped first-segment colon in suffix references](https://github.com/advisories/GHSA-333x-w4r6-6crp)
- [fast-uri vulnerable to scheme injection via an unescaped first-segment colon in suffix references](https://github.com/advisories/GHSA-333x-w4r6-6crp)

### fastify — élevée

Version(s) verrouillées : 5.12.1.

Ancien outillage Netlify : déni de service et contournements de validation/authentification selon les fonctionnalités utilisées. Le serveur EFPC est Express.

- [fastify vulnerable to Denial of Service via unhandled exception on HTTP/2 trailer responses](https://github.com/advisories/GHSA-4mh8-r7rc-xpvc)
- [fastify vulnerable to request body replacement via an async validation result collision](https://github.com/advisories/GHSA-667r-xxjv-c9mm)
- [fastify vulnerable to authentication bypass via malformed URLs reaching encapsulated not-found handlers](https://github.com/advisories/GHSA-p68q-wchp-6fh7)
- [fastify vulnerable to request validation bypass via skipped boolean false schemas](https://github.com/advisories/GHSA-hwr6-493r-vm6h)
- [fastify vulnerable to header validation bypass via incomplete schema case normalization](https://github.com/advisories/GHSA-9q9j-q6p8-xq58)

### follow-redirects — élevée

Version(s) verrouillées : 1.16.0.

Via twilio → axios et outillage Netlify. Fuite de certains en-têtes sur redirection sous conditions. Brevo et Textbee utilisent fetch. Pas de preuve d’exploitation dans le chemin Twilio ; l’avis cross-realm exclut explicitement sa reproduction avec Axios 1.20.0. Corriger vers au moins 1.16.2.

- [follow-redirects array-form headers bypass cross-origin credential stripping](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8)
- [follow-redirects sensitiveHeaders regex escaping can expose credential headers](https://github.com/advisories/GHSA-8r9p-f939-6h3c)
- [follow-redirects: Cross-realm sensitiveHeaders arrays are discarded and custom credentials can follow redirects](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p)

### image-size — élevée

Version(s) verrouillées : 2.0.2.

Ancien outillage d’images Netlify : boucles infinies sur images JXL/HEIF/ICNS piégées. Aucun import métier direct trouvé.

- [image-size: JXL and HEIF parsers allow denial of service through infinite loops](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)
- [image-size: ICNS parser allows denial of service through an infinite loop](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)

### ipx — élevée

Version(s) verrouillées : 3.1.1.

Outillage d’images Netlify : hérite des alertes de sharp.

Alerte propagée depuis : sharp.

### multer — élevée

Version(s) verrouillées : 2.2.0.

Priorité serveur : photos et rapports dans deliveries.ts, dailyReports.ts et dashboard/deliveries.routes.ts. Déni de service sur champs multipart, uploads interrompus, limites contournables selon les fonctionnalités utilisées. memoryStorage et authentification réduisent certains scénarios sans neutraliser tous les défauts. Viser au moins 2.5.0 selon les plages du rapport et tester les réceptions/photos.

- [multer vulnerable to Denial of Service via crafted multipart field names](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm)
- [multer vulnerable to Denial of Service via file descriptor leak on aborted uploads](https://github.com/advisories/GHSA-qfvm-cv95-jqjf)
- [multer vulnerable to file size limit bypass via async fileFilter race condition](https://github.com/advisories/GHSA-qvfw-j98x-7q72)
- [multer vulnerable to Denial of Service via oversized array index in field names](https://github.com/advisories/GHSA-535w-7cp7-47q4)
- [multer vulnerable to Denial of Service via orphaned disk writes on aborted uploads](https://github.com/advisories/GHSA-3pph-fpjx-jg34)
- [multer vulnerable to Denial of Service via a pending asynchronous fileFilter after request teardown](https://github.com/advisories/GHSA-q7qp-rjg7-q26m)

### netlify-cli — élevée

Version(s) verrouillées : 26.2.0.

Agrège plusieurs alertes de ses dépendances. Railway ne lance pas cette CLI en production ; elle reste installée dans l’image actuelle. Examiner sa suppression si les scripts historiques sont inutilisés.

Alerte propagée depuis : @fastify/static, @netlify/build, @netlify/build-info, @netlify/config, @netlify/dev, @netlify/edge-bundler, @netlify/images, @netlify/zip-it-and-ship-it, toml.

### node-forge — élevée

Version(s) verrouillées : 1.4.0.

Dépendance de développement : problèmes cryptographiques, certificats, TLS, cookies et disponibilité. Aucun import métier direct trouvé ; ne pas assimiler aux NIP/signatures métier.

- [node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
- [Forge: ASN.1 OID first arc truncation in asn1.oidToDer](https://github.com/advisories/GHSA-4642-5mcj-2rqw)
- [Forge: Prototype Pollution in forge.http cookie handling via a malicious Set-Cookie](https://github.com/advisories/GHSA-6wvx-3r32-xmcg)
- [Forge: TLS client crash when the server sends no certificate](https://github.com/advisories/GHSA-525v-9gp9-w22h)
- [Forge: Regular expression denial of service in PEM decoding (pem.decode)](https://github.com/advisories/GHSA-7wch-p9px-956x)
- [Forge: Denial of Service via infinite loop in BigInteger.modInverse() with negative input (incomplete fix of CVE-2026-33891)](https://github.com/advisories/GHSA-h6cr-wjv9-3cpp)
- [Forge: verifyCertificateChain() removes trusted CA certificates with the same subject from the CA store](https://github.com/advisories/GHSA-4487-j8r4-4g2f)
- [Forge: AES-GCM authentication bypass via unvalidated tagLength option](https://github.com/advisories/GHSA-5cwg-6vw7-rj6p)
- [Forge: PKCS#12 MAC forgery and constant-key PBE via zero iteration count](https://github.com/advisories/GHSA-jc66-7q78-782g)
- [Forge: Denial of service in TLS record processing via a record interleaved with a fragmented handshake message](https://github.com/advisories/GHSA-8hrf-8g6f-7xwp)
- [Forge: Denial of service in TLS record processing via call stack exhaustion](https://github.com/advisories/GHSA-hqq3-7jhf-c5jx)
- [Forge: X.509 basicConstraints bypass in verifyCertificateChain() via deprecated extension OIDs 2.5.29.10 and 2.5.29.13](https://github.com/advisories/GHSA-5x38-2vff-x55p)

### nodemailer — élevée

Version(s) verrouillées : 9.0.5.

Branche SMTP conditionnelle : parsing de destinataires, accès aux contenus, TLS et déni de service. Appelé uniquement si EMAIL_PROVIDER=smtp. La production a été configurée en Brevo HTTPS ; tant que cela reste actif, les chemins SMTP ne sont pas sollicités. Encore installé/importé : mettre à jour avec tests simulés.

- [Nodemailer: resolveContent() on a MailMessage bypasses disableFileAccess/disableUrlAccess when called with the legacy signature](https://github.com/advisories/GHSA-8m3c-c648-2xjj)
- [Nodemailer: IDN/Punycode domain allow-list bypass leads to email delivery to an attacker-controlled domain](https://github.com/advisories/GHSA-wmmp-3585-3rmp)
- [Nodemailer: Quadratic (O(n²)) time complexity in addressparser allows remote denial of service via a crafted address list](https://github.com/advisories/GHSA-2x7j-588g-ccc2)
- [Nodemailer: Recipient-domain validation bypass via RFC 5322 comment mis-parsing leads to email delivery to an attacker-controlled domain](https://github.com/advisories/GHSA-cc9r-2j5m-2m83)
- [Nodemailer: Process-global DNS cache reuses TLS `servername` across transports, enabling cross-tenant SMTP credential disclosure](https://github.com/advisories/GHSA-6vj9-mwq6-2f5v)
- [Nodemailer: Nested structured recipient arrays bypass the parser depth limit and cause stack exhaustion DoS](https://github.com/advisories/GHSA-8vvx-rff5-p5rq)
- [Nodemailer: Quadratic backtracking in the addressparser free-text fallback allows remote denial of service](https://github.com/advisories/GHSA-v53p-9fqp-m79j)
- [Nodemailer: Quadratic (O(n^2)) DKIM header unfolding lets a large folded header cause remote denial of service during signing](https://github.com/advisories/GHSA-39m8-27wv-hr27)
- [Nodemailer: A nested comment ends early in addressparser, releasing the rest of the comment as a recipient](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8)
- [Nodemailer: A ";" inside a quoted string or comment ends an address group early in addressparser, turning display text into a recipient](https://github.com/advisories/GHSA-m943-m63m-w62w)
- [Nodemailer: A ">" inside a quoted local part ends an angle-addr early in addressparser, delivering to a domain the header does not name](https://github.com/advisories/GHSA-85x2-q946-cp5h)
- [Nodemailer: Quadratic backtracking in SMTP AUTH mechanism detection regexes allows pre-auth remote denial of service](https://github.com/advisories/GHSA-4ffr-jq9g-5ffx)
- [Nodemailer: RFC 5322 comment inside an angle-bracket address is never stripped](https://github.com/advisories/GHSA-g73g-hqqh-jr95)
- [Nodemailer: Quadratic (O(n^2)) SMTP client reply parsing lets a malicious server or MITM cause a pre-auth remote denial of service](https://github.com/advisories/GHSA-4g23-2xm8-66gc)

### proxy-addr — critique

Version(s) verrouillées : 2.0.7.

Serveur Express. Usurpation IP sous condition de sous-réseau IPv6 de confiance mal configuré. Aucun trust proxy explicite trouvé dans createApp ; cette condition particulière n’est pas observée. Corriger 2.0.7 vers au moins 2.0.8. Vérifier séparément le traitement direct de X-Forwarded-For dans rateLimit.ts.

- [proxy-addr vulnerable to IP spoofing via IPv4-mapped IPv6 trust subnet](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)

### sharp — élevée

Version(s) verrouillées : 0.34.5.

Via ipx/Netlify : vulnérabilités libvips/libheif/librsvg lors du décodage d’images. Aucun traitement des photos métier par sharp trouvé.

- [sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)
- [sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)
- [sharp : Vulnerability in librsvg dependency CVE-2026-96889](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)

### shell-quote — critique

Version(s) verrouillées : 1.9.0.

Développement, via concurrently. Injection de commande si une entrée non fiable est réassemblée en commande shell dans les conditions de l’avis. Commandes du projet prédéfinies ; aucun chemin métier correspondant trouvé. Corriger 1.9.0 vers au moins 1.11.0.

- [shell-quote: `quote()` command injection via a line terminator in a token after a `{ comment }` token](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)

### source-map-js — élevée

Version(s) verrouillées : 1.2.1.

Construction : via PostCSS et Netlify. Blocage sur source maps piégées ; aucune route métier soumettant des source maps au parseur trouvée. Correctif 1.2.2 ou ultérieur.

- [source-map-js allows event-loop denial of service through indexed source-map section offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)

### toml — élevée

Version(s) verrouillées : 3.0.0.

Configurations Netlify : récursion, pollution de prototypes et consommation CPU. Aucun fichier TOML utilisateur traité par un parcours métier trouvé.

- [toml-node: Uncontrolled Recursion](https://github.com/advisories/GHSA-82x6-q7mm-w9cf)
- [toml-node: Prototype Pollution Leads to `Object.prototype` Corruption via `__proto__` Key-Path Desynchronization](https://github.com/advisories/GHSA-v5mp-jgw5-2x6j)
- [toml-node: Quadratic-complexity DoS via many array-of-tables headers in toml.parse()](https://github.com/advisories/GHSA-4qx8-w7c3-pj3p)
- [toml-node: Quadratic-complexity DoS via long dotted keys or table paths in toml.parse()](https://github.com/advisories/GHSA-9j65-hcg3-gc64)
- [toml-node: Uncontrolled resource consumption (CPU DoS) via unbounded-length integer literals in toml.parse()](https://github.com/advisories/GHSA-9qmh-m7c6-f92p)

### vite — élevée

Version(s) verrouillées : 8.2.2.

Développement : fichiers hors périmètre, exécution de scripts/ouverture éditeur selon les avis. host:true dans vite.config.ts expose le serveur aux interfaces autorisées par le pare-feu. Production : Express sert dist, ne lance pas Vite. Mettre à jour hors de toutes les plages signalées et réexaminer host:true.

- [launch-editor: escapeCmdArgs() omits % escaping on Windows](https://github.com/advisories/GHSA-698v-4r3x-3vcv)
- [launch-editor: Editor CLI flag misinterpretation causing arbitrary command execution for some editors](https://github.com/advisories/GHSA-r825-w8mm-5pxw)
- [launch-editor: `fs.existsSync()` existence check can be bypassed on Windows](https://github.com/advisories/GHSA-587h-7wmj-h5pm)
- [Vite: Cross origin script execution through Vite custom middleware](https://github.com/advisories/GHSA-9jrq-w75r-8gcw)
- [Vite: Files outside `server.fs.allow` could be served when project paths match system paths on non-Windows machine](https://github.com/advisories/GHSA-rq7h-c2jc-7f22)
- [Vite: First 4 bytes of files outside of `server.fs` setting is exposed by `?vite-wasm-instance`](https://github.com/advisories/GHSA-vfpm-58rq-9qcg)

### xlsx — élevée

Version(s) verrouillées : 0.18.5.

Priorité imports navigateur : lecture Excel réelle dans CatalogueTab.tsx et CdgHistoricalCard.tsx. Pollution de prototypes et blocage via fichier piégé. Pas de parsing serveur du classeur dans ces parcours. Aucun correctif dans le paquet npm xlsx : migrer vers une distribution officielle maintenue ou une autre bibliothèque, puis tester les imports.

- [Prototype Pollution in sheetJS](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
- [SheetJS Regular Expression Denial of Service (ReDoS)](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)

### zod — élevée

Version(s) verrouillées : 3.25.76, 4.4.3.

Priorité serveur : validation des entrées API. Épuisement mémoire avec collections et accumulation d’erreurs. Tableaux sans maximum présents ; import historique limité à 5000 lignes mais tableaux internes non bornés. Corriger la copie métier 4.4.3 vers au moins 4.6.6 et borner les entrées avant validation. Copies Netlify 3.25.76 à traiter séparément.

- [Zod can exhaust memory while validating oversized constrained collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)

## Observation complémentaire : IP et limitation des tentatives

server/middleware/rateLimit.ts utilise directement le premier élément de X-Forwarded-For. Ce choix est distinct du défaut proxy-addr et ne sera pas corrigé par sa mise à jour. Vérifier comment Railway écrase ou ajoute cet en-tête, puis définir une résolution fondée sur des proxies maîtrisés. Aucune exploitation affirmée sans cette vérification.

## Ordre de traitement proposé

1. Corriger body-parser, multer, zod et proxy-addr ; contrôler la résolution IP. Tester connexion, validations EB, photos et réceptions.
2. Remplacer ou mettre à niveau la distribution Excel et tester Catalogue/historique CdG.
3. Corriger les branches SMTP/Twilio, shell-quote/concurrently et Vite avec des transports simulés.
4. Retirer les outils Netlify devenus inutiles après inventaire, puis mettre à jour les composants de construction. Conserver les adaptateurs encore réellement importés.
5. Refaire audit complet, audit sans développement, compilations et tests avant publication.

Éviter npm audit fix --force en bloc : changements majeurs proposés, aucun correctif xlsx dans le paquet npm actuel. La CI tolère les erreurs npm audit via continue-on-error ; revoir le blocage après traitement sans masquer le rapport complet.

Sources locales : .deployment/security-audit-current.json, .deployment/security-dependency-paths.txt, package-lock.json, Dockerfile, server/app.ts, server/middleware/rateLimit.ts, server/services/email.ts, server/services/sms.ts et les deux écrans d’import Excel. Les sources des avis sont liées dans chaque entrée.
