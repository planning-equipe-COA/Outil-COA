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

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
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
