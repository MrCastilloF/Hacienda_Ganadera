import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hacienda Ganadera',
  description: 'Administración, trazabilidad y monitoreo de una hacienda ganadera',
  applicationName: 'Hacienda Ganadera',
  manifest: '/manifest.webmanifest',
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
      </body>
    </html>
  );
}
