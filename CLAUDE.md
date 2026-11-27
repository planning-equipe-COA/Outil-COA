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

## Navigation (23 nov. 2026, demandé)
- **En-tête** : hors accueil, le titre devient « ‹ THÈME / Rubrique » (d'après `THEMES`) ; le toucher ramène à l'accueil.
- **Calculs** : cartes repliables (`.ccard`, `CALC.open`, ouverte par défaut : Heure Z ↔ Marseille, avec « Maintenant … » mis à jour
  toutes les 20 s) puis ETA, Durée, Heure + durée, Calculatrice (en dernier, repliée).

- **Petit « i » après les abréviations** (`abbrTips`, demandé le 23 nov. 2026) : sens pris dans `ABBR` + `ABX` (sigles de la
  plateforme : LVP, PCE, COP, GTA, QFU, AIP, AIRAC…). Première occurrence par carte, rubriques `ABTABS` seulement (pas dans les
  rubriques de codes : aéroports, compagnies, avions, immat., retards), jamais dans champs, boutons, liens, `pre`, aide en tête,
  ni dans les textes bruts majoritairement en majuscules (METAR, NOTAM). Toucher = bulle `#abTip`. Ajouter un sigle : `ABX` (COA = coordinateur des opérations aériennes, donné par Raph).
- **Recherche** : saisie affichée en majuscules, clavier en majuscules (`autocapitalize=characters`). « Tout » ouvre la base
  des immatriculations si elle n'est pas encore chargée (avant : rien tant que la rubrique Immatriculations n'avait pas été ouverte).

