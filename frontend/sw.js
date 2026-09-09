/**
 * Service Worker para la PWA de Finanzas y Tarjetas
 * Carga instantánea offline y gestión de caché de recursos estáticos.
 */

const CACHE_NAME = 'finanzas-pwa-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/financial-engine.js',
  './js/api.js',
  './js/ui.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Instalación: Precarga de archivos esenciales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precargando activos estáticos para uso offline');
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('[SW] Aviso al cachear algunos recursos:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activación: Limpieza de cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Borrando caché obsoleta:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepción de solicitudes de red
self.addEventListener('fetch', (event) => {
  // Ignorar llamadas a la API de Google Apps Script (se manejan en api.js con cola offline)
  if (event.request.url.includes('script.google.com') || event.request.url.includes('script.googleusercontent.com')) {
    return;
  }

  // Network-First para código de la app (JS, HTML, CSS) para asegurar actualizaciones inmediatas
  const isAppCode = event.request.url.includes('/js/') || 
                    event.request.url.includes('index.html') || 
                    event.request.mode === 'navigate';

  if (isAppCode) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-First para recursos estáticos pesados (CDN, fuentes, imágenes)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
