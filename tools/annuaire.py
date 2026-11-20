"""Annuaire COA (numéros internes) chiffré avec le même code que le MUA.

  MUA_CODE="…" python3 tools/annuaire.py encrypt SOURCE.json   -> mua/annuaire.enc
  MUA_CODE="…" python3 tools/annuaire.py decrypt SORTIE.json    -> relit l'annuaire en clair (hors du dépôt !)
Le fichier source en clair ne doit JAMAIS être ajouté au dépôt (public). Même clé et même format que tools/mua_build.py.
Format : {"v":1,"maj":"JJ/MM/AAAA","groups":[{"name","color","note"?,"ext"? (préfixe des postes à 4 chiffres),
  "gates"? (true = portes : [porte, poste, passerelle]),"items":[[libellé, numéros séparés par « / », remarque?]]}]}
"""
import os, sys, json, base64, hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
here = os.path.dirname(os.path.abspath(__file__)); mua = os.path.join(here, '..', 'mua')
def key():
    code = os.environ.get('MUA_CODE', '').strip()
    meta = json.load(open(os.path.join(mua, 'meta.json')))
    return AESGCM(hashlib.pbkdf2_hmac('sha256', code.encode(), base64.b64decode(meta['salt']), meta['iter'], 32))
if __name__ == '__main__':
    cmd, path = sys.argv[1], sys.argv[2]; aes = key(); target = os.path.join(mua, 'annuaire.enc')
    if cmd == 'encrypt':
        data = json.dumps(json.load(open(path, encoding='utf-8')), ensure_ascii=False).encode()
        iv = os.urandom(12); open(target, 'wb').write(iv + aes.encrypt(iv, data, None)); print('écrit', os.path.normpath(target))
    else:
        b = open(target, 'rb').read(); open(path, 'w', encoding='utf-8').write(aes.decrypt(b[:12], b[12:], None).decode()); print('écrit', path)
