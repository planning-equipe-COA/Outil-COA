"""Annuaire COA (numéros internes) chiffré avec le même code que le MUA.

  MUA_CODE="…" python3 tools/annuaire.py encrypt SOURCE.json   -> mua/annuaire.enc
  MUA_CODE="…" python3 tools/annuaire.py decrypt SORTIE.json    -> relit l'annuaire en clair (hors du dépôt !)
  MUA_CODE="…" python3 tools/annuaire.py remove MOT [MOT…]      -> supprime LA ligne dont le libellé + remarque contient
      tous les mots (sans accents ni majuscules) ; refuse s'il y en a 0 ou plusieurs ; n'affiche jamais de numéro
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
    if cmd == 'remove':
        import unicodedata
        n = lambda t: unicodedata.normalize('NFD', str(t)).encode('ascii', 'ignore').decode().lower()
        words = [n(w) for w in sys.argv[2:]]
        b = open(target, 'rb').read(); d = json.loads(aes.decrypt(b[:12], b[12:], None))
        hits = [(g, it) for g in d['groups'] for it in g['items']
                if all(w in n(it[0] + ' ' + (it[2] if len(it) > 2 else '') + ' ' + g['name']) for w in words)]
        if len(hits) != 1:
            sys.exit(f'{len(hits)} ligne(s) trouvée(s) pour {words} : rien n\'a été modifié. ' + ' | '.join(g['name'] + ' › ' + it[0] for g, it in hits))
        g, it = hits[0]; g['items'].remove(it)
        import datetime; d['maj'] = datetime.date.today().strftime('%d/%m/%Y')
        data = json.dumps(d, ensure_ascii=False).encode(); iv = os.urandom(12)
        open(target, 'wb').write(iv + aes.encrypt(iv, data, None)); print('ligne supprimée :', g['name'], '›', it[0])
    elif cmd == 'encrypt':
        data = json.dumps(json.load(open(path, encoding='utf-8')), ensure_ascii=False).encode()
        iv = os.urandom(12); open(target, 'wb').write(iv + aes.encrypt(iv, data, None)); print('écrit', os.path.normpath(target))
    else:
        b = open(target, 'rb').read(); open(path, 'w', encoding='utf-8').write(aes.decrypt(b[:12], b[12:], None).decode()); print('écrit', path)