## Personnalisation par téléphone (24 nov. 2026, demandée)
- **Rangement « à froid » comme les icônes d'un iPhone** : appui long (550 ms) sur une tuile de l'accueil, ou bouton « Ranger
  l'accueil » → `EDIT` : tuiles qui tremblent, glisser (pointer events, fantôme `.ghost`, défilement auto près des bords, d'un thème à
  l'autre), « − » masque, section « Rubriques masquées » avec « + », flèches ↑↓ sur les thèmes, bandeau « Terminé ».
  `homeLayoutFromDom` → localStorage `coa-layout` {th:[[thème,[clés]]], hide:[clés], wx:bool}. `myThemes()` (accueil, menu Rubriques,
  titre d'en-tête) ; rubriques ajoutées plus tard = fin de leur thème d'origine. Masquer = accueil + menu (recherche toujours OK).
- **Réglages → Personnaliser** (`#perso`) : couleur (`coa-acc` → `html[data-acc]`, 6 couleurs, clair + sombre, appliquée dans le
  `<head>`), 3 boutons du milieu de la barre du bas (`coa-bnav`, `myBnav`, libellés courts `BSHORT`), carte météo de l'accueil,
  « Ranger les tuiles », « Rétablir l'agencement d'origine » (efface coa-layout et coa-bnav, pas la couleur).
- Glisser fluide (signalé saccadé sur iPhone) : doigt lu au `pointermove`, tout le reste dans `requestAnimationFrame` (`frame`),
  test de cible au plus toutes les 70 ms avec hystérésis, autres tuiles animées vers leur place (FLIP, `flipMove`), tremblement coupé
  pendant le glisser (`.dragging`), fantôme en `translate3d`, dépose animée, défilement auto progressif.
- Piège corrigé : `closest("[data-acc]")` remontait jusqu'à `<html data-acc>` → toujours `.pacc [data-acc]`.

- **Retour à l'accueil** (25 nov. 2026, demandé) : depuis une rubrique (titre ‹, bouton Accueil, retour arrière), l'accueil
  s'ouvre sur le thème de cette rubrique (`PREV_TAB`, fin de `render`), tuile soulignée brièvement (`.back`), pas en haut de page.
- **Vols du jour** : boutons dans l'ordre Arrivées / Arr. + Dép. / Départs (demandé). **Arrivées par défaut** à chaque entrée dans
  la rubrique (26 nov., « on travaille plutôt avec les arrivées ») ; le choix tient tant qu'on reste dans la rubrique (`VL.keep` quand
  on ouvre un vol depuis une autre rubrique). Arrivées et départs en **cartes pleine
  largeur** (`volRow` → `.vcard`, liste `.vlist`) : liseré gauche couleur du statut (`--vst`), heure locale en grand + Z, vol et
  statut en pastille, ville en grand, pastilles porte/tapis, compte à rebours, immat./type ; compagnie · assistant en dessous.
  **Lien arrivée ↔ départ sur chaque carte** (`volLink`, `volOutbound`) : « ↻ Repart AF 7343 · 16:05 » / « ↻ Arrive de … »,
  trait plein = même immatriculation (sûr), pointillé + « ? » = probable. Rapprochement « probable » interdit si l'immat connue d'un
  côté repart / arrive sur un autre vol (`regDep`/`regArr`, cas T7 1518 vu le 25/11). Les immat. viennent d'AeroDataBox (≈ 1 vol
  sur 4, surtout proches de l'heure) : c'est la vraie limite.
  **Heures en TU (27 nov.)** : météo des escales, liens « ↻ Repart », alerte « avion attendu… », alertes de l'accueil et départs
  aux portes (MUA) en heure Z ; les cartes de vol gardent l'heure locale en grand + Z (affichage du site de l'aéroport).
  **Zulu partout (27 nov., « nous travaillons en Z »)** : heure Z en grand sur les cartes et rotations, heure locale « L » en petit ;
  heures des statuts du site converties (`stZ`), heure de mise à jour du site en Z.
  **Aviation générale** (27 nov., demandé) : le relais demande AeroDataBox avec `withPrivate=true` (même appel, pas de quota en plus)
  et renvoie `body.ga` = mouvements absents du tableau de l'aéroport (AG, privés, affaires) ; l'appli les mêle aux Arrivées /
  Départs avec la pastille « AG » (`agRows`, case « aviation générale », `coa-vl-ag`). **Il faut recoller tools/notam-worker.js
  dans Cloudflare (worker coa-notam)** pour l'activer ; sans ça la case n'apparaît pas. Cache adb3 (ADB_REFRESH_MIN : la tranche en
  cours n'est relue que toutes les 6 h sur l'offre gratuite).
  **« Vérifier en direct »** (27 nov., KL 1469 affiché « A l'heure » par le site alors que pas parti d'AMS) : bouton dans la fiche
  d'un vol → relais `?vol=KL1469&date=AAAA-MM-JJ` (`volStatus`, AeroDataBox /flights/number, 1 appel, cache 5 min) → décollage
  réel / estimé à la provenance, arrivée estimée, « pas encore décollé » en rouge (`vchkHtml`, `VCHK`). Nécessite aussi le
  redéploiement du relais. Le site de l'aéroport garde « A l'heure » pour beaucoup de vols en l'air : pas d'alerte automatique.
  Test local : routes playwright vers les données réelles du relais (le relais n'autorise que l'origine github.io).

- **Recherche dans une rubrique** (26 nov. 2026, demandé : immat. introuvable depuis Temps de vol) : `globalParts(q)` (même
  recherche que « Tout ») ; si la rubrique ne trouve rien → « Trouvé ailleurs dans l'appli » ; sinon seulement les correspondances
  exactes d'ailleurs (pertinence ≥ 4 : immat., poste MUA, code) → « Aussi trouvé ailleurs ». Bouton « ouvrir » (`data-gotab`).
  `immatLoad` re-rend aussi quand une recherche est tapée dans une rubrique.

- **Tirer vers le bas pour actualiser** (27 nov. 2026, demandé) : en haut de page, tirer ≥ 70 px (après amortissement) → pastille
  `#ptr` (« Tire / Relâche pour actualiser », « À jour ✓ ») ; vols → `volsLoad(true)` + météo des escales, météo → `wxLoad(true)`,
  NOTAM → `notamLoad(true)`, accueil → les trois ; toujours vérification d'une nouvelle version (service worker). Bloqué en
  rangement de l'accueil et quand un panneau est ouvert. Boutons « Actualiser » en vert (`.btn.refresh`), horloge en vert (`--clk`).

