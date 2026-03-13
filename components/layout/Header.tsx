'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import styles from '@/styles/components/header.module.css';
import { useState, useEffect, useRef, useCallback } from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'Главная', labelEn: 'Home' },
  { href: '/news', label: 'Новости', labelEn: 'News' },
  { href: '/reviews', label: 'Рецензии', labelEn: 'Reviews' },
  { href: '/articles', label: 'Статьи', labelEn: 'Articles' },
  { href: '/tags', label: 'Теги', labelEn: 'Tags' },
];

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

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
            className={styles.headerButton}
            onClick={() => setMenuOpen(!menuOpen)}
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
          <Link href="/search" className={`${styles.headerButton} ${styles.searchButton}`} aria-label="Поиск">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </Link>
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
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                onClick={() => setMenuOpen(false)}
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
            className={`${styles.headerButton} ${styles.desktopSearch} ${pathname === '/search' ? styles.headerButtonActive : ''}`}
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
    </header>
  );
}
