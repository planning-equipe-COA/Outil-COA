// Relais NOTAM pour la Boîte à outils COA — Cloudflare Worker (gratuit).
// Il garde les identifiants de l'API NOTAM de la FAA (jamais dans l'appli publique), interroge les NOTAM d'un aéroport
// et garde la réponse 30 min en cache pour ne pas appeler l'API à chaque ouverture.
//
// À coller dans Cloudflare → Workers → (nouveau worker) → Modifier le code → Déployer.
// Puis Paramètres → Variables et secrets : ajouter deux SECRETS
//   FAA_CLIENT_ID      = client_id donné par api.faa.gov
//   FAA_CLIENT_SECRET  = client_secret donné par api.faa.gov
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
    if (!env.FAA_CLIENT_ID || !env.FAA_CLIENT_SECRET) return json({ error: 'identifiants FAA manquants (secrets du worker)' }, 500, origin);

    const cache = caches.default;
    const key = new Request(`https://notam-cache.local/${icao}`);
    const hit = await cache.match(key);
    if (hit) { const body = await hit.json(); return json(body, 200, origin, { 'X-Cache': 'HIT' }); }

    try {
      const notams = await fetchFaa(icao, env);
      const body = { icao, at: new Date().toISOString(), source: 'FAA NOTAM API', count: notams.length, notams };
      ctx.waitUntil(cache.put(key, new Response(JSON.stringify(body), { headers: { 'Cache-Control': `max-age=${CACHE_SECONDS}` } })));
      return json(body, 200, origin, { 'X-Cache': 'MISS' });
    } catch (e) {
      return json({ error: String(e.message || e) }, 502, origin);
    }
  },
};