- **Plus de clignotement à l'ouverture** (27 nov.) : la classe `enter` (animation riseIn) n'est posée qu'au changement de rubrique
  et retirée après 650 ms ; les rendus suivants (météo, vols, NOTAM qui arrivent) ne rejouent plus l'animation.

- **Pastille rouge de la barre du bas** (Vols, Météo) : alerte en cours **pas encore vue** (`bdotOn`, `bdotSig`, localStorage
  `coa-seen-vols` / `coa-seen-wx`) ; s'éteint en ouvrant la rubrique, revient si l'alerte change (heures et compteurs ignorés).

## Fichiers
- `index.html` — toute l'appli (HTML + CSS + JS). **Page d'accueil** (onglet « Accueil », ouverte au lancement, bouton maison en
  haut à droite ; demandée le 20 nov. 2026) : thèmes de haut en bas (`THEMES` sauf Recherche), tuiles encadrées 2 par ligne en
  portrait (`.tiles`, minmax 150 px), icône au trait (`TI`), toucher = rubrique ; taper une recherche depuis l'accueil bascule
  sur « Tout ». Thèmes (`THEMES`, même ordre pour l'accueil, le menu et les onglets ; demandé le 20 nov.) : **Référentiels** (MUA, Aéroports,
  Compagnies, Avions) en premier, Temps de vol, Escale MRS (Météo et fréquences, NOTAM, Contacts MRS), Codes et langage (Codes retard, Abréviations, Alphabet), Recherche
  (Accueil, Tout ; absente de l'accueil). Onglets : Accueil, MUA, Aéroports, Compagnies, Avions, Temps de vol, Météo, NOTAM, Contacts MRS, Codes retard,
  ASM / SSM, Abréviations, Alphabet, Tout. Une barre de recherche ; codes exacts (IATA/OACI) en premier. Onglet dans le `#hash`.
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
  stationnement.jpg = AIP APDC 01 officiel du 29/10/2026 (PDF SIA eAIP, postes 21-23 nouveaux) avec zones colorées, voies.png = codes
  des voies redessinés, codes.jpg = AMP codes de références des infrastructures 05/03/2020 ; tableau
  postes 50–57 / accès G1-G2-G3 / IDLE 47-48, listes des voies par code lues sur les couleurs, marquées « à vérifier »).
  **Rangement du 23 nov. 2026 (Raph : « je te laisse le choix, rapide d'accès et clair »)** : THEMES = Référentiels, **En direct**
  (Vols du jour, Météo et fréquences, NOTAM), **Plateforme MRS** (Procédures et plans, Aérodrome LFML, Contacts MRS), Outils,
  Codes et langage, Recherche globale. Catégories de procédures : APU et essais moteurs, Aviation générale, Exploitation hiver,
  Faible visibilité, Plans de la plateforme (= préfixe des noms de fichiers sources). Raccourcis `data-openproc="mot du titre"`
  (gestionnaire global, `procLinks`) : Météo → LVP, Dégivrage ; Aérodrome → Plans, APU, Essais moteurs. LVP : messages 3 et 4
  laissés « à compléter » (Raph : OK pour l'instant). Aérodrome : lien « Plan officiel des postes (AIP xxxx) » calculé depuis `airacCycles` (toujours le cycle en vigueur). Animations
  ajoutées : point vert pulsé « En direct » sur l'accueil, visionneuse en fondu, appui sur les cartes (repli reduced-motion). Plan AIP APDC 01 : à revérifier à chaque AIRAC (SIA eAIP, URL
  media/dvd/eAIP_JJ_MMM_AAAA/FRANCE/AIRAC-AAAA-MM-JJ/html/eAIP/Cartes/LFML/AD_2_LFML_APDC_01.pdf). Visionneuse : rotation automatique seulement pour les pages en paysage
  (`vLayout`, `wide`) — les pages portrait (guide AG) restent droites. Les sources de ces deux procédures sont restées dans la
  session cloud de Claude (pas sur le Mac) : pour refaire `procedures.enc`, déchiffrer l'existant (texte + p-*.enc) hors dépôt
  et le reconstituer. Pour en ajouter une, il faut aussi la
  source de celle-ci (sinon la retranscrire depuis `procedures.enc` déchiffré, hors dépôt) : l'outil refait tout le fichier.
- **Rubrique « Codes avion »** (`codes`, Référentiels après Avions ; demandée le 23 nov. 2026, confusion fréquente au PCE) :
  `codesView` — 1. lettre d'envergure OACI A–F (`SPAN`, nombreux exemples) + chiffre 1–4 (longueur de piste) ; 2. sillage OACI
  L/M/H/J ; 3. RECAT-EU CAT-A–F (exemples de la liste EASA) ; 4. catégorie d'approche A–E (Vat, exemples Airbus) ; 5. bruit
  (chapitres OACI, groupes acoustiques, en chiffres). Filtrée par la recherche. Rubrique Avions : étiquettes « Env. C » et
  « Sillage M » (au lieu de « Code C » / « M »).
- **Rubrique « ASM / SSM »** (`asm`, thème Codes et langage après Codes retard ; demandée le 23 nov. 2026 après un ASM Air
  Corsica CON WEAT) : `asmView` — décodeur (`#asmIn`, `asmDecode`, texte gardé dans `ASMTXT` le temps de la session, boutons
  Coller / Exemple / Effacer, `bindAsm`) : « En clair » par sous-message (vol, date, changement, motif, avion, sièges, DEI 3/4/5
  identiques ≠ compagnie du vol → « affrètement avec équipage (wet lease) ») puis tableau ligne par ligne ; lignes avec des
  minuscules (bonjour, signature) ignorées ; heures Z + heure de Marseille. Référence filtrée par la recherche : codes d'action
  `ASM_ACT` (CON = configuration, même type ; EQT = type d'avion), motifs `ASM_WHY`, DEI `ASM_DEI`, types de service `ASM_SVC`,
  structure. Aussi dans « Tout ». Compagnies : `MRS_AL`, puis `ASM_AL_FIX` (CE = Chalair Aviation, OpenFlights périmé), puis
  airlines.json ; types : `TYPE_EXTRA` puis aircraft.json. Sources : extraits publics SSIM (wiki Avinor, OAG).
  - Bouton Photo (icône appareil photo, sans texte ni emoji, demandé le 25/11) (25/11/2026, demandé par Raph plutôt que « Analyser le texte » d'iOS) : `ocrRead` → `ocrPrep` (gris,
    contraste, ~2000 px) → Tesseract.js 5.1.1 (jsDelivr, chargé au 1er usage) avec le modèle `@tesseract.js-data/eng`
    4.0.0_best_int (3 Mo, gardé par le navigateur) → `asmOcrFix` (O/0, I/1, T/7, B/8…, `//` mal lu, codes d'action à 1 lettre
    près, compagnie desservant MRS préférée : T0 → TO) → décodage. Tout sur le téléphone, rien n'est envoyé. Testé : télex net
    lu sans erreur (~1 s) ; photo floue et bruitée : quelques erreurs restantes → message « vérifie le texte lu ».
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
- **Retirer un type d'une fiche** (23 nov. 2026, demandé par Raph pour éviter une confusion de types) : `tools/mua_retrait.py POSTE "type"`
  (`--liste POSTE` pour voir). Retire la ligne de la liste d'avions, du texte cherché et de la synthèse (types étudiés + liste
  « Quel poste »). Le retrait est gardé **dans l'index chiffré** (`retraits`) et `mua_build.py` le réapplique à chaque reconstruction :
  rien en clair dans le dépôt. L'image de la fiche n'est pas modifiée (document officiel).
- **`mua_build.py` n'efface plus que les images de fiches** (`[0-9a-f]{12}.enc`) : avant, il supprimait aussi procedures.enc, p-*.enc
  et immat.enc (même dossier `mua/`).
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
- 25/11/2026 : nouvelle clé RapidAPI dans `ADB_KEY`, `ADB_REFRESH_MIN=30` posé dans Cloudflare. Rattachement immat = même
  n° de vol + horaire le plus proche (±4 h) ; appels espacés de 2,5 s + 1 nouvel essai si 429 (échec 429 : cache 2 min) ;
  clés de cache `adb2/`. `body.adb` = {n, hit, err, left}. Immat + type affichés sur chaque ligne Départs/Arrivées.
- Départ à confirmer (`volRisk`, 25/11/2026) : si l'arrivée rapprochée (rotation) est déroutée, annulée ou attendue trop
  tard (ETA + `VOL_TURN_MIN` = 25 min > départ + 10 min), alerte ⚠ orange sous le départ (lignes et cartes Arr.+Dép.),
  « si c'est bien le même avion » quand la rotation est « probable ». Estimation de l'appli, pas une donnée aéroport.
  Déroutements (`volDiverted`, statut « Dérouté ») en rouge + alerte sur l'accueil. L'aéroport de déroutement n'est PAS
  fourni par le site de l'aéroport.
- 25/11/2026 (choix de Raph : 1, 5, 6, 7 de la liste d'améliorations ; 3 « statuts éphémères » et 4 « fiche de relève » NON retenus) :
  - Voyant panne (`volsHealth`) : relais injoignable, site aéroport en panne (le worker sert alors la dernière liste
    valable `vols-last` gardée 24 h, avec `stale:true, err`), ou `maj` figé depuis plus de 30 min. Bandeau rouge Vols + accueil.
  - Météo des escales (`wxpBlock`, `wxpLine`, `wxpEval`, `tafHaz`) : route worker `?wx=OACI,…` (aviationweather.gov, 40 max,
    cache 10 min). Terrains des vols des 6 prochaines heures ; signalés si METAR dégradé (vis < 1500 m, plafond ≤ 500 ft,
    orage, neige/verglas, vent ≥ 30 kt ou rafales ≥ 40, catégorie IFR/LIFR) ou phénomène CERTAIN au TAF pendant les 6 h
    (les PROB « possible » ne font pas remonter un terrain : trop de bruit, vérifié sur les données réelles).
  - Parcours d'un avion (`regTrack`) : bouton « Parcours de F-XXXX » dans la fiche, ou recherche de l'immat dans Vols.
  - Notifications Web Push : worker `pushApi` (?push=key|sub|unsub|test, POST, origine vérifiée, hôtes push connus seulement,
    40 téléphones max = limite de 50 sous-requêtes de l'offre gratuite) + `scheduled` → `pushRun` toutes les 5 min (sans
    AeroDataBox). KV lié `PUSH` (clés `subs`, `sent` gardé 36 h ; 1re exécution = mémorise sans envoyer), variable
    `VAPID_PUBLIC`, secret `VAPID_PRIVATE` (jamais dans le dépôt). Chiffrement RFC 8291 aes128gcm + JWT VAPID testés en local
    (aller-retour). Appli : Réglages → Notifications (iPhone : appli ajoutée à l'écran d'accueil obligatoire). sw.js : push +
    notificationclick (ouvre #vols).
  - CTOT : pas de source publique (NM B2B Eurocontrol réservé aux organismes sous contrat).
- **NOTAM actifs (26/11/2026)** : autorouter a accordé l'accès API au compte de Raph. Un seul appel de test `?icao=LFML` :
  35 NOTAM (champs id, series, q, start, end, text, full, location), affichage vérifié avec ces données. Ajouts : tri par
  thème « en vigueur d'abord, puis à venir, par date de début » ; recherche en français (`NT_FR` : grue → CRANE,
  fermé → CLSD, piste → RWY, voie → TWY, poste → STAND, balisage → LGT/PAPI, obstacle, travaux, oiseaux, drone).
- **Alertes NOTAM et météo LFML (26/11/2026, choix de Raph : idées 1 et 2 ; « NOTAM dans les fiches MUA » écarté : la tour
  gère l'aire de trafic ; « fiche de relève » écartée : l'équipe en a déjà une)**. Dans `pushRun` (cron 5 min), types `notam`
  et `meteo` :
  - NOTAM (`notamEvents`, NOTAM relus dans le cache commun 30 min `notamsCached`) : sujets M* (pistes, voies, aires, postes)
    et I* (ILS), conditions LC/AS/AU/LT/LH/LW/HW. Alerte « Nouveau NOTAM » à son apparition, « NOTAM en vigueur » à son début
    (moins de 3 h après). Clés `nn|id` / `na|id` gardées 90 jours. Drapeau `_ninit` : la 1re exécution mémorise sans envoyer.
  - Météo (`wxEvents`, `wxFlags`, `tafGroups`, METAR/TAF via `wxFetch` partagé avec ?wx=) : LVP (vis < 800 m ou plafond
    ≤ 200 ft), orage, vent ≥ 30 kt / rafales ≥ 40 kt ; observé, ou prévu avec certitude au TAF dans les 3 h (PROB ignorés).
    Une alerte au début de l'épisode (`w|k|on`), nouvelle alerte seulement 2 h après la fin (`w|k|off`).
  - Titre selon le type (Vols MRS / NOTAM LFML / Météo LFML), notification ouvre #vols, #notam ou #wx.
  - Testé en local (10 scénarios, NOTAM réels du 26/11 + météo simulée). Abonnés existants : l'appli ajoute une fois `notam`
    et `meteo` à leurs choix (`coa-push-v` = 2, seulement si le relais les connaît : réponse `prefs`). `PUSH_MAX_SUBS` = 35.
- **Alertes seulement en service (26/11/2026, demandé par Raph : « seulement en service, pas de NOTAM le matin si je suis
  en soir » ; deux modes : automatique depuis le Planning COA, ou jours cochés)**. Lien volontaire avec le Planning COA
  (dépôt planning-equipe-COA/horaires) — la dissociation du 20/11 concernait les liens d'interface.
  - Appli : Réglages → Notifications → « Quand recevoir » (`pushWhen`) : Toujours / Seulement en service ; source Planning COA
    (code de liaison `coa-push-link`, 16 car. A-H J-N P-Z 2-9, bouton Copier) ou « Je coche mes jours » (2 mois, toucher =
    vide → M → S → N → J, `coa-shift-days`, horaires `SHIFT_DEF` = défauts du Planning : M 06–14, S 14–22, N 22–06, J 07:30–16:30 ;
    `shiftSend` → ?push=shifts src manuel). `pushPost` envoie toujours `mode` et `link`. État via ?push=status.
  - Worker : abonnement { …, mode: 'all'|'shift', link } ; KV `shifts:<link>` = { at, src, win } (90 j) ; `shiftsPut` valide
    (≤ 200 créneaux, ≤ 16 h chacun, -3 j…+75 j). Dans `pushRun` : mode shift → rien hors créneau (marge 15 min avant) ; sans
    horaires reçus → alertes à toute heure (l'appli l'affiche en orange). **Résumé « Début de service »** (`briefing`) dans les
    30 min après le début : fermetures NOTAM (LC/AS/AU/LH, aire de mouvement et ILS) en cours ou qui commencent pendant le
    service (4 max) + météo LFML (LVP, orage, vent) observée ou prévue avec certitude d'ici la fin ; rien si rien à dire.
    Clé `ps|<link>|<début>`. Testé en local (tp4 : en service / hors service / sans horaires / validation / origine).

