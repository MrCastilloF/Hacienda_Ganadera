import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegistrar } from '@/components/service-worker';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hacienda Ganadera',
  description: 'Administración, trazabilidad y monitoreo de una hacienda ganadera',
  applicationName: 'Hacienda Ganadera',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/favicon.png', sizes: '64x64', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'Hacienda', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1f16',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body className="min-h-screen">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2"
        >
          Saltar al contenido
        </a>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
