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

const ALLOWED = ['LFML', 'LFMM'];                        // aéroport + FIR de Marseille
const ORIGINS = ['https://planning-equipe-coa.github.io']; // seule l'appli peut lire la réponse
const CACHE_SECONDS = 1800;

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
let adbLast = 0; // l'offre gratuite n'accepte qu'un appel par seconde : appels espacés de 1,2 s
async function adbWindow(env, from, to, current) {
  const cache = caches.default, key = new Request(`https://notam-cache.local/adb/${from}`);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const wait = adbLast + 1200 - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  adbLast = Date.now();
  let body;
  try {
    const url = `https://aerodatabox.p.rapidapi.com/flights/airports/icao/LFML/${from}/${to}?withLeg=false&direction=Both&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false&withLocation=false`;
    const r = await fetch(url, { headers: { 'X-RapidAPI-Key': env.ADB_KEY, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' } });
    if (r.status === 204) body = { regs: {}, at: Date.now() };
    else {
      if (!r.ok) { const t = await r.text().catch(() => ''); let m = ''; try { m = JSON.parse(t).message || ''; } catch (e) { m = t.slice(0, 120); }
        throw new Error('AeroDataBox ' + r.status + (m ? ' : ' + m : '')); }
      const j = await r.json(), regs = {};
      for (const [dir, list] of [['D', j.departures || []], ['A', j.arrivals || []]]) for (const f of list) {
        const reg = f.aircraft && f.aircraft.reg, t = f.movement && f.movement.scheduledTime && f.movement.scheduledTime.local;
        if (!reg || !f.number || !t) continue;
        regs[`${dir}|${f.number.replace(/\s/g, '').toUpperCase()}|${t.slice(0, 16).replace(' ', 'T')}`] = [reg.replace(/-/g, '').toUpperCase(), (f.aircraft.model || '')];
      }
      body = { regs, at: Date.now(), left: r.headers.get('x-ratelimit-requests-remaining') || '' };
    }
    const ttl = current ? 60 * Math.max(15, +(env.ADB_REFRESH_MIN || 360)) : 86400;
    await cache.put(key, new Response(JSON.stringify(body), { headers: { 'Cache-Control': `max-age=${ttl}` } }));
  } catch (e) {
    body = { regs: {}, err: String(e.message || e) };
    await cache.put(key, new Response(JSON.stringify(body), { headers: { 'Cache-Control': 'max-age=1800' } }));
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
  const regs = Object.assign({}, ...res.map(x => x.regs));
  const put = (rows, dir) => rows.forEach(r => { const x = regs[`${dir}|${r.n.replace(/\s/g, '').toUpperCase()}|${r.t.slice(0, 16)}`]; if (x) { r.reg = x[0]; r.type = x[1]; } });
  put(body.dep, 'D'); put(body.arr, 'A');
  const err = res.find(x => x.err);
  body.adb = { n: Object.keys(regs).length, err: err ? err.err : '', left: (res.find(x => x.left) || {}).left || '' };
}
async function vols(origin, ctx, env) {
  const cache = caches.default, key = new Request('https://notam-cache.local/vols');
  const hit = await cache.match(key);
  if (hit) return json(await hit.json(), 200, origin, { 'X-Cache': 'HIT' });
  try {
    const now = new Date(), today = parisDay(now);
    const stopDay = parisDay(new Date(now.getTime() + 2 * 86400000)); // on garde aujourd'hui et demain
    const [dep, arr] = await Promise.all([fetchBoard('departures', stopDay), fetchBoard('arrivals', stopDay)]);
    const keep = r => r.t.slice(0, 10) >= today;
    // arrivées de la veille à partir de 14 h (heure de Paris) : pour retrouver les nightstops (arrivée la veille, départ ce matin)
    const veille = parisDay(new Date(now.getTime() - 86400000)) + 'T14:00';
    const body = { at: now.toISOString(), today, source: 'marseille.aeroport.fr (tableau public des vols)',
      maj: dep.maj || arr.maj, dep: dep.rows.filter(keep), arr: arr.rows.filter(r => r.t >= veille) };
    await addRegs(env, body, now).catch(() => {});
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(body), { headers: { 'Cache-Control': `max-age=${VOLS_CACHE_SECONDS}` } })));
    return json(body, 200, origin, { 'X-Cache': 'MISS' });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502, origin);
  }
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (new URL(request.url).searchParams.has('vols')) return vols(origin, ctx, env);
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
