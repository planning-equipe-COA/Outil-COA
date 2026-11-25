// Relais NOTAM pour la Boîte à outils COA — Cloudflare Worker (gratuit).
// Il garde les identifiants de la source NOTAM (jamais dans l'appli publique), interroge les NOTAM d'un aéroport
// et garde la réponse 30 min en cache pour ne pas appeler la source à chaque ouverture.
//
// Source 1 (conseillée) : autorouter.aero — base NOTAM européenne EAD (Eurocontrol), donc les NOTAM français.
//   Compte gratuit sur autorouter.aero, puis demander l'accès API par ticket de support.
//   Secrets : AR_EMAIL (adresse du compte) et AR_PASSWORD (mot de passe du compte).
// Source 2 (secours) : API NOTAM de la FAA (api.faa.gov). Secrets : FAA_CLIENT_ID et FAA_CLIENT_SECRET.
// Si les deux sont présents, autorouter est utilisé.
//
// À coller dans Cloudflare → Workers → (nouveau worker) → Modifier le code → Déployer.
// Puis Paramètres → Variables et secrets : ajouter les SECRETS de la source choisie.
// Appel : https://<nom>.workers.dev/?icao=LFML   (seuls les codes de ALLOWED sont acceptés)
// Vols du jour : https://<nom>.workers.dev/?vols=1 (sans identifiant, tableau public de l'aéroport)
// Météo : ?wx=LFPG,LFPO (aviationweather.gov) · Notifications : ?push=key|sub|unsub|test + tâche planifiée (voir plus bas)

const ALLOWED = ['LFML', 'LFMM'];                        // aéroport + FIR de Marseille
const ORIGINS = ['https://planning-equipe-coa.github.io']; // seule l'appli peut lire la réponse
const CACHE_SECONDS = 1800;

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
function json(body, status, origin, extra) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin), ...(extra || {}) } });
}

/* ---------- autorouter.aero (EAD) ---------- */
// Jeton OAuth (valable 1 h) gardé en cache 50 min : autorouter demande de ne pas en redemander sans arrêt.
async function arToken(env) {
  const cache = caches.default, key = new Request('https://notam-cache.local/ar-token');
  const hit = await cache.match(key);
  if (hit) return (await hit.json()).t;
  const failKey = new Request('https://notam-cache.local/ar-fail');
  const fail = await cache.match(failKey);
  if (fail) throw new Error((await fail.json()).msg + ' (nouvel essai dans moins de 20 min)');
  const r = await fetch('https://api.autorouter.aero/v1.0/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.AR_EMAIL, client_secret: env.AR_PASSWORD }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    // échec de connexion gardé 20 min : ne jamais insister (autorouter bloque après plusieurs échecs)
    const msg = 'autorouter connexion ' + r.status + (j.error_description ? ' : ' + j.error_description : '');
    await cache.put(failKey, new Response(JSON.stringify({ msg }), { headers: { 'Cache-Control': 'max-age=1200' } }));
    throw new Error(msg);
  }
  await cache.put(key, new Response(JSON.stringify({ t: j.access_token }), { headers: { 'Cache-Control': 'max-age=3000' } }));
  return j.access_token;
}
const iso = s => (s ? new Date(s * 1000).toISOString() : '');
const yymmddhhmm = s => { const d = new Date(s * 1000); const p = n => String(n).padStart(2, '0');
  return String(d.getUTCFullYear()).slice(2) + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()); };
