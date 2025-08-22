import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/providers/ThemeProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'VX200 Repetidora Dashboard',
  description: 'Dashboard moderno para control y monitoreo de repetidora VX200',
  keywords: 'ham radio, repetidora, APRS, DTMF, alertas meteorológicas, dashboard',
  authors: [{ name: 'VX200 Team' }],
  viewport: 'width=device-width, initial-scale=1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
