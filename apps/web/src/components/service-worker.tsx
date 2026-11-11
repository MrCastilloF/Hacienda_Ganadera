'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker.
 *
 * Se registra solo en producción: en desarrollo el service worker cachea
 * recursos con hash que cambian en cada compilación y produce resultados
 * confusos (pantallas viejas que "no se actualizan").
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const registrar = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch {
        // Un fallo del service worker no debe romper la aplicación.
      }
    };

    if (document.readyState === 'complete') void registrar();
    else window.addEventListener('load', () => void registrar(), { once: true });

    return () => window.removeEventListener('load', () => undefined);
  }, []);

  return null;
}
