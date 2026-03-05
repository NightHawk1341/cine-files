import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed categories
  const categories = [
    { slug: 'news', nameRu: 'Новости', nameEn: 'News', description: 'Новости кино и развлечений', sortOrder: 1 },
    { slug: 'reviews', nameRu: 'Рецензии', nameEn: 'Reviews', description: 'Рецензии на фильмы и сериалы', sortOrder: 2 },
    { slug: 'articles', nameRu: 'Статьи', nameEn: 'Articles', description: 'Аналитические статьи', sortOrder: 3 },
    { slug: 'interviews', nameRu: 'Интервью', nameEn: 'Interviews', description: 'Интервью с деятелями кино', sortOrder: 4 },
    { slug: 'lists', nameRu: 'Подборки', nameEn: 'Lists', description: 'Тематические подборки', sortOrder: 5 },
    { slug: 'analysis', nameRu: 'Разборы', nameEn: 'Analysis', description: 'Глубокие разборы фильмов', sortOrder: 6 },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }

  // Seed default app settings
  const settings = [
    { key: 'site_name', value: { ru: 'CineFiles', en: 'CineFiles' } },
    { key: 'site_description', value: { ru: 'Кино, аниме, игры — новости, рецензии, разборы', en: 'Cinema, anime, games — news, reviews, analysis' } },
    { key: 'articles_per_page', value: { default: 20 } },
    { key: 'comments_enabled', value: { default: true } },
    { key: 'tmdb_sync_enabled', value: { default: true } },
  ];

  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
