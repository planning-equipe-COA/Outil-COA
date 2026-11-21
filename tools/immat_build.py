"""Base des immatriculations (consultation) -> mua/immat.enc, chiffrée avec le même code que le MUA.

Usage : MUA_CODE="…" python3 tools/immat_build.py FICHIER.csv
Source : export « Recherche_Aircraft » de l'aéroport (base interne, fichier hors du dépôt public).
On ne garde QUE : immatriculation, code IATA et nom de la compagnie, type d'avion (code IATA), sièges, masse maximale.
Les données de facturation (comptes clients, marges, TVA, groupes acoustiques…) ne sont jamais reprises.
Chiffrement : même clé que mua/meta.json (PBKDF2 -> AES-GCM), données compressées gzip avant chiffrement.
"""
import os, sys, csv, json, gzip, base64, hashlib, datetime
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

here = os.path.dirname(os.path.abspath(__file__)); mua = os.path.join(here, '..', 'mua')

def main(path):
    code = os.environ.get('MUA_CODE', '').strip()
    meta = json.load(open(os.path.join(mua, 'meta.json')))
    aes = AESGCM(hashlib.pbkdf2_hmac('sha256', code.encode(), base64.b64decode(meta['salt']), meta['iter'], 32))
    raw = open(os.path.join(mua, 'index.enc'), 'rb').read()
    try:  # vérifie le code avec l'index des fiches déjà en ligne
        aes.decrypt(raw[:12], raw[12:], None)
    except Exception:
        sys.exit("Code incorrect : il ne déchiffre pas les fiches déjà en ligne. Rien n'a été modifié.")
    rows = {}
    with open(path, encoding='utf-8-sig') as f:
        r = csv.reader(f); h = next(r); ix = {k: i for i, k in enumerate(h)}
        for x in r:
            if len(x) != len(h):
                continue
            reg = x[ix['Registration']].strip().upper().replace('-', '').replace(' ', '')
            if not reg:
                continue
            seats = x[ix['Sièges_offerts_après_changement']] or x[ix['Sièges_offerts_initial']]
            mtow = x[ix['Poids_max_apres_changement']] or x[ix['Poids_maximum']]
            rows[reg] = [reg, x[ix['Iata_Code']].strip(), x[ix['Nom_Comp']].strip().title(), x[ix['Aircraft_type']].strip(),
                         int(seats) if seats.isdigit() else 0, int(float(mtow)) if mtow.replace('.', '', 1).isdigit() else 0]
    date = datetime.date.fromtimestamp(os.path.getmtime(path)).strftime('%d/%m/%Y')
    data = gzip.compress(json.dumps({'v': 1, 'date': date, 'rows': sorted(rows.values())}, ensure_ascii=False, separators=(',', ':')).encode())
    iv = os.urandom(12)
    open(os.path.join(mua, 'immat.enc'), 'wb').write(iv + aes.encrypt(iv, data, None))
    print(len(rows), 'immatriculations chiffrées (fichier du', date + ')')

if __name__ == '__main__':
    main(sys.argv[1])
