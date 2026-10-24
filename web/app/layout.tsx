import type { Metadata } from 'next';
import { Hanken_Grotesk, Sora } from 'next/font/google';
import './globals.css';

const sora = Sora({ subsets: ['latin'], weight: ['300', '400', '600', '700'], variable: '--font-sora' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-hanken' });

export const metadata: Metadata = {
  title: 'NYAYA · SATYA console',
  description: 'Impersonation Radar, sealed reports, One-Click Kill and Pay Check for banks and companies.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${hanken.variable}`}>
      <body>{children}</body>
    </html>
  );
}
