# Boîte à outils COA

## OÙ ON EN EST (point du 20 nov. 2026, à lire en premier)
Appli en ligne et utilisée : https://planning-equipe-coa.github.io/Outil-COA/ — tout ce qui est décrit plus bas est en place,
testé (Chrome sans affichage, 390 px de large) et publié (push sur `main` = en ligne en ~1 min).

**En attente de l'utilisateur (Raph) — rien à coder tant qu'il ne l'a pas fait :**
1. **NOTAM** : il crée un compte api.faa.gov (client_id / client_secret), puis un worker Cloudflare `coa-notam` avec le code de
   `tools/notam-worker.js` et les secrets FAA_CLIENT_ID / FAA_CLIENT_SECRET. Ensuite : mettre l'adresse `.workers.dev` dans
   `NOTAM_URL` (index.html), vérifier avec un vrai appel que l'API FAA renvoie bien les NOTAM de LFML (**pas encore confirmé**),
   ajuster les champs lus dans `fetchFaa` si besoin, changer `CACHE` dans sw.js, publier.
2. **Annuaire partagé** : il crée le dépôt public `planning-equipe-COA/Outil-COA-donnees` (avec README) et une clé fine-grained
   (Contents R/W sur ce seul dépôt), puis fait la configuration DANS l'appli (Contacts MRS → « Modifier l'annuaire (responsable) »).
   Rien à coder ; l'aider en cas d'erreur (messages de `adErr`).
3. **Fiches MUA** : jeu complet prêt (86 fiches, `~/Dev/MUA_source`, voir « MUA ») ; à chiffrer par Raph avec son code (commande
   dans « MUA »). Avant : 21 fiches en ligne : 1A, 1Z, 3A, 3B, 4B, 4Z, 5A,
   5B, 5C, 6B, 6C, 7A, 7B, 7C, 8C, 9B, 9B fiche b, 10A, 10B, 10C, 10D fiche b. Pour en ajouter il faut TOUTES les PDF (l'index est
   refait, voir « MUA » plus bas) et le code d'accès, que Raph donne de vive voix : **ne jamais l'écrire dans le dépôt, un commit
   ou un fichier suivi**. Les PDF ne sont pas dans le dépôt (document interne) : les demander à Raph, travailler hors du dépôt.

**Questions ouvertes :**
- Postes internes à 4 chiffres hors groupe AMP (assistants, services, portes) : passent-ils aussi par le standard AMP ?
  Si oui, ajouter le préfixe `ext` aux groupes concernés de l'annuaire (`tools/annuaire.py decrypt` → éditer → `encrypt`).
