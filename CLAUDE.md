# Boîte à outils COA

## OÙ ON EN EST (point du 20 nov. 2026, à lire en premier)
Appli en ligne et utilisée : https://planning-equipe-coa.github.io/Outil-COA/ — tout ce qui est décrit plus bas est en place,
testé (Chrome sans affichage, 390 px de large) et publié (push sur `main` = en ligne en ~1 min).

**En attente de l'utilisateur (Raph) — rien à coder tant qu'il ne l'a pas fait :**
1. **NOTAM** (21 nov. 2026 : worker `coa-notam` en ligne, https://coa-notam.k8ggjsddnp.workers.dev/, secrets posés, branché dans `NOTAM_URL` ; **compte autorouter en attente d'activation** puis accès API à confirmer ; faire un vrai appel dès que Raph confirme). **Prudence** : autorouter bloque après plusieurs échecs de connexion (« Too many failed login attempts », arrivé le 21 nov.
   à cause d'une boucle de l'appli, corrigée) : l'appli n'essaie plus qu'une fois / 10 min après une erreur, le relais garde un
   échec de connexion 20 min (`ar-fail`). Pour tester : UN appel, pas de rafraîchissements répétés. Dans l'éditeur Cloudflare,
   une ancienne version est en lecture seule : revenir au worker puis « Modifier le code » (dernière version). — repris le 20 nov. 2026 : source conseillée **autorouter.aero** (base NOTAM européenne EAD d'Eurocontrol, donc les
   NOTAM français ; la couverture de LFML par l'API FAA n'a jamais pu être confirmée et l'accès FAA est validé à la main). Raph :
   crée un compte autorouter (gratuit), demande l'accès API par ticket de support, crée le worker Cloudflare `coa-notam` avec
   `tools/notam-worker.js` et les secrets AR_EMAIL / AR_PASSWORD (mot de passe propre à autorouter). Ensuite : adresse
   `.workers.dev` dans `NOTAM_URL` (index.html), vrai appel pour vérifier, changer `CACHE`, publier. Le worker garde la FAA en
   secours (FAA_CLIENT_ID / FAA_CLIENT_SECRET) ; autorouter prioritaire si ses secrets existent. Testé seulement avec de fausses
   réponses au format documenté (jeton OAuth client_credentials gardé 50 min, `GET /v1.0/notam?itemas=["LFML"]` par 100,
   expirés et `suppressed` écartés, fin ≥ 2^31 = PERM, id `A1234/26`, q = `Q`+code23+code45, texte complet Q) A) B) C) D) E) F) G)).
2. **Annuaire partagé** : il crée le dépôt public `planning-equipe-COA/Outil-COA-donnees` (avec README) et une clé fine-grained
   (Contents R/W sur ce seul dépôt), puis fait la configuration DANS l'appli (Contacts MRS → « Modifier l'annuaire (responsable) »).
   Rien à coder ; l'aider en cas d'erreur (messages de `adErr`).
3. **Fiches MUA** : **86 fiches en ligne depuis le 20 nov. 2026** (tous les postes, source `~/Dev/MUA_source`, voir « MUA »).
   Nouvelles fiches : les ajouter dans `~/Dev/MUA_source` (date à la main dans `dates.json` si scan), relancer la commande. Pour en ajouter il faut TOUTES les PDF (l'index est
   refait, voir « MUA » plus bas) et le code d'accès, que Raph donne de vive voix : **ne jamais l'écrire dans le dépôt, un commit
   ou un fichier suivi**. Les PDF ne sont pas dans le dépôt (document interne) : les demander à Raph, travailler hors du dépôt.

