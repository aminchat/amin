const CACHE = 'capital-app-v103';
const ASSETS = [
  './',
  './index.html',
  './help-gemini.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/utils.js',
  './js/jalali.js',
  './js/book.js',
  './js/state.js',
  './js/view.js',
  './js/modal.js',
  './js/forms.js',
  './js/remind.js',
  './js/render.js',
  './js/sync.js',
  './js/txfilter.js',
  './js/prefs.js',
  './js/onboard.js',
  './js/guide.js',
  './js/clarity.js',
  './js/reflect.js',
  './js/notice.js',
  './js/scanhist.js',
  './js/cards.js',
  './icons/cur/AED.svg',
  './icons/cur/AFN.svg',
  './icons/cur/AMD.svg',
  './icons/cur/AUD.svg',
  './icons/cur/AZN.svg',
  './icons/cur/BTC.svg',
  './icons/cur/CAD.svg',
  './icons/cur/CHF.svg',
  './icons/cur/CNY.svg',
  './icons/cur/ETH.svg',
  './icons/cur/EUR.svg',
  './icons/cur/GBP.svg',
  './icons/cur/INR.svg',
  './icons/cur/IQD.svg',
  './icons/cur/IRR.svg',
  './icons/cur/JPY.svg',
  './icons/cur/KWD.svg',
  './icons/cur/OMR.svg',
  './icons/cur/QAR.svg',
  './icons/cur/RUB.svg',
  './icons/cur/SAR.svg',
  './icons/cur/TMN.svg',
  './icons/cur/TRY.svg',
  './icons/cur/USD.svg',
  './icons/cur/USDT.svg',
  './icons/cur/XAU.svg',
  './icons/cur/other.svg',
  './icons/banks/ansar.svg',
  './icons/banks/ayande.svg',
  './icons/banks/blu.svg',
  './icons/banks/centeral.svg',
  './icons/banks/day.svg',
  './icons/banks/eghtesad.svg',
  './icons/banks/gardeshgari.svg',
  './icons/banks/ghavvamin.svg',
  './icons/banks/hekmat.svg',
  './icons/banks/iran-venezuela.svg',
  './icons/banks/iranzamin.svg',
  './icons/banks/karafarin.svg',
  './icons/banks/keshavarzi.svg',
  './icons/banks/khavarmianeh.svg',
  './icons/banks/kosar.svg',
  './icons/banks/maskan.svg',
  './icons/banks/mehreghtesad.svg',
  './icons/banks/mehriran.svg',
  './icons/banks/melal.svg',
  './icons/banks/mellat.svg',
  './icons/banks/melli.svg',
  './icons/banks/noor.svg',
  './icons/banks/parsian.svg',
  './icons/banks/pasargad.svg',
  './icons/banks/post.svg',
  './icons/banks/refahkargaran.svg',
  './icons/banks/resalat.svg',
  './icons/banks/saderat.svg',
  './icons/banks/saman.svg',
  './icons/banks/sanatmadan.svg',
  './icons/banks/sarmaye.svg',
  './icons/banks/sepah.svg',
  './icons/banks/shahr.svg',
  './icons/banks/shetab.svg',
  './icons/banks/sina.svg',
  './icons/banks/tejarat.svg',
  './icons/banks/tose.svg',
  './icons/banks/tosesaderat.svg',
  './icons/banks/tosetaavon.svg',
  './js/debts.js',
  './js/installments.js',
  './js/boot.js',
  './js/i18n.js',
  './i18n/en.js',
  './i18n/en-ui.js',
  './i18n/fa.js',
  './js/scan.js',
  './js/icons.js',
  './js/subs.js',
  './js/subsui.js',
  './js/health.js',
  './js/healthui.js',
  './js/securestore.js',
  './js/crypto.js',
  './icons/icon-192.png?v=5',
  './icons/icon-512.png?v=5',
  './icons/icon-maskable-192.png?v=5',
  './icons/icon-maskable-512.png?v=5',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
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

// کلیک روی اعلان یادآوری: اگر اپ باز است پیام می‌دهیم، وگرنه با پارامتر بازش می‌کنیم
self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  const data = (n && n.data) || {};
  const action = e.action || 'open';
  n.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const c = list.find((x) => 'focus' in x);
      if (c) {
        c.postMessage({ type: 'remind-action', action, data });
        return c.focus();
      }
      const base = new URL('./', self.registration.scope).href;
      return self.clients.openWindow(base + '?remind=' + encodeURIComponent(action) + '&rd=' + encodeURIComponent(JSON.stringify(data)));
    })
  );
});
