"""Procédures COA -> fichiers chiffrés (même code et même chiffrement que le MUA).

Usage : MUA_CODE="…" python3 tools/proc_build.py DOSSIER_DES_PROCEDURES
Chaque procédure = un fichier du dossier (PDF, image JPG/PNG, ou texte .md/.txt), nommé « Catégorie - Titre.ext »
(ex. « Sûreté - Bagage abandonné.pdf »). Sans « - », la catégorie est « Général ».
Un fichier « Titre.json » de même nom (facultatif) peut préciser : {"date":"JJ/MM/AAAA","ref":"…","resume":"…","etapes":["…"]}.
Écrit mua/procedures.enc (liste + texte) et mua/p-<id>.enc (pages en JPEG). Les anciens p-*.enc sont supprimés (tout est refait).
Les documents sources ne doivent JAMAIS être ajoutés au dépôt (public).
"""
import os, re, sys, json, glob, base64, hashlib, subprocess, tempfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
here = os.path.dirname(os.path.abspath(__file__)); out = os.path.join(here, '..', 'mua')

def key():
    code = os.environ.get('MUA_CODE', '').strip()
    if len(code.split('-')) < 3: sys.exit('MUA_CODE manquant')
    meta = json.load(open(os.path.join(out, 'meta.json')))
    return AESGCM(hashlib.pbkdf2_hmac('sha256', code.encode(), base64.b64decode(meta['salt']), meta['iter'], 32))

def img_bytes(path):
    from PIL import Image, ImageOps
    im = Image.open(path).convert('RGB'); im = ImageOps.exif_transpose(im)
    box = ImageOps.invert(im.convert('L')).point(lambda v: 255 if v > 40 else 0).getbbox()
    if box: im = im.crop((max(0, box[0]-8), max(0, box[1]-8), min(im.width, box[2]+8), min(im.height, box[3]+8)))
    if im.width > 2200: im = im.resize((2200, round(im.height * 2200 / im.width)))
    with tempfile.NamedTemporaryFile(suffix='.jpg') as t:
        im.save(t.name, quality=80, optimize=True, progressive=True); return open(t.name, 'rb').read(), im.size

def main(src):
    aes = key(); enc = lambda b: (lambda iv: iv + aes.encrypt(iv, b, None))(os.urandom(12))
    for f in glob.glob(os.path.join(out, 'p-*.enc')): os.remove(f)
    items = []
    for f in sorted(os.listdir(src)):
        path = os.path.join(src, f); stem, ext = os.path.splitext(f); ext = ext.lower()
        if ext not in ('.pdf', '.jpg', '.jpeg', '.png', '.md', '.txt'): continue
        cat, title = (stem.split(' - ', 1) if ' - ' in stem else ('Général', stem))
        meta = {}
        mp = os.path.join(src, stem + '.json')
        if os.path.exists(mp): meta = json.load(open(mp, encoding='utf-8'))
        pid = hashlib.sha256(f.encode()).hexdigest()[:10]
        it = {'id': pid, 'cat': cat.strip(), 'title': title.strip(), 'date': meta.get('date', ''), 'ref': meta.get('ref', ''),
              'resume': meta.get('resume', ''), 'etapes': meta.get('etapes', []), 'text': '', 'pages': []}
        if ext in ('.md', '.txt'):
            it['text'] = open(path, encoding='utf-8').read()
        elif ext == '.pdf':
            it['text'] = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True).stdout
            if not it['date']:
                m = re.search(r'(\d\d/\d\d/\d{4})', it['text']); it['date'] = m.group(1) if m else ''
            with tempfile.TemporaryDirectory() as td:
                subprocess.run(['pdftoppm', '-r', '150', '-jpeg', path, td + '/p'], check=True, capture_output=True)
                for n, pg in enumerate(sorted(glob.glob(td + '/p*.jpg'))):
                    b, (w, h) = img_bytes(pg); iid = f'p-{pid}-{n+1}'
                    open(os.path.join(out, iid + '.enc'), 'wb').write(enc(b)); it['pages'].append({'id': iid, 'w': w, 'h': h})
        else:
            b, (w, h) = img_bytes(path); iid = f'p-{pid}-1'
            open(os.path.join(out, iid + '.enc'), 'wb').write(enc(b)); it['pages'].append({'id': iid, 'w': w, 'h': h})
        it['text'] = re.sub(r'[ \t]+', ' ', it['text']).strip()
        items.append(it)
    items.sort(key=lambda i: (i['cat'].lower(), i['title'].lower()))
    data = json.dumps({'v': 1, 'items': items}, ensure_ascii=False).encode()
    open(os.path.join(out, 'procedures.enc'), 'wb').write(enc(data))
    print(len(items), 'procédure(s) chiffrée(s)')

if __name__ == '__main__': main(sys.argv[1])