async function fetchAutorouter(icao, env) {
  const token = await arToken(env);
  const now = Math.floor(Date.now() / 1000), all = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const url = 'https://api.autorouter.aero/v1.0/notam?' + new URLSearchParams({ itemas: JSON.stringify([icao]), offset: String(offset), limit: '100' });
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('autorouter NOTAM ' + r.status);
    const data = await r.json();
    for (const n of data.rows || []) {
      if (n.suppressed) continue;
      if (n.endvalidity && n.endvalidity < now) continue;               // déjà expiré
      const perm = !n.endvalidity || n.endvalidity >= 2147483647;       // pas de fin = permanent
      const id = `${n.series || ''}${String(n.number || '').padStart(4, '0')}/${String(n.year || '').slice(-2)}`;
      const q = 'Q' + (n.code23 || '') + (n.code45 || '');
      const full = [
        `Q) ${n.fir || ''}/${q}/${n.traffic || ''}/${n.purpose || ''}/${n.scope || ''}/${String(n.lower ?? '').padStart(3, '0')}/${String(n.upper ?? '').padStart(3, '0')}/`,
        `A) ${(n.itema || [icao]).join(' ')} B) ${yymmddhhmm(n.startvalidity)} C) ${perm ? 'PERM' : yymmddhhmm(n.endvalidity) + (n.estimation ? ' EST' : '')}`,
        n.itemd ? `D) ${n.itemd}` : '', `E) ${n.iteme || ''}`, n.itemf ? `F) ${n.itemf}` : '', n.itemg ? `G) ${n.itemg}` : '',
      ].filter(Boolean).join('\n');
      all.push({ id, series: n.series || '', q, start: iso(n.startvalidity), end: perm ? 'PERM' : iso(n.endvalidity),
        text: n.iteme || '', full, location: (n.itema || [icao])[0] });
    }
    if (!data.rows || data.rows.length < 100 || offset + 100 >= (data.total || 0)) break;
  }
  return all;
}

