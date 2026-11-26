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
// METAR + TAF de plusieurs terrains (cache 10 min), utilisé par la route ?wx= et par les alertes météo LFML
async function wxFetch(ids) {
  const cache = caches.default, key = new Request('https://notam-cache.local/wx/' + ids.join(','));
  const hit = await cache.match(key);
  if (hit) return hit.json();
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
  await cache.put(key, new Response(JSON.stringify(body), { headers: { 'Cache-Control': 'max-age=600' } }));
  return body;
}
async function wxMulti(origin, ctx, raw) {
  const ids = [...new Set(String(raw).split(',').map(x => x.trim().toUpperCase()).filter(x => /^[A-Z]{4}$/.test(x)))].sort().slice(0, 40);
  if (!ids.length) return json({ error: 'codes OACI manquants' }, 400, origin);
  try { return json(await wxFetch(ids), 200, origin); }
  catch (e) { return json({ error: String(e.message || e) }, 502, origin); }
}

/* ---------- Alertes NOTAM importants et météo LFML (tâche planifiée) ---------- */
// NOTAM : aire de mouvement (pistes, voies, aires de trafic, postes) et ILS, fermés / hors service / limités / travaux.
// Alerte quand un tel NOTAM apparaît, puis quand il entre en vigueur. NOTAM relus dans le cache commun (30 min).
const NOTAM_SUBJ = /^(M[RXNKPSTDUA]|I[A-Z])$/, NOTAM_COND = /^(LC|AS|AU|LT|LH|LW|HW)$/;
async function notamsCached(env) {
  const cache = caches.default, key = new Request('https://notam-cache.local/LFML');
  const hit = await cache.match(key);
  if (hit) return (await hit.json()).notams || [];
  if (!(env.AR_EMAIL && env.AR_PASSWORD)) return null;
  const notams = await fetchAutorouter('LFML', env);
  const body = { icao: 'LFML', at: new Date().toISOString(), source: 'autorouter.aero (base NOTAM européenne EAD)', count: notams.length, notams };
  await cache.put(key, new Response(JSON.stringify(body), { headers: { 'Cache-Control': `max-age=${CACHE_SECONDS}` } }));
  return notams;
}
const fmtZ = ms => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`; };
function notamEvents(list, sent, now) {
  const ev = [], first = !sent._ninit;
  for (const n of list) {
    const subj = (n.q || '').slice(1, 3), cond = (n.q || '').slice(3, 5);
    if (!NOTAM_SUBJ.test(subj) || !NOTAM_COND.test(cond)) continue;
    const st = Date.parse(n.start) || 0, perm = /PERM/i.test(n.end || ''), en = perm ? Infinity : (Date.parse(n.end) || Infinity);
    if (en < now) continue;
    const what = String(n.text || '').replace(/\s+/g, ' ').trim().slice(0, 100), active = st <= now;
    const when = perm ? `depuis le ${fmtZ(st)}, permanent` : active ? `jusqu'au ${fmtZ(en)}` : `du ${fmtZ(st)} au ${fmtZ(en)}`;
    if (!sent['nn|' + n.id]) {
      if (first) { sent['nn|' + n.id] = now; if (active) sent['na|' + n.id] = now; continue; } // 1re fois : on mémorise sans envoyer
      ev.push({ k: 'nn|' + n.id, type: 'notam', txt: `${active ? 'NOTAM en vigueur' : 'Nouveau NOTAM'} ${n.id} : ${what} (${when})` });
      if (active) sent['na|' + n.id] = now;
    } else if (active && !sent['na|' + n.id] && st > now - 3 * 3600e3) {
      ev.push({ k: 'na|' + n.id, type: 'notam', txt: `NOTAM en vigueur ${n.id} : ${what} (${when})` });
    }
  }
  sent._ninit = 1;
  return ev;
}
// Météo LFML : LVP (visibilité < 800 m ou plafond ≤ 200 ft), orage, vent ≥ 30 kt ou rafales ≥ 40 kt.
// Observé (METAR) ou prévu avec certitude au TAF dans les 3 h (les PROB ne déclenchent rien).
// Une alerte au début de l'épisode, puis rien tant qu'il dure ; nouvelle alerte possible 2 h après la fin.
function wxFlags(raw) {
  const w = raw.split(/\s+/), cavok = /\bCAVOK\b/.test(raw), vt = raw.match(/(?:^|\s)(\d{4})(?:NDV)?(?=\s|$)/);
  const vis = cavok ? 9999 : vt ? +vt[1] : null, ceil = Math.min(...[...raw.matchAll(/\b(BKN|OVC|VV)(\d{3})/g)].map(x => +x[2] * 100));
  const wm = raw.match(/\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/);
  return { lvp: (vis != null && vis < 800) || ceil <= 200, ts: w.some(x => /^[+-]?(VC)?TS/.test(x)), wind: !!wm && (+wm[2] >= 30 || +(wm[3] || 0) >= 40),
    det: { vis, ceil, wind: wm ? `${+wm[2]} kt${wm[3] ? ' rafales ' + (+wm[3]) + ' kt' : ''}` : '' } };
}
function tafGroups(taf, nowMs) {
  const now = new Date(nowMs), Y = now.getUTCFullYear(), M = now.getUTCMonth(), D0 = now.getUTCDate();
  const at = (dd, hh) => { let m = M; if (+dd < D0 - 15) m++; else if (+dd > D0 + 15) m--; return Date.UTC(Y, m, +dd, +hh); };
  const body = String(taf).replace(/\s+/g, ' ').replace(/^TAF (AMD |COR )?\w{4} \d{6}Z /, '');
  const parts = body.split(/ (?=(?:PROB\d{2}|BECMG|FM\d{6})\b)|(?<!PROB\d{2}) (?=TEMPO\b)/), out = [];
  parts.forEach((g, i) => { let a, b; const fm = g.match(/^FM(\d{2})(\d{2})(\d{2})/), pr = g.match(/(\d{2})(\d{2})\/(\d{2})(\d{2})/);
    if (fm) { a = at(fm[1], fm[2]); const nx = (parts.slice(i + 1).find(x => /^FM/.test(x)) || '').match(/^FM(\d{2})(\d{2})/); b = nx ? at(nx[1], nx[2]) : Infinity; }
    else if (pr) { a = at(pr[1], pr[2]); b = at(pr[3], pr[4]); } else return;
    out.push({ a, b, prob: /^PROB/.test(g), kind: (g.match(/^(PROB\d{2} TEMPO|PROB\d{2}|TEMPO|BECMG|FM)/) || ['base'])[0], txt: g.replace(/^(PROB\d{2} )?(TEMPO |BECMG )?(FM\d{6} )?\d{4}\/\d{4} ?/, '') }); });
  return out;
}
function wxEvents(o, sent, now) {
  const ev = []; if (!o || !o.metar) return ev;
  const obsRaw = o.metar.replace(/^(METAR|SPECI)\s+\w{4}\s+\d{6}Z\s+(AUTO\s+)?/, '').split(/\s+(?:TEMPO|BECMG|NOSIG)\b/)[0];
  const obs = wxFlags(obsRaw), fc = { lvp: null, ts: null, wind: null };
  for (const g of tafGroups(o.taf || '', now)) { if (g.prob || g.b < now || g.a > now + 3 * 3600e3) continue; const f = wxFlags(g.txt);
    for (const k of ['lvp', 'ts', 'wind']) if (f[k] && !fc[k]) fc[k] = { g, f }; }
  const label = { lvp: 'conditions LVP', ts: 'orage', wind: 'vent fort' };
  const detail = (k, d) => k === 'lvp' ? [d.vis != null && d.vis < 800 ? `visibilité ${d.vis} m` : '', d.ceil <= 200 ? `plafond ${d.ceil} ft` : ''].filter(Boolean).join(', ') : k === 'wind' ? d.wind : '';
  for (const k of ['lvp', 'ts', 'wind']) {
    const on = obs[k] || !!fc[k], key = 'w|' + k;
    if (!on) { if (sent[key + '|on']) { delete sent[key + '|on']; sent[key + '|off'] = now; } continue; }
    if (sent[key + '|on'] || now - (sent[key + '|off'] || 0) < 2 * 3600e3 && sent[key]) continue;
    sent[key + '|on'] = 1; sent[key] = now;
    const txt = obs[k] ? `LFML : ${label[k]} observé${k === 'lvp' ? 'es' : ''}${detail(k, obs.det) ? ' (' + detail(k, obs.det) + ')' : ''}`
      : `LFML : ${label[k]} prévu${k === 'lvp' ? 'es' : ''} au TAF d'ici 3 h (${fc[k].g.kind === 'base' ? '' : fc[k].g.kind + ' '}${fmtZ(Math.max(fc[k].g.a, now)).slice(6)}${detail(k, fc[k].f.det) ? ', ' + detail(k, fc[k].f.det) : ''})`;
    ev.push({ k: key + '|' + now, type: 'meteo', txt });
  }
  return ev;
}

