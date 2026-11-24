import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'https://dicensopollo.com'),
  title: 'Di Censo Pollo · El más rico, el más sabroso',
  description:
    'Pollo asado, papas fritas, empanadas, arepas, cachapas, completos y colaciones en Quinta Normal. Arma tu pedido en la carta online y envíalo por WhatsApp. Delivery y retiro en el local.',
  openGraph: { title: 'Di Censo Pollo', description: 'El más rico, el más sabroso. Pide por WhatsApp.', images: ['/marca/logo-512.png'], locale: 'es_CL', type: 'website' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#120c0a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <head>
        {/* Bowlby One (letrero), DM Sans (textos) y Courier Prime (la comanda, como en el sitio anterior) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Bowlby+One&family=Courier+Prime:wght@400;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
