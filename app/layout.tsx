import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { BottomNav } from '@/components/layout/BottomNav';
import { Providers } from '@/components/layout/Providers';
import { ScrollToTop } from '@/components/ui/ScrollToTop';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CineFiles — Кино, аниме, игры',
    template: '%s | CineFiles',
  },
  description: 'Кино, аниме, игры — новости, рецензии, разборы',
  metadataBase: new URL(process.env.APP_URL || 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'CineFiles',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                document.documentElement.classList.add('page-loading');
                try {
                  var theme = localStorage.getItem('cinefiles-theme');
                  if (theme === 'light' || theme === 'dark') {
                    document.documentElement.setAttribute('data-theme', theme);
                  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                } catch(e) {}
                document.documentElement.classList.remove('page-loading');
                document.documentElement.classList.add('page-ready');
              })();
            `,
          }}
        />
      </head>
      <body>
        <Providers>
          <div className="grain-overlay" aria-hidden="true" />
          <Header />
          <main>{children}</main>
          <Footer />
          <BottomNav />
          <ScrollToTop />
        </Providers>
      </body>
    </html>
  );
}
