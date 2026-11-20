# Boîte à outils COA

Appli web statique, **distincte du Planning COA** (choix de l'utilisateur) : référence pour le travail au COA
(aéroport Marseille-Provence). En ligne : https://planning-equipe-coa.github.io/Outil-COA/ (GitHub Pages, branche `main`, racine).
Le Planning COA est dans le dépôt `planning-equipe-COA/horaires` et a seulement un lien vers ici (Réglages).
L'utilisateur échange en français.

## Fichiers
- `index.html` — toute l'appli (HTML + CSS + JS). Onglets : MUA (1er), Tout, Aéroports, Compagnies, Avions, Codes retard,
  Abréviations, Alphabet, Contacts MRS. Une barre de recherche ; codes exacts (IATA/OACI) en premier. Onglet dans le `#hash`.
  Codes retard IATA (AHM 730), abréviations, alphabet OTAN, `ACX` (code OACI d'envergure, sillage, envergure indicative)
  écrits dans le fichier. Contacts MRS éditables, localStorage `coa-contacts` (copier/coller pour transférer).
  Réglages (roue) : QR code statique (SVG), adresse, « Envoyer le lien » (feuille de partage, sinon copie), aide installation.
- `airports.json` (OurAirports, domaine public : IATA, OACI, nom, ville, pays, type L/M/S, vols réguliers),
  `airlines.json`, `aircraft.json` (OpenFlights, ODbL, plus mis à jour). Un enregistrement par ligne.
- `sw.js` — hors connexion, réseau d'abord puis copie ; caches `coa-outils-*` ; changer `CACHE` à chaque mise en ligne
  qui ajoute un fichier. `manifest.json`, `icon-512.png`.

## À faire
- MUA : en attente du PDF de l'utilisateur → extraire le texte par chapitres, consultable par la recherche
  (pas de PDF intégré tel quel).
