const CACHE_NAME = 'media-tracker-static-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];
const NETWORK_ONLY_HOSTS = ['firestore.googleapis.com', 'firebase.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firebaseinstallations.googleapis.com', 'accounts.google.com'];
const NETWORK_FIRST_HOSTS = ['api.themoviedb.org'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (NETWORK_ONLY_HOSTS.includes(url.hostname) || url.hostname.endsWith('.googleapis.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (NETWORK_FIRST_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (url.origin === self.location.origin) event.respondWith(cacheFirst(event.request));
});
