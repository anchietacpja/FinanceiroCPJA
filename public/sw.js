self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Apenas passa as requisições, necessário para o PWA ser detectado como instalável
  event.respondWith(fetch(event.request));
});
