import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const sans = Geist({ variable: '--font-sans', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'BugSwarm', template: '%s · BugSwarm' },
  description: 'A swarm of automated testers that keeps finding bugs in your app and explains them in plain English.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable} min-h-dvh bg-background font-sans text-foreground antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
