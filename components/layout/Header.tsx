'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import { BottomSheet } from '@/components/ui/BottomSheet';
import styles from '@/styles/components/header.module.css';
import { useState, useEffect, useRef, useCallback, type PointerEvent } from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'Главная', labelEn: 'Home' },
  { href: '/news', label: 'Новости', labelEn: 'News' },
  { href: '/reviews', label: 'Рецензии', labelEn: 'Reviews' },
  { href: '/articles', label: 'Статьи', labelEn: 'Articles' },
  { href: '/tags', label: 'Теги', labelEn: 'Tags' },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const handlePointerDown = (id: string) => (_e: PointerEvent) => setPressedId(id);
  const handlePointerUp = () => setPressedId(null);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length >= 2) {
      setSearchOpen(false);
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const handleScroll = useCallback(() => {
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      const currentY = window.scrollY;
      if (currentY > lastScrollY.current && currentY > 80) {
        setHidden(true);
      } else {
        setHidden(false);
      }
      lastScrollY.current = currentY;
      ticking.current = false;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header
      className={`${styles.header} ${hidden && !menuOpen ? styles.headerHidden : ''}`}
    >
      <div className={styles.inner}>
        {/* Left section: burger + search (mobile) */}
        <div className={styles.leftButtons}>
          <button
            className={`${styles.headerButton}${pressedId === 'burger' ? ` ${styles.pressedToActive}` : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
            onPointerDown={handlePointerDown('burger')}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            aria-label="Меню"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {menuOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" />
              )}
            </svg>
          </button>
          <button
            className={`${styles.headerButton} ${styles.searchButton}${pressedId === 'search-mobile' ? ` ${styles.pressedToActive}` : ''}`}
            onPointerDown={handlePointerDown('search-mobile')}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onClick={() => setSearchOpen(true)}
            aria-label="Поиск"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
        </div>

        {/* Center: logo */}
        <Link href="/" className={styles.logoWrapper}>
          <span className={styles.logoFull}>CineFiles</span>
          <span className={styles.logoShort}>CF</span>
        </Link>

        {/* Desktop nav */}
        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ''}`}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}${pressedId === item.href ? ` ${styles.pressedToActive}` : ''}`}
                onClick={() => setMenuOpen(false)}
                onPointerDown={handlePointerDown(item.href)}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right section: icon buttons */}
        <div className={styles.rightButtons}>
          <Link
            href="/search"
            className={`${styles.headerButton} ${styles.desktopSearch} ${pathname === '/search' ? styles.headerButtonActive : ''}${pressedId === 'search-desktop' ? ` ${styles.pressedToActive}` : ''}`}
            onPointerDown={handlePointerDown('search-desktop')}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            aria-label="Поиск"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </Link>
          <ThemeToggle />
        </div>
      </div>

      <BottomSheet open={searchOpen} onClose={() => setSearchOpen(false)} title="Поиск">
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Статьи, фильмы, персоны..."
            autoFocus
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: 15,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={searchQuery.trim().length < 2}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--brand-primary)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: searchQuery.trim().length < 2 ? 0.5 : 1,
            }}
          >
            Найти
          </button>
        </form>
      </BottomSheet>
    </header>
  );
}