/* ---------- Notifications (Web Push) : annulations, déroutements, retards ≥ 60 min, source en panne ---------- */
// Réglages Cloudflare : espace KV lié sous le nom PUSH ; variable VAPID_PUBLIC ; secret VAPID_PRIVATE ;
// déclencheur cron « */5 * * * * ». Sans eux, rien n'est envoyé (le reste du worker marche normalement).
// KV : « subs » = { id: { sub, prefs, at } }, « sent » = { clé d'alerte: horodatage } (gardé 36 h).
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)$/;
const PUSH_TYPES = ['annul', 'derout', 'retard', 'src', 'notam', 'meteo'];
const PUSH_MAX_SUBS = 35; // offre gratuite : 50 sous-requêtes par exécution (vols, NOTAM, météo + 1 par téléphone)
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
    return json({ ok: true, n: Object.keys(subs).length, prefs }, 200, origin);
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
  // NOTAM importants et météo LFML (une source en panne n'empêche pas les autres alertes)
  try { const nl = await notamsCached(env); if (nl) ev.push(...notamEvents(nl, sent, now)); } catch (e) {}
  try { const w = await wxFetch(['LFML']); ev.push(...wxEvents((w.st || {}).LFML, sent, now)); } catch (e) {}
  const first = !sent._init, fresh = ev.filter(e => !sent[e.k]);
  // NOTAM gardés 90 jours (sinon un NOTAM long redeviendrait « nouveau »), le reste 36 h
  for (const k of Object.keys(sent)) if (k[0] !== '_' && !/\|o(n|ff)$/.test(k) && now - sent[k] > (/^n[na]\|/.test(k) ? 90 * 86400e3 : 36 * 3600e3)) delete sent[k];
  fresh.forEach(e => { sent[e.k] = now; }); sent._init = 1;
  await env.PUSH.put('sent', JSON.stringify(sent)); // aussi l'état des épisodes météo et les NOTAM déjà vus
  if (first || !fresh.length) return; // 1re exécution : on mémorise l'existant sans rien envoyer
  let changed = false;
  for (const [id, s] of Object.entries(subs)) {
    const mine = fresh.filter(e => (s.prefs || PUSH_TYPES).includes(e.type)); if (!mine.length) continue;
    const kinds = [...new Set(mine.map(e => e.type === 'notam' ? 'notam' : e.type === 'meteo' ? 'wx' : 'vols'))];
    const name = kinds.length > 1 ? 'Boîte à outils COA' : { notam: 'NOTAM LFML', wx: 'Météo LFML', vols: 'Vols MRS' }[kinds[0]];
    const msg = mine.length === 1 ? { title: name, body: mine[0].txt } : { title: `${name} · ${mine.length} alertes`, body: mine.slice(0, 5).map(e => e.txt).join('\n') + (mine.length > 5 ? '\n…' : '') };
    msg.tag = 'coa-' + kinds.join('-') + '-' + now; msg.url = './#' + (kinds.length > 1 ? 'home' : kinds[0]);
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
