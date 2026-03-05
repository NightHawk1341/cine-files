import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'О проекте',
  description: 'О проекте CineFiles — кино, аниме, игры',
};

export default function AboutPage() {
  return (
    <div className="container-narrow" style={{ paddingTop: 32 }}>
      <h1>О проекте</h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.7 }}>
        CineFiles — это медиа о кино, аниме и видеоиграх. Мы пишем рецензии,
        новости, аналитические статьи и интервью. Наша цель — собрать
        качественное русскоязычное медиа о кинематографе и pop-культуре.
      </p>
    </div>
  );
}
