// Service worker de PowerPOS. Regla de oro: nunca cachea nada que venga de
// la API (otro origen) — solo archivos estáticos propios (JS/CSS/íconos).
// Así la app carga rápido y se puede reabrir sin conexión, pero jamás
// muestra precios o existencias viejas guardadas en caché.
const VERSION = 'powerpos-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // nunca la API ni otros orígenes

  // Navegación (abrir/recargar una página): red primero, para que nunca se
  // vea una versión vieja de la app; si no hay conexión, cae a la página
  // ya cacheada o a un aviso simple de "sin conexión".
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((r) => r || caches.match(OFFLINE_URL))),
    );
    return;
  }

  // Archivos estáticos propios (JS/CSS/íconos de Next): de la caché primero
  // para que cargue rápido, y de paso se refresca la caché en segundo plano.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/marca/')) {
    event.respondWith(
      caches.match(request).then((cacheada) => {
        const enRed = fetch(request).then((respuesta) => {
          if (respuesta.ok) caches.open(VERSION).then((cache) => cache.put(request, respuesta.clone()));
          return respuesta;
        }).catch(() => cacheada);
        return cacheada || enRed;
      }),
    );
  }
});
