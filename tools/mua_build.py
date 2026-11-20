"""Fiches MUA -> fichiers chiffrés pour la Boîte à outils.

Usage : MUA_CODE="mot-mot-mot-mot" python3 tools/mua_build.py DOSSIER_DES_PDF
Écrit mua/meta.json (sel, itérations), mua/index.enc (liste des fiches + texte) et mua/<id>.enc (image JPEG).
Chiffrement : PBKDF2-SHA256 (600 000 itérations) -> AES-GCM 256 ; chaque fichier = IV (12 octets) + données chiffrées.
Le code n'est jamais écrit dans le dépôt. Les PDF ne doivent JAMAIS être ajoutés au dépôt (public).
Garder le même code : le sel de mua/meta.json est réutilisé s'il existe.
"""
import os, re, sys, json, base64, hashlib, subprocess, tempfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 600000
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'mua')

def rows(text):
    res = []
    for l in text.splitlines():
        cols = [c for c in re.split(r'\s{2,}', l.strip()) if c]
        if len(cols) >= 3 and re.fullmatch(r'[A-Z0-9]{2,4}', cols[1]) and re.search(r'[A-Z]{1,4}\s?-?\d', cols[0]):
            res.append(cols)
    return res

def aliases(name):
    """« A318 / 319 / 320 » -> A318 A319 A320 ; « B737-200 / 300 » -> B737 B737-200 B737-300."""
    res, prefix, fam, dash = [], '', '', False
    for part in re.split(r'\s*[/,]\s*|\s+-\s+', name):
        p = part.replace(' ', '')
        m = re.match(r'^([A-Z]+)(\d+)(-?)(\w*)$', p)
        if m:
            prefix, fam, dash = m.group(1), m.group(2), bool(m.group(3))
            res += [p, prefix + fam]
        elif re.match(r'^\d', p) and prefix:
            res.append(prefix + fam + '-' + p if dash else prefix + p)
    return ' '.join(dict.fromkeys(res))

def main(src):
    code = os.environ.get('MUA_CODE', '').strip()
    if len(code.split('-')) < 3:
        sys.exit('MUA_CODE manquant (au moins 3 mots séparés par des tirets)')
    os.makedirs(out, exist_ok=True)
    meta_path = os.path.join(out, 'meta.json')
    if os.path.exists(meta_path):
        salt = base64.b64decode(json.load(open(meta_path))['salt'])
    else:
        salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac('sha256', code.encode(), salt, ITER, 32)
    aes = AESGCM(key)
    enc = lambda data: (lambda iv: iv + aes.encrypt(iv, data, None))(os.urandom(12))

    sheets = []
    for f in sorted(os.listdir(src)):
        if not f.upper().endswith('.PDF'):
            continue
        base = re.sub(r'^[0-9a-f]{8}-', '', f[:-4])
        m = re.match(r'^0?(\d+)-([A-Z])(?:-(\w))?', base, re.I)
        if not m:
            print('nom non reconnu, ignoré :', f); continue
        poste = m.group(1) + m.group(2).upper()
        part = (m.group(3) or '').lower()
        pdf = os.path.join(src, f)
        text = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True).stdout
        date = (re.search(r'Dernière modification\s*:\s*(\d\d/\d\d/\d{4})', text) or [None, ''])[1]
        page = ''
        pm = re.search(r'aires de stationnement\s+(\d+\s?[a-z]?)\s*$', text, re.M)
        if pm: page = pm.group(1).replace(' ', '')
        r = rows(text)
        consignes = re.findall(r'^\s*\((\d)\)\s*:\s*(.+)$', text, re.M)
        sid = hashlib.sha256((poste + part + base).encode()).hexdigest()[:12]
        with tempfile.TemporaryDirectory() as td:
            subprocess.run(['pdftoppm', '-r', '150', '-jpeg', '-jpegopt', 'quality=78', '-singlefile', pdf, td + '/p'], check=True, capture_output=True)
            from PIL import Image, ImageOps
            im = Image.open(td + '/p.jpg').convert('RGB')
            box = ImageOps.invert(im.convert('L')).point(lambda v: 255 if v > 40 else 0).getbbox()
            if box:  # enlève les marges blanches autour du cadre de la fiche
                m = 6
                im = im.crop((max(0, box[0] - m), max(0, box[1] - m), min(im.width, box[2] + m), min(im.height, box[3] + m)))
            im.save(td + '/c.jpg', quality=80, optimize=True, progressive=True)
            img = open(td + '/c.jpg', 'rb').read()
            size = im.size
        open(os.path.join(out, sid + '.enc'), 'wb').write(enc(img))
        flat = re.sub(r'\s+', ' ', text)
        sheets.append({
            'id': sid, 'w': size[0], 'h': size[1], 'poste': poste, 'part': part, 'date': date, 'page': page,
            'avions': [{'t': c[0], 'rdn': c[1], 'info': ' · '.join(x for x in c[2:] if x not in ('/',))} for c in r],
            'consignes': [{'n': n, 't': t.strip()} for n, t in consignes],
            'alias': ' '.join(aliases(c[0]) for c in r),
            'text': flat,
        })
    order = lambda s: (int(re.match(r'\d+', s['poste']).group()), s['poste'], s['part'])
    sheets.sort(key=order)
    idx = json.dumps({'v': 1, 'sheets': sheets}, ensure_ascii=False).encode()
    open(os.path.join(out, 'index.enc'), 'wb').write(enc(idx))
    json.dump({'v': 1, 'iter': ITER, 'salt': base64.b64encode(salt).decode(), 'count': len(sheets)}, open(meta_path, 'w'))
    print(len(sheets), 'fiches chiffrées dans', os.path.normpath(out))

if __name__ == '__main__':
    main(sys.argv[1])