/* ---------- API NOTAM de la FAA (secours) ---------- */
async function fetchFaa(icao, env) {
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const url = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&pageSize=1000&pageNum=${page}`;
    const r = await fetch(url, { headers: { client_id: env.FAA_CLIENT_ID, client_secret: env.FAA_CLIENT_SECRET } });
    if (!r.ok) throw new Error('FAA ' + r.status);
    const data = await r.json();
    for (const it of data.items || []) {
      const p = it.properties && it.properties.coreNOTAMData || {};
      const n = p.notam || {};
      const icaoTxt = (p.notamTranslation || []).find(t => t.type === 'ICAO');
      all.push({
        id: n.number || n.id || '',
        series: n.series || '',
        q: n.selectionCode || '',
        start: n.effectiveStart || '',
        end: n.effectiveEnd || '',
        text: n.text || '',
        full: icaoTxt ? icaoTxt.formattedText : '',
        location: n.icaoLocation || n.location || icao,
      });
    }
    if (!data.totalPages || page >= data.totalPages) break;
  }
  return all;
}

/* ---------- Vols du jour (tableau public de l'aéroport Marseille Provence) ---------- */
// Le site renvoie ~9 Mo (3 mois de programme) TRIÉS par heure : on ne lit que le début du flux
// (aujourd'hui + demain ≈ 300 Ko) puis on coupe -> peu de CPU, compatible avec le plan gratuit.
// Appel : https://<nom>.workers.dev/?vols=1   (réponse gardée VOLS_CACHE_SECONDS en cache)
const VOLS_CACHE_SECONDS = 180;
const parisDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d); // AAAA-MM-JJ
async function fetchBoard(kind, stopDay) {
  const r = await fetch(`https://www.marseille.aeroport.fr/api-vols/vol/${kind}/data`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; COA-outils)', Accept: 'application/json' },
  });
  if (!r.ok) throw new Error('aéroport ' + r.status);
  const reader = r.body.getReader(), dec = new TextDecoder(), stop = `"time":"${stopDay}T`;
  let s = '', end = false;
  while (s.length < 1500000) {
    const { value, done } = await reader.read();
    if (done) { end = true; break; }
    const from = Math.max(0, s.length - 64);
    s += dec.decode(value, { stream: true });
    if (s.indexOf(stop, from) >= 0) break;
  }
  if (!end) await reader.cancel().catch(() => {});
  let data;
  if (end) data = JSON.parse(s);
  else {
    const i = s.indexOf(stop), cut = s.lastIndexOf(',{"url_fr"', i < 0 ? s.length : i);
    if (cut < 0) throw new Error('format inattendu');
    data = JSON.parse(s.slice(0, cut) + ']}}');
  }
  const key = kind === 'arrivals' ? 'Arrivals' : 'Departures';
  const rows = (data[key] && data[key].Vol) || [];
  const out = rows.map(v => ({
    n: v.flightNb || '', al: v.companyIATA || '', cie: v.companyName || '', t: v.time || '',
    ville: String(v.location || '').replace(/\s+/g, ' ').trim(), code: v.code_location || '',
    st: v.status_fr || '', cls: v.className || '', porte: v.Porte || '', zone: v.Zone_Embarquement || '',
    term: v.terminal || '', tapis: v.tapis_Livraison_Bagage || '', emb: v.StatutEmbarquement_fr || '',
    banques: v.NumBanqueEnregistrement || '',
  }));
  return { maj: data.lastUpdate || '', rows: out };
}
/* ---------- Immatriculations des vols : AeroDataBox (RapidAPI), facultatif ---------- */
// Secret ADB_KEY (clé RapidAPI). Sans lui, les vols restent sans immatriculation.
// Variable ADB_REFRESH_MIN : délai entre deux mises à jour de la tranche en cours (360 = offre gratuite, 30 = offre Pro).
// Tranches de 12 h (heure de Marseille) : veille 12 h-24 h (nightstops), aujourd'hui 0 h-12 h et 12 h-24 h.
// Chaque tranche est gardée en cache : une tranche passée n'est plus jamais redemandée (24 h), un échec bloque 30 min.
let adbLast = 0; // l'offre gratuite n'accepte qu'un appel par seconde : appels espacés de 2,5 s, un nouvel essai si refus
async function adbWindow(env, from, to, current) {
  const cache = caches.default, key = new Request(`https://notam-cache.local/adb2/${from}`);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  let body, failTtl = 1800;
  try {
    const url = `https://aerodatabox.p.rapidapi.com/flights/airports/icao/LFML/${from}/${to}?withLeg=false&direction=Both&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false&withLocation=false`;
    let r;
    for (let k = 0; k < 2; k++) {
      const wait = adbLast + (k ? 4000 : 2500) - Date.now();
      if (wait > 0) await new Promise(res => setTimeout(res, wait));
      adbLast = Date.now();
      r = await fetch(url, { headers: { 'X-RapidAPI-Key': env.ADB_KEY, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' } });
      if (r.status !== 429) break;
    }
    if (r.status === 429) failTtl = 120; // simple dépassement du débit : on réessaie vite
    if (r.status === 204) body = { regs: {}, at: Date.now() };
    else {
      if (!r.ok) { const t = await r.text().catch(() => ''); let m = ''; try { m = JSON.parse(t).message || ''; } catch (e) { m = t.slice(0, 120); }
        throw new Error('AeroDataBox ' + r.status + (m ? ' : ' + m : '')); }
      const j = await r.json(), regs = {};
      for (const [dir, list] of [['D', j.departures || []], ['A', j.arrivals || []]]) for (const f of list) {
        const reg = f.aircraft && f.aircraft.reg, t = f.movement && f.movement.scheduledTime && f.movement.scheduledTime.local;
        if (!reg || !f.number || !t) continue;
        (regs[`${dir}|${f.number.replace(/\s/g, '').toUpperCase()}`] ||= []).push([t.slice(0, 16).replace(' ', 'T'), reg.replace(/-/g, '').toUpperCase(), (f.aircraft.model || '')]);
      }
      body = { regs, at: Date.now(), left: r.headers.get('x-ratelimit-requests-remaining') || '' };
    }
    const ttl = current ? 60 * Math.max(15, +(env.ADB_REFRESH_MIN || 360)) : 86400;
    await cache.put(key, new Response(JSON.stringify(body), { headers: { 'Cache-Control': `max-age=${ttl}` } }));
  } catch (e) {
    body = { regs: {}, err: String(e.message || e) };
    await cache.put(key, new Response(JSON.stringify(body), { headers: { 'Cache-Control': `max-age=${failTtl}` } }));
  }
  return body;
}
async function addRegs(env, body, now) {
  if (!env.ADB_KEY) return;
  const today = body.today, hier = parisDay(new Date(now.getTime() - 86400000));
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(now));
  const wins = [[hier + 'T12:00', hier + 'T23:59', false], [today + 'T00:00', today + 'T11:59', h < 12]];
  if (h >= 12) wins.push([today + 'T12:00', today + 'T23:59', true]);
  const res = [];
  for (const [a, b, c] of wins) res.push(await adbWindow(env, a, b, c)); // l'une après l'autre (limite 1 appel / s)
  // même n° de vol, horaire le plus proche à ±4 h (les horaires AeroDataBox et ceux du site peuvent différer)
  const regs = {};
  for (const x of res) for (const [k, l] of Object.entries(x.regs || {})) if (Array.isArray(l)) (regs[k] ||= []).push(...l);
  const ms = s => Date.parse(s + ':00Z');
  let n = 0, hit = 0;
  for (const l of Object.values(regs)) n += l.length;
  const put = (rows, dir) => rows.forEach(r => {
    const l = regs[`${dir}|${r.n.replace(/\s/g, '').toUpperCase()}`]; if (!l) return;
    const t = ms(r.t.slice(0, 16)); let best = null, d = 4 * 3600e3 + 1;
    for (const c of l) { const e = Math.abs(ms(c[0]) - t); if (e < d) { d = e; best = c; } }
    if (best) { r.reg = best[1]; r.type = best[2]; hit++; }
  });
  put(body.dep, 'D'); put(body.arr, 'A');
  const err = res.find(x => x.err);
  body.adb = { n, hit, err: err ? err.err : '', left: (res.find(x => x.left) || {}).left || '' };
}
/* liste des vols (sans cache). withRegs = immatriculations AeroDataBox (pas pour la tâche planifiée : quota) */
async function buildVols(env, withRegs) {
  const now = new Date(), today = parisDay(now);
  const stopDay = parisDay(new Date(now.getTime() + 2 * 86400000)); // on garde aujourd'hui et demain
  const [dep, arr] = await Promise.all([fetchBoard('departures', stopDay), fetchBoard('arrivals', stopDay)]);
  if (!dep.rows.length && !arr.rows.length) throw new Error("tableau de l'aéroport vide ou illisible");
  const keep = r => r.t.slice(0, 10) >= today;
  // arrivées de la veille à partir de 14 h (heure de Paris) : pour retrouver les nightstops (arrivée la veille, départ ce matin)
  const veille = parisDay(new Date(now.getTime() - 86400000)) + 'T14:00';
  const body = { at: now.toISOString(), today, source: 'marseille.aeroport.fr (tableau public des vols)',
    maj: dep.maj || arr.maj, dep: dep.rows.filter(keep), arr: arr.rows.filter(r => r.t >= veille) };
  if (withRegs) await addRegs(env, body, now).catch(() => {});
  return body;
}
// Dernière liste valable gardée 24 h : si le site de l'aéroport tombe, l'appli la reçoit avec stale:true et l'erreur.
async function vols(origin, ctx, env) {
  const cache = caches.default, key = new Request('https://notam-cache.local/vols'), lastKey = new Request('https://notam-cache.local/vols-last');
  const hit = await cache.match(key);
  if (hit) return json(await hit.json(), 200, origin, { 'X-Cache': 'HIT' });
  try {
    const body = await buildVols(env, true), s = JSON.stringify(body);
    ctx.waitUntil(Promise.all([
      cache.put(key, new Response(s, { headers: { 'Cache-Control': `max-age=${VOLS_CACHE_SECONDS}` } })),
      cache.put(lastKey, new Response(s, { headers: { 'Cache-Control': 'max-age=86400' } }))]));
    return json(body, 200, origin, { 'X-Cache': 'MISS' });
  } catch (e) {
    const last = await cache.match(lastKey);
    if (last) { const b = await last.json(); b.stale = true; b.err = String(e.message || e); return json(b, 200, origin, { 'X-Cache': 'STALE' }); }
    return json({ error: String(e.message || e) }, 502, origin);
  }
}

/* ---------- Météo des provenances / destinations : aviationweather.gov (NOAA), sans clé ---------- */
// Appel : ?wx=LFPG,LFPO,EGSS (40 codes OACI au plus). Réponse gardée 10 min.
async function wxMulti(origin, ctx, raw) {
  const ids = [...new Set(String(raw).split(',').map(x => x.trim().toUpperCase()).filter(x => /^[A-Z]{4}$/.test(x)))].sort().slice(0, 40);
  if (!ids.length) return json({ error: 'codes OACI manquants' }, 400, origin);
  const cache = caches.default, key = new Request('https://notam-cache.local/wx/' + ids.join(','));
  const hit = await cache.match(key);
  if (hit) return json(await hit.json(), 200, origin, { 'X-Cache': 'HIT' });
  try {
    const q = ids.join(','), h = { headers: { 'User-Agent': 'coa-outils-worker' } };
    const [m, t] = await Promise.all([fetch(`https://aviationweather.gov/api/data/metar?ids=${q}&format=json`, h),
      fetch(`https://aviationweather.gov/api/data/taf?ids=${q}&format=json`, h)]);
    if (!m.ok) throw new Error('aviationweather ' + m.status);
    const mj = m.status === 204 ? [] : await m.json(), tj = t.ok && t.status !== 204 ? await t.json().catch(() => []) : [];
    const st = {};
    for (const x of mj) { if (!x.icaoId) continue; const o = st[x.icaoId] ||= {}; if (o.obs && o.obs >= x.obsTime) continue;
      Object.assign(o, { metar: x.rawOb || '', obs: x.obsTime || 0, cat: x.fltCat || '', vis: x.visib ?? '', wx: x.wxString || '',
        wspd: x.wspd ?? null, wgst: x.wgst ?? null, clouds: x.clouds || [], name: x.name || '' }); }
    for (const x of tj) { if (!x.icaoId) continue; const o = st[x.icaoId] ||= {}; if (!o.taf) o.taf = x.rawTAF || ''; }
    const body = { at: new Date().toISOString(), source: 'aviationweather.gov (NOAA)', st };
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(body), { headers: { 'Cache-Control': 'max-age=600' } })));
    return json(body, 200, origin, { 'X-Cache': 'MISS' });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502, origin);
  }
}

