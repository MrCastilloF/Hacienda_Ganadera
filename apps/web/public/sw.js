/**
 * Service Worker de la plataforma (PWA mínima de la Fase 1).
 *
 * Alcance deliberado: cachear el *shell* de la aplicación y ofrecer una pantalla
 * offline honesta. NO simula operación offline de datos: el registro de pesajes
 * y eventos sin conexión es la Fase 12 (contrato de sincronización, ADR-0003).
 *
 * Estrategia:
 *   · navegación → red primero, caché después, /offline como último recurso;
 *   · assets estáticos → caché primero (son inmutables por hash);
 *   · API y peticiones que no son GET → siempre red, nunca se cachean.
 */

const VERSION = 'hg-v1';
const CACHE = `hacienda-${VERSION}`;

const PRECACHE = [
  '/offline',
  '/login',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll falla completo si un recurso falla: se agrega uno por uno.
      for (const url of PRECACHE) {
        try {
          await cache.add(new Request(url, { cache: 'reload' }));
        } catch {
          /* un recurso no crítico puede faltar en el primer arranque */
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const claves = await caches.keys();
      await Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // La API nunca se sirve desde caché: un dato viejo es peor que un error visible.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(manejarNavegacion(request));
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(manejarEstatico(request));
  }
});

async function manejarNavegacion(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cache = await caches.open(CACHE);
    const cacheada = await cache.match(request);
    if (cacheada) return cacheada;

    const offline = await cache.match('/offline');
    if (offline) return offline;

    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Sin conexión</title><p>Sin conexión al servidor de la hacienda.</p>',
      { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }
}

async function manejarEstatico(request) {
  const cache = await caches.open(CACHE);
  const cacheada = await cache.match(request);
  if (cacheada) return cacheada;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return cacheada ?? Response.error();
  }
}