**Décisions de Raph (20 nov. 2026) :**
- Fiche MUA : **toujours la plus récente** (date imprimée). 8B : la version du 15/10/2025 reste (celle du GANTT porte 13/03/2025).
- Lignes MRS confirmées : ORY, CDG, LGW, LHR, STN, Milan, IST (pas SAW), CRL, BRU.
- Postes internes à 4 chiffres de l'annuaire : **non joignables de l'extérieur** (pas de préfixe `ext` à ajouter).
- Ligne Alyzia passage T2 : à supprimer (`tools/annuaire.py remove alyzia verifier`, lancé par Raph avec le code) ; poste SASCA
  barré : reste hors de l'annuaire.
(Aucun numéro dans ce fichier : le dépôt est public, les numéros sont seulement dans l'annuaire chiffré.)

**Faits le 20 nov. 2026 (demandés) :** « Quel poste pour cet avion ? » avec la synthèse MUA, Compagnies présentes à MRS,
onglet Calculs (voir plus bas).

**Principe (Raph, 21/11/2026) : l'appli sert à la CONSULTATION, elle ne remplace pas le GANTT** (pas d'outil de planification
ou d'affectation de postes).

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

## Passe design du 22 nov. 2026 (validée par Raph, captures avant/après)
- **Barre d'onglets en bas** (`#bnav`, `BNAV`, `bnavRender` appelé par `render`) : Accueil · Vols · Météo · MUA · Rubriques
  (ouvre `#menu`, rangé par thème ; affiche le nom de la rubrique en cours si elle n'est pas dans la barre). Point rouge qui
  pulse sur Vols (annulés / retards ≥ 30 min, `homeAlerts`) et sur Météo (`wxAlerts`). Retoucher l'onglet en cours = remonter.
  Le ruban d'onglets du haut, le bouton maison et le choix Réglages → Navigation sont masqués (code gardé, sans effet).
- En-tête : titre + heure **Z · L** en pastille (`#clk`, innerHTML), réglages. Recherche sans `autofocus` (contour violet
  seulement pendant la saisie).
- Météo : sur l'accueil, **une seule ligne d'alerte** (phénomènes sans doublon, « en ce moment / dans les 2 h / prévu »,
  « +N autres périodes ») ; le détail reste dans l'onglet Météo (`wxAlertBox(full)`). Couleurs d'alerte adoucies en sombre.
  **Flèche du vent** (`.vane`, `--d` = direction METAR) qui oscille doucement, plus vite avec rafales, tourne si VRB.
- Rubriques vides : **recherches récentes** par rubrique (`coa-recent-<onglet>`, 6 max, retenues 1,8 s après la frappe,
  `QUICK_TABS`) et, pour Aéroports, les **lignes MRS** (`MRS_LINES`) en pastilles (`data-qq`).
- Ajouts du même soir (demandés) : **compte à rebours** sur les vols à venir (`.vcd`, `cdText`, heure prévue + retard annoncé,
  3 h à l'avance au plus, « maintenant » jusqu'à 10 min après, pastille pleine qui pulse à 15 min ou moins), **« relu il y a N
  min » qui avance tout seul** (`data-ago`), les deux rafraîchis par `liveTick` (20 s, appelé aussi par `render`) ; **blocs qui
  scintillent** pendant le chargement (`SKEL`) à la place des textes « Chargement… » (météo, vols, NOTAM, bases).
- « Sources » déplacé du pied de page vers Réglages. Entrée douce du contenu au changement de rubrique seulement (`lastTab`,
  `#out.enter`). Tout est immobile avec « réduire les animations ».

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
- **Corrections porte → poste** (`GATE_FIX`, prioritaire sur l'annuaire, affichée même si la porte manque à l'annuaire) :
  41B → 1A, 40B → 4B (Raph, 21/11/2026). 41A et 40A = sans passerelle. Groupes renommés (`HALL_NAMES`/`annuRename`) : « Hall B1 » → « Hall B · Nat/Europe », « Hall A Inter » → « Hall A · Inter »,
  « T2 » → « Terminal 2 » (dénomination AMP 2017 : T1 = halls A et B, T2 = ex-MP2) (`annuRename`, au chargement ;
  repris dans l'annuaire si le responsable le réenregistre) (semi-contact / embarquement au large) : `GATE_NOTE`.
  Porte 01/20 (PP8) → postes 8B et 8C (Raph, 21/11/2026). `GATE_FIX` : porte → LISTE de postes ; `gateStand` renvoie un tableau. Référence complète poste ↔ porte à obtenir de Raph (déduction depuis l'annuaire = fragile).
- **Portes ↔ fiches MUA** : `gateStand(libellé, passerelle)` → poste lu UNIQUEMENT dans la passerelle (« PP6 – 6A » → 6A,
  « PP9 – 9A » → 9A ; « DAL n » = pas de poste) s'il existe une fiche, sauf `GATE_FIX`. Portes mixtes « 5B / 28 » (fiche plastifiée
  COA, photo du 21/11/2026) : 1re porte = configuration **internationale** (selon les cloisons), 2e = **national / Europe**
  (`gateLabel` → « 5B (Intl) / 28 (Nat./Europe) »). Le 1er nombre n'est PAS un poste (ancienne erreur : 5B/28 rattachée au poste 5B).
  Portes **6AB et 8AB supprimées** (n'existent plus) : `GATE_GONE`, masquées même si l'annuaire chiffré les contient encore.
  Bouton « Fiche MUA 6A » dans l'annuaire (`data-openposte`) ; la carte MUA affiche les portes (`standGates`).
- **Quel poste pour cet avion ?** (haut de l'onglet MUA) : menu des types (`muaTypes` = `typeAliases` de chaque ligne avion,
  « tous types » retiré, « NE0 » → NEO) → tableau poste / avion / infos ; toucher le badge ouvre la fiche. `MUA.finder`.
- **Temps de vol MRS ↔ aéroport** : `airports.json` a maintenant lat/lon (colonnes 8 et 9). `flightInfo` : orthodromie,
  30 min + distance à 800 km/h, vent moyen d'ouest −6,5 %/+6,5 % selon la composante est ; affiché sous chaque aéroport
  (« MRS → JFK ≈ 8 h 48 · retour ≈ 7 h 53 · 6 274 km »), avec rappel « estimation, vérifier l'horaire ». Calé : ORY 1 h 18, ALG 1 h 29.
- **Thème « Temps de vol »** (demandé, rubrique `fl`, entre Référentiels et Escale MRS) : `flView` — sans recherche, **liste des
  destinations au départ de MRS** (`MRS_DEST`, `destList`, demandé le 20 nov. 2026) : 114 villes relevées sur
  marseille.aeroport.fr → Vols et destinations → Toutes les destinations (la version anglaise omet la France métropolitaine),
  saisonnières comprises, rangées par région (France et Corse, Outre-mer, Europe, Maghreb, Afrique/Moyen-Orient/Asie, Amérique
  du Nord), une ligne par ville avec aller/retour ; toucher une ligne = recherche du code. Le site ne donne ni codes ni
  compagnies : codes choisis ici, plusieurs codes quand la ville a plusieurs aéroports possibles (Paris ORY·CDG, Londres
  LGW·LHR·STN, Milan MXP·BGY·LIN, Istanbul IST·SAW, Bruxelles BRU·CRL, New York EWR·JFK), le 1er sert au calcul.
  **À relever de nouveau à chaque saison IATA** (`MRS_DEST_DATE`). Avec recherche, une carte par aéroport (`flCard` : départ MRS → X,
  arrivée X → MRS, km et NM, étiquette « ligne MRS ») ; noms français des villes MRS reconnus (« Londres », « Alger ») ;
  tri : code exact ou nom français exact, puis lignes MRS, puis nom/ville, puis pays. Même calcul `flightInfo`.
- **Pays en français** (demandé le 20 nov. 2026) : `COUNTRY_FR` (175 noms anglais → français, générés avec Intl.DisplayNames
  + corrections à la main pour les noms propres aux bases), `pfr()`. Ajouté aux textes cherchés des aéroports et compagnies
  (Aéroports, Temps de vol, Tout) : « Tunisie », « Royaume-Uni », « États-Unis » marchent, l'anglais aussi. Pays affiché en français
  dans Aéroports et Temps de vol. En Temps de vol, les aéroports MRS qui correspondent sont toujours ajoutés en tête (sinon
  « États-Unis » ne montrait que les 40 premiers aéroports trouvés).
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

## Ajouts du 20 nov. 2026 (soir, demandés)
- **« Quel poste pour cet avion ? » complété** : synthèse « MUA LFML – types étudiés par poste » (PDF du GANTT
  `~/Dev/flight-planning/assets/`), convertie en `~/Dev/MUA_source/synthese.json` (hors dépôt : document interne) puis chiffrée
  dans `mua/index.enc` (`idx.synth` = {ref: 40 types de référence, postes: {poste: zone, gabarit, date, depart, etudies, non,
  ok, neutr, rem}}). `ok` = types de référence étudiés (liste de référence moins « Non étudiés » ; « Tous… sauf » ; « Aucun »
  = tous ; « Non déterminable » = null). 8B réécrit d'après la fiche du 15/10/2025. Menu : « Types courants » (40) d'abord →
  `finderSynth` (postes par zone, départ, neutralisés, remarque, mention « gabarit » = déduit des dimensions, à confirmer) ;
  « Autres types cités sur les fiches » → ancienne recherche sur les lignes des fiches. Cartes MUA : départ + postes neutralisés
  par poste. Texte de la synthèse ajouté à la recherche MUA (fiches scannées). Sans synthèse dans l'index, tout marche comme avant.
  Script de conversion : à refaire si la synthèse change (demander, il est simple : en-têtes « Poste X — zone — fiche du … »).
- **Compagnies présentes à MRS** (onglet Compagnies sans recherche) : `MRS_AL` (44 : filtre du site de l'aéroport + compagnies
  régulières des programmes du GANTT, dont fret), codes et indicatifs écrits ici (base OpenFlights périmée : ITA, easyJet Europe…),
  aussi en tête des recherches (étiquette MRS). Colonne Assistant prévue (`MRS_HANDLER` IATA → nom), **Assistants remplis le 21/11 (Raph)** : Air France (AF) ; Alyzia (AH, TO, AT, SS, EZ, U2, ET, XK, EC, TK) ; Onet (EW) ;
  Aviapartner (tout le reste donné + tout le fret) ; **particularité MRS : passage et coordination séparés** (KL : passage AF,
  coordo Aviapartner ; FM Shanghai Airlines, ajoutée : passage AF, coordo Alyzia). VY et ITI : Aviapartner ; EZ : Alyzia (ITI = Twin Jet fret, ligne ajoutée ; EZ = easyJet,
  ajouté au nom de la ligne easyJet) ; China Eastern retirée (ne vient pas à MRS, seule Shanghai Airlines) ; easyJet Switzerland (DS) retirée (pas vue à MRS) (le GANTT la garde dans son localStorage, illisible depuis le Mac).
- **Onglet Calculs** (thème « Calculs », `calcView`/`bindCalc`, état `CALC`) : calculatrice sans eval (`calcEval` : + − × ÷ %,
  parenthèses, virgule), UTC ↔ Marseille (décalage du jour via Intl Europe/Paris), kg ↔ lb, carburant L ↔ kg ↔ USG ↔ lb
  (densité modifiable, 0,8 par défaut), écart entre deux heures (passage minuit), heure + durée.

## Ajouts du 21 nov. 2026 (demandés)
- **Horloge** dans l'en-tête (`#clk`, `clockTick` toutes les 15 s, arrêt si page cachée) : « 20:22 Z · 21:22 L ».
  Sous l'heure (demandé le 23 nov. 2026) : saison aéronautique et décalage, « Hiver W26 · GMT+1 » / « Été S27 · GMT+2 »
  (`iataSeason(d)` : été IATA = heure d'été en France, du dernier dimanche de mars au dernier samedi d'octobre ; code W = année
  de début de l'hiver). Rappel aussi dans Calculs → « Heure Z ↔ heure de Marseille ».
- **Rubrique « Procédures »** (`proc`, thème Escale MRS ; demandée le 23 nov. 2026, Raph les fournit au fur et à mesure) :
  chiffrées avec la clé du MUA → `mua/procedures.enc` (liste) + `mua/p-<id>-<n>.enc` (pages JPEG). Construction :
  `MUA_CODE="…" python3 tools/proc_build.py DOSSIER` (dossier HORS du dépôt ; un fichier par procédure, PDF / image / .md / .txt,
  nommé « Catégorie - Titre.ext » ; « Titre.json » facultatif : date, ref, resume, etapes[]). Tout est refait à chaque fois (garder
  toutes les sources). Appli : `procView` (liste par catégorie, recherche dans titre + texte, détail avec résumé, étapes numérotées,
  boutons des pages, texte extrait), pages dans la visionneuse des fiches MUA (`procPage`, variable `PV` ; ‹ › = pages).
  Verrouillée tant que le MUA n'est pas ouvert. Texte .md mis en forme par `mdLite` (## titres, listes à 2 niveaux, **gras**, tableaux) ; `etapes` = encadré « À retenir pour le PCE ».
  Procédures en ligne : **Hiver – Dégivrage saison hiver 2026-2027** (23 nov. 2026, transcrite du CR AMP du 4/11/2026 sans la liste
  des participants ni aucun nom, à la demande de Raph ; source .md/.json gardée hors dépôt) et **Aviation générale – Postes de stationnement AG (guide opérationnel)** (23 nov. 2026,
  transcrit d'une vidéo du guide DOA de 22 pages : texte complet des règles, mémo et 17 fiches, + 18 pages en images redressées
  avec libellés de boutons, clé `images` du .json). Puis **Météo – LVP procédures par faible visibilité** (23 nov. 2026, page 8/12 du doc AMP « 3.3 Diffusion de l'information
  opérationnelle » : schéma redessiné en image « Schéma LVP », tableau du déroulé, messages types 1 et 2 ; **messages 3 et 4 à
  compléter** (page suivante non transmise) ; annotation manuscrite « Appel COP (pour follow me) » intégrée après le message 2).
  `mdLite` gère aussi les blocs ``` (messages types) avec un bouton « Copier » (`data-copymsg`). Consigne de Raph : sur les documents
  photographiés, refaire au propre (et améliorer) tableaux et schémas. Puis **Restrictions – APU durées maximales** (arrêté du 28/07/2023, consignes 21.4 ; tableau réponse rapide,
  repères de masse < / ≥ 140 t indicatifs, image « Durées APU » img_apu/apu.png) et **Restrictions – Essais moteurs** (AMP PROC-007 v3
  du 03/12/2024 : CdQ PCE autorise, 22 h–6 h interdit sauf départ avant 7 h, ralenti postes 50 à 53, puissance C1 / E2 / piste
  entre E2 et E3, FLYCO COP sur l'aire de manœuvre ; page 1/3 non transmise). Demande de Raph : fiches les plus concises possible,
  la réponse rapide en tête. Puis **Plans – Plateforme MRS (postes et codes des voies)** (23 nov. 2026 : photos redressées + ombre retirée, img_plans/
  stationnement.jpg = AIP APDC 01 du 13/06/2024, codes.jpg = AMP codes de références des infrastructures 05/03/2020 ; tableau
  postes 50–57 / accès G1-G2-G3 / IDLE 47-48, listes des voies par code lues sur les couleurs, marquées « à vérifier »).
  Propositions de rangement faites à Raph (couper Escale MRS en « En direct » + « Plateforme MRS », renommer catégories de
  procédures, raccourcis, menu par thème par défaut) : **en attente de sa réponse, ne rien changer sans accord**. Visionneuse : rotation automatique seulement pour les pages en paysage
  (`vLayout`, `wide`) — les pages portrait (guide AG) restent droites. Les sources de ces deux procédures sont restées dans la
  session cloud de Claude (pas sur le Mac) : pour refaire `procedures.enc`, déchiffrer l'existant (texte + p-*.enc) hors dépôt
  et le reconstituer. Pour en ajouter une, il faut aussi la
  source de celle-ci (sinon la retranscrire depuis `procedures.enc` déchiffré, hors dépôt) : l'outil refait tout le fichier.
- **Rubrique « Codes avion »** (`codes`, Référentiels après Avions ; demandée le 23 nov. 2026, confusion fréquente au PCE) :
  `codesView` — 1. lettre d'envergure OACI A–F (`SPAN`, nombreux exemples) + chiffre 1–4 (longueur de piste) ; 2. sillage OACI
  L/M/H/J ; 3. RECAT-EU CAT-A–F (exemples de la liste EASA) ; 4. catégorie d'approche A–E (Vat, exemples Airbus) ; 5. bruit
  (chapitres OACI, groupes acoustiques, en chiffres). Filtrée par la recherche. Rubrique Avions : étiquettes « Env. C » et
  « Sillage M » (au lieu de « Code C » / « M »).
- Calculs → « Heure d'arrivée à Marseille » : le résultat (ETA depuis l'ED) s'affiche dans un encadré **vert** (`#cEta.ok`,
  clair et sombre ; demandé le 23 nov. 2026), seulement quand le calcul aboutit.
- **Soleil à LFML** (`sunTimes`, équation NOAA, ~1 min ; vérifié 21/11 : lever 06:40, coucher 16:10 UTC) et **nuit aéronautique**
  (coucher + 30 min → lever − 30 min), dans la carte Météo complète.
- **Alertes METAR / TAF** (`wxPhen`, `wxAlerts`, `wxAlertBox`, en tête des cartes météo, accueil compris) : orage, grêle, givrant,
  grains, neige, brouillard, forte précipitation, CB, rafales ≥ 25 kt ou vent ≥ 20 kt, visibilité < 1 500 m (rouge < 800 m),
  plafond < 300 ft. METAR : observation (« Maintenant ») séparée de la tendance TEMPO/BECMG (« Tendance 2 h »). TAF découpé en
  groupes (PROB30 TEMPO gardé ensemble) avec période en clair. Mention : aide, **ne remplace pas les MAA**.
- **MAA** (messages d'avertissement d'aérodrome) : pas de source publique trouvée ; Météo-France les diffuse par le serveur
  AEROWEB, code d'accès sous convention. À voir avec Raph (son employeur a peut-être un accès).
- **QRP / QRF** (définitions de Raph, ajoutées aux Abréviations, groupe Urgences) : QRP = retour parking, le vol n'a pas
  décollé ; QRF = retour sur la plateforme de départ après le décollage. Idée en cours : être prévenu des déroutements vers MRS,
  des QRF et QRP (source temps réel nécessaire : FlightAware AeroAPI payant à l'usage à étudier ; OpenSky ne connaît pas la
  destination prévue). **Étude FlightAware AeroAPI (21/11)** : 0,005 $ par page de 15 vols (arrivées / départs), 5 $ offerts
  par mois ; ~280 mouvements/jour à MRS → interrogation toutes les 30 min ≈ 14 $/mois (≈ 9 $ après crédit). **Mais l'offre
  Personal exclut l'usage professionnel interne** (outil d'équipe COA = usage pro) ; Standard = 100 $/mois minimum ; alertes
  push non incluses en Personal. QRP indétectable par ces services. Conclusion présentée à Raph : pas de FlightAware à titre
  personnel ; piste = outils de l'aéroport (base de vols / AODB) si l'employeur l'autorise.
- Météo : plus de boucle d'essais si le réseau manque (`WX.failAt`, 2 min).

## Ajouts du 21 nov. 2026, soir (demandés : « tout implémenter »)
- **Aérodrome LFML** (rubrique `lfml`, thème Escale MRS, `lfmlView`) : cycles AIRAC calculés (`airacCycles`, réf. 19/03/2026 =
  2603, 28 jours), pistes (TODA/LDA), consignes clés (31L interdit si traversier > 12 kt piste mouillée, D1–D8 prioritaires,
  F3/F7 ≤ 24 m, D6 sans balisage axial…), services (SSLIA niveau 9 H24, Jet A1…), dernier SUP AIP connu (014/26, postes 21-23,
  terminé le 29/10/2026) + lien SIA. Source : AIP AD 2 LFML (cartes VAC, AMDT jusqu'à 04/26) du GANTT (`assets/AD-2.LFML.pdf`).
  Textes écrits à la main : **à revoir si l'AIP change** (pas de mise à jour automatique).
- **Immatriculations** (rubrique `immat`, Référentiels) : `mua/immat.enc` (gzip + AES, même code que le MUA) fait par
  `tools/immat_build.py` depuis `~/Dev/flight-planning/Recherche_Aircraft.csv` (export interne de l'aéroport, 26 000 avions).
  **On ne garde que immat, compagnie, type, sièges, MTOW** (jamais comptes clients, marges, TVA, groupes acoustiques).
  Recherche avec ou sans tiret, préfixe, nom de compagnie ; aussi dans « Tout ». Noms de types : `TYPE_EXTRA` + aircraft.json.
  Décompression `DecompressionStream` (Safari ≥ 16.4).
- **Dimensions par poste** (`~/Dev/MUA_source/dims.json` = `PARKING_MAX_DIMENSIONS` du GANTT `data.js`, 74 postes, chiffré dans
  l'index : `idx.dims`) : ligne « Max : envergure · longueur » sur les cartes MUA ; « Quel poste pour cet avion ? » a une
  recherche « par dimensions » (`dimView`, postes du plus juste au plus large).
- Commande de mise à jour (Raph, avec le code) : `mua_build.py ~/Dev/MUA_source && immat_build.py <csv>`.

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
  lue comme date ; sinon `DOSSIER/dates.json` {"fichier.PDF": "jj/mm/aaaa"} (date lue à l'œil, ex. 8C). Fiches scannées en portrait (8C, 47A, 47C, 48A, 48C) remises en paysage (rotation horaire).
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

## Vols du jour (21 nov. 2026)
- Onglet `vols` (thème Escale MRS) : départs / arrivées, aujourd'hui / demain, statuts, porte, zone, tapis, assistant
  (`MRS_HANDLER`), boutons « Fiche MUA » du poste au contact de la porte (`standsForGate`, annuaire déverrouillé).
  Vols décollés / arrivés masqués par défaut (case à cocher). Recherche par la barre #q. Heures locales + Z (`volZ`).
- Source : tableau public de l'aéroport `https://www.marseille.aeroport.fr/api-vols/vol/{departures|arrivals}/data`
  (pas de CORS, ~9 Mo = 3 mois TRIÉS par heure, aucun filtre de date côté serveur). Passe par le MÊME worker Cloudflare
  que les NOTAM : `?vols=1` (`fetchBoard` lit le flux jusqu'au surlendemain ≈ 300-500 Ko puis coupe ; cache 3 min).
  Appli : rafraîchit toutes les 3 min quand l'onglet est ouvert, réessai après 2 min en cas d'erreur, dernière liste
  gardée (`coa-vols`). Non officiel : si le site change de format, la route casse (message « Vols indisponibles »).
- Consultation seulement (principe de l'appli) : pas de saisie, pas de parking attribué, le GANTT fait foi.

## Organisation (Raph, 21 nov. 2026)
- Les **référentiels d'abord** (les plus importants, « à portée de main au cas où ») ; le MUA en fait partie.
  Thèmes : Référentiels (MUA, Aéroports, Compagnies, Avions, Immatriculations) · Escale MRS (Vols du jour, Météo, NOTAM,
  Contacts, Aérodrome) · Outils (Temps de vol, Calculs) · Codes et langage. Barre d'onglets dans le même ordre.
- Calculs : **masse kg ↔ lb et carburant supprimés** (demande de Raph). Restent calculatrice, heure Z ↔ Marseille
  (avec ligne de résultat « 23:30 Z = 00:30 à Marseille »), durée entre deux heures, heure + durée — libellés avec exemples.

## Explicatifs et infos dynamiques (21 nov. 2026)
- `HELP` : texte d'explication en haut de chaque rubrique (`.tabhelp`), masqué pendant une recherche.
- Accueil : `homeAlerts()` (vols annulés, retards ≥ 30 min à venir — les alertes météo restent dans la carte météo) et
  `liveTiles()` (sous-titres en direct : mouvements dans les 2 h, vent / QNH, AIRAC + jours avant le suivant, NOTAM, Z + n h).
- Vols : touche un vol → `volDetail` (compagnie + indicatif, aéroport, temps de vol estimé `flightInfo`, retard `volDelay`
  lu dans le statut, banques, boutons Contacts <assistant> / Fiche MUA / Fiche compagnie). `VL.open` = vol ouvert.
- Recherche « Tout » : numéro de vol (AF7343, AF 7343, 7343) → « Vols du jour » en tête (`volsSearch`).
- Carte MUA : « Départs prévus à ses portes » (3 prochains, `volsByStand`, mémorisé par liste de vols + annuaire), marqué
  indicatif. Accueil / recherche / MUA n'utilisent la liste que si elle a moins de 30 min (`volsFresh`).
- Calculs : « Heure d'arrivée à Marseille » (demande de Raph) : escale (IATA/OACI) + ED en Z (+ temps de vol connu facultatif)
  → ETA Z et heure de Marseille ; sinon temps estimé porte à porte `flightInfo(...).back`.
- Vue « Arr. + Dép. » (rotations, `volsRotations`) : compagnie + escale + numéros voisins (±1), escale 20 min à 18 h.
  Nightstops : le relais garde aussi les arrivées de la VEILLE à partir de 14 h (heure de Paris) ; badge « Nightstop »,
  « la veille » / « le lendemain » devant l'heure. Les listes Départs / Arrivées, l'accueil et la recherche ignorent
  ces arrivées de la veille (`volsOf(day)` filtre la date).
- Immatriculations des vols (Raph OK 22/11/2026) : AeroDataBox via RapidAPI, dans le même worker (`addRegs`, `adbWindow`).
  Secret `ADB_KEY` (clé RapidAPI, jamais dans le dépôt), variable `ADB_REFRESH_MIN` (360 = offre gratuite Basic,
  400 unités/mois, PAS d'usage commercial → essai seulement ; 30 = offre Pro 8 $/mois, usage pro autorisé).
  Tranches de 12 h (veille 12-24 h, aujourd'hui 0-12 h, 12-24 h), chacune en cache (passée : 24 h ; échec : 30 min).
  Champs ajoutés aux vols : `reg`, `type` ; `body.adb` = {n, err, left}. Appli : rotations d'abord par immatriculation
  (départ suivant du même avion avant sa prochaine arrivée ; RYR qui reste plusieurs jours → seul, voulu), sinon par
  numéros voisins (« probable »). Deviner par les horaires : REFUSÉ par Raph (avions RYR immobilisés plusieurs jours l'hiver).
  Le GANTT « flight-planning » n'est pas utilisé en exploitation (Raph, 22/11/2026) : pas une source pour l'appli.
