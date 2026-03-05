import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/styles/pages/admin.module.css';

export const metadata: Metadata = {
  title: {
    default: 'Админ-панель',
    template: '%s | CineFiles Admin',
  },
  robots: { index: false, follow: false },
};

const ADMIN_NAV = [
  { href: '/admin/dashboard', label: 'Панель', icon: '📊' },
  { href: '/admin/articles', label: 'Статьи', icon: '📝' },
  { href: '/admin/tags', label: 'Теги', icon: '🏷️' },
  { href: '/admin/media', label: 'Медиа', icon: '🖼️' },
  { href: '/admin/comments', label: 'Комментарии', icon: '💬' },
  { href: '/admin/collections', label: 'Подборки', icon: '📚' },
  { href: '/admin/users', label: 'Пользователи', icon: '👥' },
  { href: '/admin/settings', label: 'Настройки', icon: '⚙️' },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <Link href="/" className={styles.backLink}>
            CineFiles
          </Link>
          <span className={styles.adminBadge}>Admin</span>
        </div>
        <nav className={styles.sidebarNav}>
          {ADMIN_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={styles.sidebarLink}>
              <span className={styles.sidebarIcon}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className={styles.adminContent}>{children}</div>
    </div>
  );
}
