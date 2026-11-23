"""Retirer un type d'avion de la liste d'une fiche MUA (sans toucher à l'image de la fiche).

  MUA_CODE="…" python3 tools/mua_retrait.py 1A "texte du type"     # retire les lignes dont le type contient ce texte
  MUA_CODE="…" python3 tools/mua_retrait.py --liste 1A             # affiche les types de la fiche

Le retrait est enregistré DANS l'index chiffré (clé « retraits ») : mua_build.py le réapplique à chaque reconstruction.
Rien n'est écrit en clair dans le dépôt.
"""
import base64, hashlib, json, os, re, sys, unicodedata
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
here = os.path.dirname(os.path.abspath(__file__)); mua = os.path.join(here, '..', 'mua')
norm = lambda s: unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower().replace(' ', '')

def apply_retraits(idx):
    """Applique idx['retraits'] {poste: [texte, …]} aux listes d'avions. Retourne le nombre de lignes retirées."""
    n = 0
    for x in idx['sheets']:
        rm = [norm(t) for p in [x['poste']] + x.get('postes', []) for t in idx.get('retraits', {}).get(p, [])]
        if not rm: continue
        keep = [a for a in x['avions'] if not any(r in norm(a['t'] + ' ' + a.get('info', '')) for r in rm)]
        n += len(x['avions']) - len(keep); x['avions'] = keep
        for t in idx.get('retraits', {}).get(x['poste'], []):  # ne plus trouver la fiche en cherchant ce type
            pat = re.compile(r'(?<![\w-])' + re.escape(t) + r'(?![\w-])', re.I)
            x['text'] = pat.sub('', x.get('text', '')); x['alias'] = pat.sub('', x.get('alias', ''))
    sy = (idx.get('synth') or {}).get('postes') or {}
    for p, lst in idx.get('retraits', {}).items():  # synthèse « types étudiés » : retirer l'élément exact de la liste
        for e in (sy.get(p) or {}).get('etudies', []):
            parts = [z.strip() for z in e['t'].rstrip('.').split(';')]
            kept = [z for z in parts if not any(norm(z) == norm(t) for t in lst)]
            if len(kept) != len(parts): n += len(parts) - len(kept); e['t'] = ' ; '.join(kept) + '.'
        ok = (sy.get(p) or {}).get('ok')  # liste « Quel poste pour cet avion ? » : « B737-800 (sans winglets) » compris
        if ok:
            k2 = [z for z in ok if not any(norm(re.sub(r'\s*\(.*\)$', '', z)) == norm(t) for t in lst)]
            n += len(ok) - len(k2); sy[p]['ok'] = k2
    return n

def main(a):
    code = os.environ.get('MUA_CODE', '').strip()
    meta = json.load(open(os.path.join(mua, 'meta.json')))
    aes = AESGCM(hashlib.pbkdf2_hmac('sha256', code.encode(), base64.b64decode(meta['salt']), meta['iter'], 32))
    path = os.path.join(mua, 'index.enc'); raw = open(path, 'rb').read()
    try: idx = json.loads(aes.decrypt(raw[:12], raw[12:], None))
    except Exception: sys.exit('Code incorrect.')
    if a[0] == '--liste':
        for x in idx['sheets']:
            if a[1] in [x['poste']] + x.get('postes', []): print(x['poste'], x['part'] or '', [v['t'] + (' (' + v['info'] + ')' if v.get('info') else '') for v in x['avions']])
        return
    poste, txt = a
    idx.setdefault('retraits', {}).setdefault(poste, [])
    if txt not in idx['retraits'][poste]: idx['retraits'][poste].append(txt)
    n = apply_retraits(idx)
    if not n: sys.exit('Aucune ligne ne correspond : rien n\'a été modifié.')
    iv = os.urandom(12)
    open(path, 'wb').write(iv + aes.encrypt(iv, json.dumps(idx, ensure_ascii=False).encode(), None))
    print(n, 'ligne(s) retirée(s) de', poste)

if __name__ == '__main__': main(sys.argv[1:])
