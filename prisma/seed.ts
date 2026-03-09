import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding CineFiles database...');

  // ============================================================
  // Categories (pre-seeded per spec)
  // ============================================================
  const categories = [
    { slug: 'news', nameRu: 'Новости', nameEn: 'News', description: 'Новости кино, сериалов и индустрии развлечений', sortOrder: 0 },
    { slug: 'reviews', nameRu: 'Рецензии', nameEn: 'Reviews', description: 'Обзоры и рецензии на фильмы, сериалы и игры', sortOrder: 1 },
    { slug: 'articles', nameRu: 'Статьи', nameEn: 'Articles', description: 'Аналитические и авторские материалы', sortOrder: 2 },
    { slug: 'interviews', nameRu: 'Интервью', nameEn: 'Interviews', description: 'Интервью с деятелями кино и индустрии', sortOrder: 3 },
    { slug: 'lists', nameRu: 'Подборки', nameEn: 'Lists', description: 'Тематические подборки и топ-листы', sortOrder: 4 },
    { slug: 'analysis', nameRu: 'Разборы', nameEn: 'Analysis', description: 'Глубокие разборы фильмов, сериалов и трендов', sortOrder: 5 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: {
        slug: cat.slug,
        nameRu: cat.nameRu,
        nameEn: cat.nameEn,
        description: cat.description,
        sortOrder: cat.sortOrder,
      },
    });
  }
  console.log(`  ✓ ${categories.length} categories seeded`);

  // ============================================================
  // App Settings (defaults)
  // ============================================================
  const settings = [
    { key: 'site_name', value: { ru: 'CineFiles', en: 'CineFiles' } },
    { key: 'site_description', value: { ru: 'Кино, сериалы, обзоры и новости', en: 'Cinema, series, reviews and news' } },
    { key: 'articles_per_page', value: { default: 20 } },
    { key: 'comments_enabled', value: { default: true } },
    { key: 'featured_count', value: { default: 5 } },
  ];

  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: {
        key: setting.key,
        value: setting.value,
      },
    });
  }
  console.log(`  ✓ ${settings.length} app settings seeded`);

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
