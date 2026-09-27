// sw.js — Fonctionnement hors-ligne : garde une copie des fichiers de l'app sur l'appareil.
// À chaque nouvelle version de l'app, augmenter VERSION pour que la tablette récupère les nouveaux fichiers.
const VERSION = 'carnet-v1.1.0';
const FONTS = 'carnet-fonts';
const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/pdfimport.js', 'js/photos.js', 'js/backup.js', 'js/lock.js', 'js/update.js', 'js/screens/sauvegarde.js', 'js/screens/imprimer.js', 'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs',
  'js/app.js', 'js/db.js', 'js/model.js', 'js/ui.js', 'js/nav.js', 'js/components.js', 'js/demo.js',
  'js/screens/accueil.js', 'js/screens/trombi.js', 'js/screens/eleve.js', 'js/screens/groupes.js', 'js/screens/notes.js', 'js/screens/admin.js',
  'js/screens/projet.js', 'js/screens/reglages.js', 'js/screens/edit-classe.js', 'js/screens/edit-projet.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

// cache: 'reload' : on télécharge toujours les fichiers frais du serveur (pas une vieille copie du navigateur).
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Police Nunito (Google Fonts) : gardée en cache après le premier chargement en ligne.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try { const res = await fetch(e.request); if (res.ok || res.type === 'opaque') c.put(e.request, res.clone()); return res; }
      catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Test sur l'ordinateur (localhost) : toujours la dernière version des fichiers.
  if (DEV) { e.respondWith(fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }))); return; }
  // Fichiers de l'app : d'abord la copie locale (démarrage instantané, hors-ligne), sinon le réseau.
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).catch(() => caches.match('index.html'))));
});
