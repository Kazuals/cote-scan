// Service worker de Cote : l'app s'ouvre sans réseau.
// - Coquille et fichiers construits : mis en cache à l'installation (VERSION et PRECACHE remplis par le build, vite.config.js).
// - Réponses TCGdex : réseau d'abord, copie en cache pour le hors-ligne. Images de cartes vues : cache d'abord.
// - Tesseract (script, worker, cœur wasm, données « fra ») et polices : cache d'abord.
// - /api/ n'est jamais intercepté : les données privées restent hors du cache ; la collection hors ligne vient de
//   localStorage (store.js / sync.js).
const VERSION = 'mwa3l3w7-eaed74fc';
const PRECACHE = ["assets/BinaryBitmap-Cm6bC6lR.js","assets/BitArray-CugMyyg9.js","assets/Code128Reader-CuFm_Vcq.js","assets/ExportImage-BbvahH3F.js","assets/Graded-D7bfY_1w.js","assets/HybridBinarizer-BGPABsoi.js","assets/ITFReader-DIOiTKVu.js","assets/IllegalArgumentException-DvpJh13p.js","assets/OneDReader-uKSCDuAm.js","assets/RGBLuminanceSource-DovjnFNl.js","assets/Slab-DtHdvzb0.js","assets/StringBuilder-BvFPnKMM.js","assets/System-C0knXSeH.js","assets/attacks-fr-Cfkx9n_L.js","assets/index-BZWPRNbh.css","assets/index-GsTjoQFH.js","assets/pokedex-cards-fJFPL1fo.js","assets/pokedex-fr-jzFR8Y_X.js","assets/psaScan-qy0yFekW.js","card-back-intl.webp","card-back-ja-old.webp","card-back-ja.webp","card-hashes.bin","favicon-32.png","icon-180.png","icon-192.png","icon-512.png","icon-maskable-512.png","logo.svg","manifest.webmanifest","models/slab-label.webp","models/slab.glb","set-logos/2011bw.png","set-logos/2022swsh.png","set-logos/30th.png","set-logos/cel25cc.png","set-logos/exu.png","set-logos/me06.png","set-logos/mee.png","set-logos/mep-symbole.png","set-logos/rc.png","set-logos/sma.png","set-logos/sve.png","set-logos/svp.png","set-logos/swsh10tg.png","set-logos/swsh11tg.png","set-logos/swsh12.5gg.png","set-logos/swsh12tg.png","set-logos/swsh3.png","set-logos/swsh4.5sv.png","set-logos/swsh9tg.png","set-logos/tk-bw-e-symbole.png","set-logos/tk-bw-z-symbole.png","set-logos/tk-dp-l-symbole.png","set-logos/tk-dp-m-symbole.png","set-logos/tk-ex-latia.png","set-logos/tk-hs-g-symbole.png","set-logos/tk-hs-r-symbole.png","set-logos/tk-sm-l-symbole.png","set-logos/tk-sm-r-symbole.png","set-logos/tk-xy-b-symbole.png","set-logos/tk-xy-latia-symbole.png","set-logos/tk-xy-latio-symbole.png","set-logos/tk-xy-n-symbole.png","set-logos/tk-xy-p-symbole.png","set-logos/tk-xy-su-symbole.png","set-logos/tk-xy-sy-symbole.png","set-logos/tk-xy-w-symbole.png","set-logos/xya-symbole.png"];
const SHELL = 'cote-shell-' + VERSION;
const LIMITS = { 'cote-tcgdex': 400, 'cote-img': 600, 'cote-ocr': 20, 'cote-fonts': 30 };
const url = (p) => new URL(p, self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll([url('./'), ...PRECACHE.map(url)])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('cote-shell-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Taille maximale : les plus anciennes entrées partent d'abord (cache.keys() suit l'ordre d'ajout).
async function trim(name) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - LIMITS[name]))) await c.delete(k);
}
async function put(name, req, res) {
  if (!res.ok) return;
  const c = await caches.open(name);
  await c.put(req, res);
  trim(name);
}
async function cacheFirst(name, req) {
  const hit = await caches.match(req, { cacheName: name });
  if (hit) return hit;
  // <img>, <script> et <link> demandent sans CORS : on relit en CORS (ces hôtes l'autorisent), une réponse opaque ne se garde pas
  const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
  put(name, req, res.clone());
  return res;
}
async function networkFirst(name, req) {
  try {
    const res = await fetch(req);
    put(name, req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req, { cacheName: name });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (u.origin === scope.origin) {
    if (u.pathname.startsWith('/api/')) return; // données privées : jamais en cache
    if (req.mode === 'navigate') { // application d'une seule page : la coquille sert toutes les adresses hors ligne
      e.respondWith(fetch(req).catch(() => caches.match(url('./'), { cacheName: SHELL })));
      return;
    }
    e.respondWith(caches.match(req, { cacheName: SHELL }).then((hit) => hit || fetch(req)));
    return;
  }
  if (u.hostname === 'api.tcgdex.net') e.respondWith(networkFirst('cote-tcgdex', req));
  else if (u.hostname === 'assets.tcgdex.net') e.respondWith(cacheFirst('cote-img', req));
  else if (u.hostname === 'cdn.jsdelivr.net' && /^\/npm\/(tesseract|@tesseract)/.test(u.pathname)) e.respondWith(cacheFirst('cote-ocr', req));
  else if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') e.respondWith(cacheFirst('cote-fonts', req));
});
