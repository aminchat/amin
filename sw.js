const CACHE = 'capital-app-v22';
const ASSETS = [
  './',
  './index.html',
  './help-gemini.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/utils.js',
  './js/jalali.js',
  './js/state.js',
  './js/view.js',
  './js/modal.js',
  './js/forms.js',
  './js/render.js',
  './js/sync.js',
  './js/prefs.js',
  './js/debts.js',
  './js/scan.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

function sameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!sameOrigin(e.request.url)) return;
  try {
    const path = new URL(e.request.url).pathname;
    if (path.includes('/test/') || /\/test\/?$/.test(path)) return;
  } catch (err) {}

  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => {
            if (e.request.mode === 'navigate') c.put('./index.html', copy);
            else c.put(e.request, copy);
          });
        }
        return resp;
      })
      .catch(() =>
        e.request.mode === 'navigate' ? caches.match('./index.html') : caches.match(e.request)
      )
  );
});
