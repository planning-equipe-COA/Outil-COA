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

def parse_name(name):
    """Postes couverts par une fiche, lus dans le nom du fichier.
    « 05-B » -> [5B] ; « 09-B-b » -> [9B] fiche b ; « 30-A-30-D » -> [30A, 30D] ; « 50A_50C » -> [50A, 50C] ;
    « 63D_64_64B_65 » -> [63D, 64, 64B, 65] ; « 6A1 » -> [6A1] ; « 51- » -> [51]."""
    base = re.sub(r'^[0-9a-f]{8}-', '', name)
    base = re.sub(r'\s*\(\d+\)$', '', base).strip('-_ ')
    postes, part = [], ''
    for t in re.split(r'[-_\s]+', base):
        if not t:
            continue
        if re.fullmatch(r'\d+[A-Z]?\d?', t):
            postes.append(t.lstrip('0') or '0')
        elif re.fullmatch(r'[A-Z]', t) and postes and not re.search(r'[A-Z]', postes[-1]):
            postes[-1] += t
        elif re.fullmatch(r'[a-z]', t) and postes:
            part = t
        else:
            return [], ''
    return postes, part

RETRAITS = {}

def old_dates(aes):
    """Dates des fiches déjà en ligne (pour ne jamais remplacer une fiche par une plus ancienne)."""
    path = os.path.join(out, 'index.enc')
    if not os.path.exists(path):
        return {}
    raw = open(path, 'rb').read()
    try:
        idx = json.loads(aes.decrypt(raw[:12], raw[12:], None))
    except Exception:
        sys.exit('Code incorrect : il ne déchiffre pas les fiches déjà en ligne. Rien n\'a été modifié.')
    global RETRAITS
    RETRAITS = idx.get('retraits', {})  # types retirés à la main (tools/mua_retrait.py), réappliqués plus bas
    return {(x['poste'], x['part']): x.get('date', '') for x in idx['sheets']}

