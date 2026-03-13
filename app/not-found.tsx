import Link from 'next/link';
import styles from '@/styles/pages/error.module.css';

export default function NotFound() {
  return (
    <div className={styles.page}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>Страница не найдена</h1>
      <p className={styles.description}>
        Запрашиваемая страница не существует или была удалена.
      </p>
      <div className={styles.actions}>
        <Link href="/" className={styles.homeLink}>
          На главную
        </Link>
      </div>
    </div>
  );
}
