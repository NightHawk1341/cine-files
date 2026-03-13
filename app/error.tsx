'use client';

import Link from 'next/link';
import styles from '@/styles/pages/error.module.css';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.page}>
      <p className={styles.code}>500</p>
      <h1 className={styles.title}>Что-то пошло не так</h1>
      <p className={styles.description}>
        Произошла ошибка при загрузке страницы. Попробуйте обновить или вернуться на главную.
      </p>
      <div className={styles.actions}>
        <Link href="/" className={styles.homeLink}>
          На главную
        </Link>
        <button onClick={reset} className={styles.retryButton}>
          Попробовать снова
        </button>
      </div>
    </div>
  );
}