def ddmmyyyy(d):
    m = re.match(r'(\d\d)/(\d\d)/(\d{4})', d or '')
    return (m.group(3), m.group(2), m.group(1)) if m else None

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
    before = old_dates(aes)
    enc = lambda data: (lambda iv: iv + aes.encrypt(iv, data, None))(os.urandom(12))

    # dates lues à l'œil sur les fiches scannées (texte illisible) : DOSSIER/dates.json {"fichier.PDF": "jj/mm/aaaa"}
    dpath = os.path.join(src, 'dates.json')
    manual = json.load(open(dpath, encoding='utf-8')) if os.path.exists(dpath) else {}
    sheets, images = [], {}
    for f in sorted(os.listdir(src)):
        if not f.upper().endswith('.PDF'):
            continue
        postes, part = parse_name(f[:-4])
        if not postes:
            print('nom non reconnu, ignoré :', f); continue
        poste = ' / '.join(postes)
        pdf = os.path.join(src, f)
        text = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True).stdout
        date = (re.search(r'(?:Dernière modification|Première édition)\s*:\s*(\d\d/\d\d/\d{4})', text) or [None, ''])[1]
        date = date or manual.get(f, '')
        page = ''
        pm = re.search(r'aires de stationnement\s+(\d+\s?[a-z]?)\s*$', text, re.M)
        if pm: page = pm.group(1).replace(' ', '')
        r = rows(text)
        consignes = re.findall(r'^\s*\((\d)\)\s*:\s*(.+)$', text, re.M)
        sid = hashlib.sha256((poste + part + f).encode()).hexdigest()[:12]
        with tempfile.TemporaryDirectory() as td:
            subprocess.run(['pdftoppm', '-r', '150', '-jpeg', '-jpegopt', 'quality=78', '-singlefile', pdf, td + '/p'], check=True, capture_output=True)
            from PIL import Image, ImageOps
            im = Image.open(td + '/p.jpg').convert('RGB')
            if im.height > im.width:  # fiche scannée en portrait (8C, 47A, 48C…) : remise en paysage
                im = im.rotate(-90, expand=True)
            box = ImageOps.invert(im.convert('L')).point(lambda v: 255 if v > 40 else 0).getbbox()
            if box:  # enlève les marges blanches autour du cadre de la fiche
                m = 6
                im = im.crop((max(0, box[0] - m), max(0, box[1] - m), min(im.width, box[2] + m), min(im.height, box[3] + m)))
            im.save(td + '/c.jpg', quality=80, optimize=True, progressive=True)
            img = open(td + '/c.jpg', 'rb').read()
            size = im.size
        images[sid] = img
        flat = re.sub(r'\s+', ' ', text)
        sheets.append({
            'id': sid, 'w': size[0], 'h': size[1], 'poste': poste, 'postes': postes, 'part': part, 'date': date, 'page': page,
            'avions': [{'t': c[0], 'rdn': c[1], 'info': ' · '.join(x for x in c[2:] if x not in ('/',))} for c in r],
            'consignes': [{'n': n, 't': t.strip()} for n, t in consignes],
            'alias': ' '.join(aliases(c[0]) for c in r),
            'text': flat,
        })
    order = lambda s: (int(re.match(r'\d+', s['poste']).group()), s['poste'], s['part'])
    sheets.sort(key=order)
    older = []
    for x in sheets:
        a, b = ddmmyyyy(before.get((x['poste'], x['part']), '')), ddmmyyyy(x['date'])
        if a and (not b or b < a):
            older.append(f"{x['poste']}{' fiche ' + x['part'] if x['part'] else ''} : en ligne {before[(x['poste'], x['part'])]}, nouvelle {x['date'] or 'sans date'}")
    gone = sorted(set(k for k in before) - set((x['poste'], x['part']) for x in sheets))
    if (older or gone) and os.environ.get('MUA_FORCE') != '1':
        for l in older: print('PLUS ANCIENNE que la fiche en ligne ->', l)
        for k in gone: print('Fiche en ligne absente du dossier ->', k[0], k[1])
        sys.exit('Arrêt sans rien publier. Vérifier, puis relancer avec MUA_FORCE=1 si c\'est voulu.')
    # écriture seulement maintenant (rien n'est touché si une vérification a arrêté le script)
    # n'efface QUE les images de fiches (12 caractères hexadécimaux) : jamais l'annuaire, les procédures (procedures.enc,
    # p-*.enc) ni les immatriculations (immat.enc), qui vivent dans le même dossier
    for f in os.listdir(out):
        if re.fullmatch(r'[0-9a-f]{12}\.enc', f):
            os.remove(os.path.join(out, f))
    for sid, img in images.items():
        open(os.path.join(out, sid + '.enc'), 'wb').write(enc(img))
    # synthèse « types étudiés par poste » (document interne, chiffré avec le reste) : DOSSIER/synthese.json
    spath = os.path.join(src, 'synthese.json')
    synth = json.load(open(spath, encoding='utf-8')) if os.path.exists(spath) else None
    if synth:
        covered = {p for x in sheets for p in x['postes']}
        print('synthèse :', len(synth['postes']), 'postes ; sans fiche :', sorted(set(synth['postes']) - covered) or 'aucun')
    # dimensions maximales par poste (envergure ws / longueur lg, en m) tirées du GANTT : DOSSIER/dims.json
    dpath2 = os.path.join(src, 'dims.json')
    dims = json.load(open(dpath2, encoding='utf-8')) if os.path.exists(dpath2) else None
    if dims: print('dimensions :', len(dims), 'postes')
    data = {'v': 1, 'sheets': sheets, 'synth': synth, 'dims': dims}
    if RETRAITS:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from mua_retrait import apply_retraits
        data['retraits'] = RETRAITS; print('retraits réappliqués :', apply_retraits(data), 'ligne(s)')
    idx = json.dumps(data, ensure_ascii=False).encode()
    open(os.path.join(out, 'index.enc'), 'wb').write(enc(idx))
    json.dump({'v': 1, 'iter': ITER, 'salt': base64.b64encode(salt).decode(), 'count': len(sheets)}, open(meta_path, 'w'))
    print(len(sheets), 'fiches chiffrées dans', os.path.normpath(out))

if __name__ == '__main__':
    main(sys.argv[1])