/* ---------- Notifications (Web Push) : annulations, déroutements, retards ≥ 60 min, source en panne ---------- */
// Réglages Cloudflare : espace KV lié sous le nom PUSH ; variable VAPID_PUBLIC ; secret VAPID_PRIVATE ;
// déclencheur cron « */5 * * * * ». Sans eux, rien n'est envoyé (le reste du worker marche normalement).
// KV : « subs » = { id: { sub, prefs, at } }, « sent » = { clé d'alerte: horodatage } (gardé 36 h).
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)$/;
const PUSH_TYPES = ['annul', 'derout', 'retard', 'src'];
const PUSH_MAX_SUBS = 40; // offre gratuite : 50 sous-requêtes par exécution
const b64u = {
  enc: b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); },
};
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function vapidAuth(env, endpoint) {
  const pub = b64u.dec(env.VAPID_PUBLIC), te = new TextEncoder();
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE, x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33, 65)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const part = o => b64u.enc(te.encode(JSON.stringify(o)));
  const unsigned = part({ typ: 'JWT', alg: 'ES256' }) + '.' + part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://planning-equipe-coa.github.io/Outil-COA/' });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned));
  return `vapid t=${unsigned}.${b64u.enc(sig)}, k=${env.VAPID_PUBLIC}`;
}
// chiffrement du message (RFC 8291, aes128gcm)
async function pushEncrypt(sub, text) {
  const te = new TextEncoder(), uaPub = b64u.dec(sub.keys.p256dh), auth = b64u.dec(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const hkdf = async (salt, ikm, info, len) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info },
    await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));
  const ikm = await hkdf(auth, ecdh, cat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, cat(te.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
async function pushSend(env, sub, msg) {
  const r = await fetch(sub.endpoint, { method: 'POST', body: await pushEncrypt(sub, JSON.stringify(msg)),
    headers: { 'TTL': '3600', 'Urgency': 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'Authorization': await vapidAuth(env, sub.endpoint) } });
  return r.status;
}
const pushOk = env => !!(env.PUSH && env.VAPID_PUBLIC && env.VAPID_PRIVATE);
async function subId(endpoint) { return b64u.enc(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))).slice(0, 22); }
function validSub(s) {
  try { const u = new URL(s.endpoint); return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname) && s.endpoint.length < 1000 &&
    /^[A-Za-z0-9_-]{80,100}$/.test(s.keys.p256dh) && /^[A-Za-z0-9_-]{16,30}$/.test(s.keys.auth); } catch (e) { return false; }
}
async function pushApi(request, origin, env, action) {
  if (action === 'key') return json({ key: env.VAPID_PUBLIC || '', ok: pushOk(env) }, 200, origin);
  if (request.method !== 'POST' || !ORIGINS.includes(origin)) return json({ error: 'refusé' }, 403, origin);
  if (!pushOk(env)) return json({ error: 'notifications pas encore configurées sur le relais' }, 503, origin);
  let b; try { b = await request.json(); } catch (e) { return json({ error: 'requête illisible' }, 400, origin); }
  const sub = b && b.sub; if (!sub || !validSub(sub)) return json({ error: 'abonnement invalide' }, 400, origin);
  const id = await subId(sub.endpoint), subs = JSON.parse(await env.PUSH.get('subs') || '{}');
  if (action === 'unsub') { if (subs[id]) { delete subs[id]; await env.PUSH.put('subs', JSON.stringify(subs)); } return json({ ok: true }, 200, origin); }
  const prefs = (Array.isArray(b.prefs) ? b.prefs : PUSH_TYPES).filter(x => PUSH_TYPES.includes(x));
  if (action === 'sub') {
    if (!subs[id] && Object.keys(subs).length >= PUSH_MAX_SUBS) return json({ error: `liste pleine (${PUSH_MAX_SUBS} téléphones)` }, 409, origin);
    subs[id] = { sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, prefs, at: Date.now() };
    await env.PUSH.put('subs', JSON.stringify(subs));
    return json({ ok: true, n: Object.keys(subs).length }, 200, origin);
  }
  if (action === 'test') {
    if (!subs[id]) return json({ error: "ce téléphone n'est pas inscrit" }, 404, origin);
    const st = await pushSend(env, subs[id].sub, { title: 'Boîte à outils COA', body: 'Notification de test : tout fonctionne.', tag: 'coa-test' });
    return json({ ok: st >= 200 && st < 300, status: st }, 200, origin);
  }
  return json({ error: 'action inconnue' }, 400, origin);
}
// heure locale de Paris « 2026-11-25T13:50:00 » → ms
function parisMs(t) {
  const g = Date.parse(t + 'Z'); if (isNaN(g)) return 0;
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(g)).reduce((o, x) => (o[x.type] = x.value, o), {});
  return g - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - g);
}
function delayMin(v) {
  const m = String(v.st).match(/(\d{1,2}):(\d{2})/); if (!m) return 0;
  let d = (+m[1] * 60 + +m[2]) - (+v.t.slice(11, 13) * 60 + +v.t.slice(14, 16)); if (d < -720) d += 1440; if (d > 720) d -= 1440; return d;
}
async function pushRun(env) {
  if (!pushOk(env)) return;
  const subs = JSON.parse(await env.PUSH.get('subs') || '{}'); if (!Object.keys(subs).length) return;
  const sent = JSON.parse(await env.PUSH.get('sent') || '{}'), now = Date.now(), ev = [];
  let body = null, srcErr = '';
  try { body = await buildVols(env, false); } catch (e) { srcErr = String(e.message || e); }
  if (srcErr) ev.push({ k: 'src|' + parisDay(new Date()) + '|' + Math.floor(now / 3 / 3600e3), type: 'src', txt: "Vols du jour : le site de l'aéroport ne répond plus (" + srcErr.slice(0, 80) + ')' });
  else {
    for (const [list, arr] of [[body.dep, false], [body.arr, true]]) for (const v of list) {
      if (v.t.slice(0, 10) !== body.today) continue;
      const ms = parisMs(v.t), lbl = `${v.n} ${arr ? 'de' : 'vers'} ${v.ville} (${v.t.slice(11, 16)})`;
      if (v.cls === 'annulee') { if (ms > now - 3600e3) ev.push({ k: 'c|' + v.n + '|' + v.t, type: 'annul', txt: 'Annulé : ' + lbl }); }
      else if (/d[ée]rout|divert|d[ée]tourn/i.test(v.st + ' ' + v.cls)) { if (ms > now - 3 * 3600e3) ev.push({ k: 'd|' + v.n + '|' + v.t, type: 'derout', txt: 'Dérouté : ' + lbl }); }
      else if (v.cls !== 'vol-take-off') { const d = delayMin(v); if (d >= 60 && ms + d * 60e3 > now) ev.push({ k: 'r|' + v.n + '|' + v.t, type: 'retard', txt: `Retard +${d} min : ${lbl}` }); }
    }
  }
  const first = !sent._init, fresh = ev.filter(e => !sent[e.k]);
  for (const k of Object.keys(sent)) if (k !== '_init' && now - sent[k] > 36 * 3600e3) delete sent[k];
  fresh.forEach(e => { sent[e.k] = now; }); sent._init = 1;
  if (fresh.length || first) await env.PUSH.put('sent', JSON.stringify(sent));
  if (first || !fresh.length) return; // 1re exécution : on mémorise l'existant sans rien envoyer
  let changed = false;
  for (const [id, s] of Object.entries(subs)) {
    const mine = fresh.filter(e => (s.prefs || PUSH_TYPES).includes(e.type)); if (!mine.length) continue;
    const msg = mine.length === 1 ? { title: 'Vols MRS', body: mine[0].txt } : { title: `Vols MRS · ${mine.length} alertes`, body: mine.slice(0, 5).map(e => e.txt).join('\n') + (mine.length > 5 ? '\n…' : '') };
    msg.tag = 'coa-vols-' + now; msg.url = './#vols';
    try { const st = await pushSend(env, s.sub, msg); if (st === 404 || st === 410) { delete subs[id]; changed = true; } } catch (e) {}
  }
  if (changed) await env.PUSH.put('subs', JSON.stringify(subs));
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(pushRun(env)); },
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    const sp = new URL(request.url).searchParams;
    if (sp.has('vols')) return vols(origin, ctx, env);
    if (sp.has('wx')) return wxMulti(origin, ctx, sp.get('wx'));
    if (sp.has('push')) return pushApi(request, origin, env, sp.get('push'));
    const icao = (new URL(request.url).searchParams.get('icao') || 'LFML').toUpperCase();
    if (!ALLOWED.includes(icao)) return json({ error: 'code non autorisé' }, 400, origin);
    const useAr = env.AR_EMAIL && env.AR_PASSWORD, useFaa = env.FAA_CLIENT_ID && env.FAA_CLIENT_SECRET;
    if (!useAr && !useFaa) return json({ error: 'identifiants manquants (secrets du worker)' }, 500, origin);

    const cache = caches.default;
    const key = new Request(`https://notam-cache.local/${icao}`);
    const hit = await cache.match(key);
    if (hit) { const body = await hit.json(); return json(body, 200, origin, { 'X-Cache': 'HIT' }); }

    try {
      const notams = useAr ? await fetchAutorouter(icao, env) : await fetchFaa(icao, env);
      const source = useAr ? 'autorouter.aero (base NOTAM européenne EAD)' : 'API NOTAM de la FAA';
      const body = { icao, at: new Date().toISOString(), source, count: notams.length, notams };
      ctx.waitUntil(cache.put(key, new Response(JSON.stringify(body), { headers: { 'Cache-Control': `max-age=${CACHE_SECONDS}` } })));
      return json(body, 200, origin, { 'X-Cache': 'MISS' });
    } catch (e) {
      return json({ error: String(e.message || e) }, 502, origin);
    }
  },
};
