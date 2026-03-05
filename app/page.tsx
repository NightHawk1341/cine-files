import type { Metadata } from 'next';
import styles from '@/styles/pages/home.module.css';

export const metadata: Metadata = {
  title: 'CineFiles — Кино, аниме, игры',
};

export default function HomePage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className="container">
          <h1 className={styles.title}>CineFiles</h1>
          <p className={styles.subtitle}>
            Кино, аниме, игры — новости, рецензии, разборы
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.sectionTitle}>Избранное</h2>
          <p className={styles.placeholder}>Избранные статьи появятся здесь</p>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.sectionTitle}>Последние новости</h2>
          <p className={styles.placeholder}>Последние новости появятся здесь</p>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.sectionTitle}>Популярные теги</h2>
          <p className={styles.placeholder}>Популярные теги появятся здесь</p>
        </div>
      </section>
    </div>
  );
}
