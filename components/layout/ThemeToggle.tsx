'use client';

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.add('theme-transition-disable');
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('theme-transition-disable');
      });
    });
  }, [theme, mounted]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  if (!mounted) return <div style={{ width: 36, height: 36 }} />;

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        color: 'var(--text-tertiary)',
        borderRadius: 8,
        transition: 'color 200ms',
      }}
    >
      {theme === 'dark' ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