- Une ligne Alyzia (passage T2) a été lue sur un ajout manuscrit : marquée « à vérifier » dans l'annuaire.
- SASCA : un poste barré sur la feuille n'a pas été repris.
(Aucun numéro dans ce fichier : le dépôt est public, les numéros sont seulement dans l'annuaire chiffré.)

**Idées proposées, pas encore demandées (ne pas faire sans accord) :** compagnies opérant à MRS avec leur assistant ; outils de
calcul (UTC/local, kg/lb, carburant L/kg, écart d'heures).

**Travailler avec Raph :** il parle français, utilise surtout l'iPhone (appli installée sur l'écran d'accueil), parfois le Mac.
Explications courtes, étape par étape, avec une vérification « ✅ » après chaque action et une courte explication de chaque terme
technique. Toujours tester avant de publier, changer `CACHE` dans sw.js à chaque mise en ligne, mettre à jour CE fichier quand
une fonction change. Dépôt public : aucune donnée interne en clair (fiches MUA, annuaire, numéros, codes, clés).

## Présentation
Appli web statique, **distincte du Planning COA** (choix de l'utilisateur) : référence pour le travail au COA
(aéroport Marseille-Provence). En ligne : https://planning-equipe-coa.github.io/Outil-COA/ (GitHub Pages, branche `main`, racine).
Le Planning COA est dans le dépôt `planning-equipe-COA/horaires` et a seulement un lien vers ici (Réglages).
**Aucun lien ni mention du Planning dans cette appli** (demandé par l'utilisateur).
L'utilisateur échange en français.

## Fichiers
- `index.html` — toute l'appli (HTML + CSS + JS). **Page d'accueil** (onglet « Accueil », ouverte au lancement, bouton maison en
  haut à droite ; demandée le 20 nov. 2026) : thèmes de haut en bas (`THEMES` sauf Recherche), tuiles encadrées 2 par ligne en
  portrait (`.tiles`, minmax 150 px), icône au trait (`TI`), toucher = rubrique ; taper une recherche depuis l'accueil bascule
  sur « Tout ». Thèmes (`THEMES`, même ordre pour l'accueil, le menu et les onglets ; demandé le 20 nov.) : **Référentiels** (MUA, Aéroports,
  Compagnies, Avions) en premier, Temps de vol, Escale MRS (Météo et fréquences, NOTAM, Contacts MRS), Codes et langage (Codes retard, Abréviations, Alphabet), Recherche
  (Accueil, Tout ; absente de l'accueil). Onglets : Accueil, MUA, Aéroports, Compagnies, Avions, Temps de vol, Météo, NOTAM, Contacts MRS, Codes retard,
  Abréviations, Alphabet, Tout. Une barre de recherche ; codes exacts (IATA/OACI) en premier. Onglet dans le `#hash`.
  Codes retard IATA (AHM 730), abréviations, alphabet OTAN, `ACX` (code OACI d'envergure, sillage, envergure indicative)
  écrits dans le fichier. **Contacts MRS = numéros utiles comme dans le Planning** (demandé) : services triés par ordre
  alphabétique, plusieurs numéros par service avec précision, boutons Appeler (tel:) / SMS ; « Ajouter ou modifier des numéros »
  → édition (+ Autre numéro, + Ajouter un service, corbeille, Enregistrer/Annuler). Gardés **sur le téléphone seulement**
  (localStorage `coa-utiles` = [{label, tels:[{tel, note}]}] ; l'ancien `coa-contacts` {n,r,t,f,x} est converti une fois),
  « Copier (sauvegarde) » / « Coller une sauvegarde » (JSON, accepte aussi l'ancien format). Pas de partage ni de verrou responsable.
  Réglages (roue, panneau défilant) : **Affichage** Auto / Clair / Sombre (`coa-theme` → `html[data-theme]`, appliqué dans le
  `<head>`), **Navigation** Onglets / Menu par thème (`coa-nav` → `html[data-nav=menu]` : bouton ☰ « rubrique » qui ouvre
  `#menu`, rubriques rangées par thème — `THEMES`), QR code statique (SVG),
  adresse, « Envoyer le lien » (feuille de partage, sinon copie), aide installation, MUA (verrouiller), sauvegarde des contacts.
- `airports.json` (OurAirports, domaine public : IATA, OACI, nom, ville, pays, type L/M/S, vols réguliers),
  `airlines.json`, `aircraft.json` (OpenFlights, ODbL, plus mis à jour). Un enregistrement par ligne.
- `sw.js` — hors connexion, réseau d'abord puis copie ; caches `coa-outils-*` ; changer `CACHE` à chaque mise en ligne
  qui ajoute un fichier. `manifest.json`, icônes `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (avion qui décolle
  au-dessus d'une piste + « COA », fond violet ; demandé le 20 nov. 2026 ; `?v=2` dans les liens, à changer si l'icône change).

## Ajouts du 20 nov. 2026 (demandés)
- **Portes ↔ fiches MUA** : `gateStand(libellé, passerelle)` → poste (« 5B / 28 » → 5B, « PP9 – 9A » → 9A) s'il existe une fiche ;
  bouton « Fiche MUA 5B » dans l'annuaire (`data-openposte`, gestionnaire global) ; la carte MUA affiche « Porte 28 · PP6 – 6A ·
  poste …… » (`standGates`).
- **Quel poste pour cet avion ?** (haut de l'onglet MUA) : menu des types (`muaTypes` = `typeAliases` de chaque ligne avion,
  « tous types » retiré, « NE0 » → NEO) → tableau poste / avion / infos ; toucher le badge ouvre la fiche. `MUA.finder`.
- **Temps de vol MRS ↔ aéroport** : `airports.json` a maintenant lat/lon (colonnes 8 et 9). `flightInfo` : orthodromie,
  30 min + distance à 800 km/h, vent moyen d'ouest −6,5 %/+6,5 % selon la composante est ; affiché sous chaque aéroport
  (« MRS → JFK ≈ 8 h 48 · retour ≈ 7 h 53 · 6 274 km »), avec rappel « estimation, vérifier l'horaire ». Calé : ORY 1 h 18, ALG 1 h 29.
- **Thème « Temps de vol »** (demandé, rubrique `fl`, entre Référentiels et Escale MRS) : `flView` — sans recherche, exemples
  (`FL_EX`, pas une liste de lignes desservies) ; avec recherche, une carte par aéroport (`flCard` : départ MRS → X, arrivée X → MRS,
  km et NM), tri : code exact, puis nom/ville, puis pays ; vols réguliers et grands aéroports d'abord. Même calcul `flightInfo`.
- **Météo LFML** (rubrique `wx`, thème Escale MRS, + carte en tête de l'accueil) : api.met.no tafmetar (CORS autorisé ;
  aviationweather.gov refuse le navigateur), dernière ligne des fichiers METAR/TAF, décodage français `wxDecode` (vent, visibilité,
  temps présent, nuages, T/Td, QNH, tendance), METAR/TAF bruts affichés et « font foi ». Cache `coa-wx`, relu toutes les 10 min.
- **Fréquences LFML** (`FREQ`, `freqView`, rubrique Météo et fréquences + ligne ATIS/Tour/Sol/Prévol dans la carte météo) :
  AIP France AD 2 LFML.18, eAIP AIRAC du 19 mars 2026 (ATIS 125.355, Tour 133.100 aux. 123.725, Sol 121.905, Prévol 121.730,
  Approche par secteurs). À revérifier à chaque cycle AIRAC. Pas d'ATIS texte public pour LFML (radio seulement).
- **NOTAM LFML** (rubrique `notam`, thème Escale MRS) : relais Cloudflare `tools/notam-worker.js` (secrets FAA_CLIENT_ID /
  FAA_CLIENT_SECRET de api.faa.gov, cache 30 min, CORS limité à l'appli, codes autorisés LFML/LFMM) → `NOTAM_URL` (vide = carte
  « pas encore branchés »). L'API OACI a été écartée : 100 appels gratuits seulement, puis payant. Groupes par Q-code (`NQG` :
  postes/aires de trafic MN-MK-MP, voies MX, pistes, balisage, radionav, aérodrome, procédures, obstacles, espace aérien),
  état (`NQC` : LC fermé, AS hors service…), NOTAM expirés masqués, « à venir », texte brut. Cache `coa-notam`. **Couverture
  LFML par l'API FAA à confirmer au premier vrai appel.** Le briefing officiel SIA fait foi (écrit dans l'appli).
- **Favoris** (`coa-favs`, ☆/★) sur les cartes MUA et les lignes de l'annuaire ; section « Favoris » sur l'accueil (fiches en
  tuiles, numéros avec Appeler/SMS). Gestionnaire global en phase de capture (`data-fav`).

## Annuaire COA — chiffré (même code que le MUA)
- Numéros internes (assistants, AMP, aviation générale, autres, passerelle avec portables nominatifs, postes des portes),
  transcrits des feuilles plastifiées du COA le 20 nov. 2026 → `mua/annuaire.enc`, **jamais en clair dans le dépôt**.
  `tools/annuaire.py encrypt|decrypt FICHIER.json` (MUA_CODE) ; format décrit en tête du script. Pour modifier : decrypt vers un
  fichier HORS du dépôt, éditer, encrypt, mettre `maj` à jour.
- Affichage : onglet Contacts MRS, « Annuaire COA » (groupes repliables, pastille de couleur des feuilles) puis « Mes numéros »
  (liste perso locale `coa-utiles`, vide par défaut). `numParts` : 10 chiffres = Appeler (+ SMS si 06/07) ; 4 chiffres = poste,
  appel direct seulement si le groupe a `ext` (AMP : 04 42 14 + poste) ; « 131.9 » = fréquence ; autres = poste sans appel.
  Portes : « Porte 5B / 28 », passerelle/DAL en dessous, séparateurs « — Cloison D ». Chargé avec le MUA (`MUA.annu`), recherché
  dans « Tout ». Verrouillé : carte « Annuaire COA protégé ».

- **Annuaire modifiable par le responsable** (demandé le 20 nov. 2026) : dépôt de données séparé
  `planning-equipe-COA/Outil-COA-donnees` (public, à créer par l'utilisateur) : `annuaire.enc` + `cle.enc` (clé GitHub fine-grained
  limitée à CE dépôt, Contents R/W, chiffrée avec la clé du MUA). Lecture par raw.githubusercontent (pas de limite d'appels, cache
  ~5 min) ; on garde la version la plus récente entre le fichier en ligne et la copie locale `coa-annu-enc` (champ `at`). À défaut :
  `mua/annuaire.enc` livré. Contacts MRS → « Modifier l'annuaire (responsable) » : 1re fois `setup` (clé + code responsable
  ≥ 3 mots, vérif. droits `permissions.push`), ensuite `unlock` (empreinte PBKDF2 200 000 it. `annu.admin`, verrou applicatif) puis
  `edit` (groupes, lignes service / numéros « / » / précision ou passerelle, intertitres « — ») → `annuPublish` (PUT API contents
  avec sha, message « Annuaire mis à jour »). La clé MUA est importée avec encrypt+decrypt. Testé avec un GitHub simulé
  (refus de clé, mauvais code, publication, lecture par un autre téléphone).

## MUA (fiches de postes) — chiffré
- Source : fiches PDF « Annexe au manuel des aires de stationnement » (iTarmac / aéroport), **document interne** : dépôt
  public → **jamais de PDF, d'image ou de texte en clair dans le dépôt**. Choix de l'utilisateur (20 nov. 2026) : chiffré
  avec un code d'accès donné de vive voix (jamais écrit dans le dépôt ni dans le code).
- `tools/mua_build.py` : `MUA_CODE="…" python3 tools/mua_build.py DOSSIER_PDF` → `mua/meta.json` (sel, 600 000 itérations),
  `mua/index.enc` (liste : poste, fiche a/b, date, page, avions [type, RdN, infos], consignes, alias de types, texte) et
  `mua/<id>.enc` (JPEG 150 dpi, marges blanches coupées). PBKDF2-SHA256 → AES-GCM 256, fichier = IV 12 o + chiffré.
  Le sel existant est réutilisé (même code). Postes lus dans le nom du fichier (`parse_name`) : `05-B` → 5B, `09-B-b` → 9B
  fiche b, `30-A-30-D` → 30A / 30D, `50A_50C` → 50A / 50C, `63D_64_64B_65`, `6A1`. Fiche multi-postes : `poste` = libellé
  « 30A / 30D », `postes` = liste ; l'appli cherche/ouvre via `muaPostes(s)` (badge réduit `.mbadge.sm`). « Première édition »
  lue comme date. Fiches scannées en portrait (8C, 47A, 47C, 48A, 48C) remises en paysage (rotation horaire).
  **Sécurités** : code incorrect → arrêt sans rien toucher ; fiche plus ancienne que celle en ligne, ou fiche en ligne absente
  du dossier → arrêt (relancer avec `MUA_FORCE=1` si voulu). Les anciens `mua/*.enc` sont supprimés seulement à la fin
  (`annuaire.enc` gardé). Python : `.venv` du dépôt (cryptography, pillow ; non suivi par git), pdftotext/pdftoppm (Homebrew).
  Pour ajouter des fiches : relancer avec TOUTES les fiches (l'index est refait).
- **Source complète sur le Mac (20 nov. 2026)** : `~/Dev/MUA_source` (hors dépôt, 86 PDF), version la plus récente de chaque
  fiche, assemblée depuis `~/Downloads/MUA` (avril 2026) + `MUA_PNG` du GANTT (`~/Dev/flight-planning`) pour 2C (11/05/2026),
  8C (13/03/2026, gabarit CGX), 25B/25D (09/04/2026), 21/22/23 (1re édition 07/04/2026), 48G. 8B : gardée la version iTarmac
  du 15/10/2025 (celle du GANTT, gabarit CGX, porte « 13/03/2025 » : à confirmer par Raph). Commande (le code est tapé, jamais
  écrit) : `cd ~/Dev/Outil-COA && read -rs "MUA_CODE?Code MUA : " && export MUA_CODE && .venv/bin/python tools/mua_build.py ~/Dev/MUA_source; unset MUA_CODE`
- Le GANTT (`~/Dev/flight-planning/assets/MUA LFML - types etudies par poste.pdf`) a une synthèse texte de tous les postes
  (types étudiés / non étudiés, mode de départ) : piste pour compléter « Quel poste pour cet avion ? » sur les fiches scannées
  (sans texte lisible : 0 avion extrait). Pas encore demandé.
  Changer le code = supprimer `mua/meta.json` (nouveau sel) puis tout reconstruire ; les téléphones redemandent le code.
- Appli : onglet MUA → code demandé une fois, clé AES dérivée gardée dans localStorage `coa-mua-k`
  (« Verrouiller le MUA sur ce téléphone » dans Réglages). Cartes par fiche (poste en badge jaune sur noir, avions, consignes) ;
  recherche par poste exact (5B) ou type (A321, 777 : alias développés « A318 / 319 » → A319) ; aussi dans « Tout ».
  Visionneuse plein écran (`#viewer`) : **paysage automatique** (demandé) — téléphone tenu droit, toute la visionneuse est
  pivotée d'un quart de tour (`.rot`, rotate(90deg), tailles en px depuis innerWidth/innerHeight, `vLayout`) ; l'iPhone ne permet
  pas de forcer l'orientation d'une page. Bouton ⟳ pour l'activer / le couper (localStorage `coa-rot`, activé par défaut) ;
  touchers convertis dans le repère pivoté (`vLocal`). Bulle « Tourne le téléphone » 2,5 s. Zoom −/+, double-toucher, pincement,
  fiche précédente/suivante, Échap. Après ouverture, toutes les fiches sont téléchargées une fois (hors connexion via sw.js).
