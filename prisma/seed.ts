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

  const categoryMap: Record<string, number> = {};
  for (const cat of categories) {
    const created = await prisma.category.upsert({
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
    categoryMap[cat.slug] = created.id;
  }
  console.log(`  ${categories.length} categories seeded`);

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
  console.log(`  ${settings.length} app settings seeded`);

  // ============================================================
  // Placeholder Users
  // ============================================================
  const adminUser = await prisma.user.upsert({
    where: { yandexId: 'seed-admin-001' },
    update: {},
    create: {
      yandexId: 'seed-admin-001',
      email: 'admin@cinefiles.dev',
      displayName: 'Администратор',
      loginMethod: 'yandex',
      role: 'admin',
      preferences: {},
    },
  });

  const editorUser = await prisma.user.upsert({
    where: { yandexId: 'seed-editor-001' },
    update: {},
    create: {
      yandexId: 'seed-editor-001',
      email: 'editor@cinefiles.dev',
      displayName: 'Редактор Иванов',
      loginMethod: 'yandex',
      role: 'editor',
      preferences: {},
    },
  });

  const editorUser2 = await prisma.user.upsert({
    where: { vkId: 'seed-editor-002' },
    update: {},
    create: {
      vkId: 'seed-editor-002',
      email: 'editor2@cinefiles.dev',
      displayName: 'Мария Петрова',
      loginMethod: 'vk',
      role: 'editor',
      preferences: {},
    },
  });

  const readerUser = await prisma.user.upsert({
    where: { telegramId: 'seed-reader-001' },
    update: {},
    create: {
      telegramId: 'seed-reader-001',
      email: 'reader@cinefiles.dev',
      displayName: 'Читатель',
      loginMethod: 'telegram',
      role: 'reader',
      preferences: {},
    },
  });

  console.log('  4 users seeded (admin, 2 editors, reader)');

  // ============================================================
  // Tags
  // ============================================================
  const tagsData = [
    { slug: 'kristofer-nolan', nameRu: 'Кристофер Нолан', nameEn: 'Christopher Nolan', tagType: 'person' },
    { slug: 'denis-vilnyov', nameRu: 'Дени Вильнёв', nameEn: 'Denis Villeneuve', tagType: 'person' },
    { slug: 'interstellar', nameRu: 'Интерстеллар', nameEn: 'Interstellar', tagType: 'movie' },
    { slug: 'dyuna', nameRu: 'Дюна', nameEn: 'Dune', tagType: 'franchise' },
    { slug: 'nauchaya-fantastika', nameRu: 'Научная фантастика', nameEn: 'Sci-Fi', tagType: 'genre' },
    { slug: 'drama', nameRu: 'Драма', nameEn: 'Drama', tagType: 'genre' },
    { slug: 'triller', nameRu: 'Триллер', nameEn: 'Thriller', tagType: 'genre' },
    { slug: 'komediya', nameRu: 'Комедия', nameEn: 'Comedy', tagType: 'genre' },
    { slug: 'marvel', nameRu: 'Marvel', nameEn: 'Marvel', tagType: 'franchise' },
    { slug: 'a24', nameRu: 'A24', nameEn: 'A24', tagType: 'studio' },
    { slug: 'serial-nedeli', nameRu: 'Сериал недели', nameEn: 'Series of the week', tagType: 'topic' },
    { slug: 'premery', nameRu: 'Премьеры', nameEn: 'Premieres', tagType: 'topic' },
    { slug: 'boks-ofis', nameRu: 'Бокс-офис', nameEn: 'Box office', tagType: 'topic' },
    { slug: 'anime', nameRu: 'Аниме', nameEn: 'Anime', tagType: 'anime' },
    { slug: 'igry', nameRu: 'Игры', nameEn: 'Games', tagType: 'game' },
  ];

  const tagMap: Record<string, number> = {};
  for (const t of tagsData) {
    const tag = await prisma.tag.upsert({
      where: { slug: t.slug },
      update: {},
      create: {
        slug: t.slug,
        nameRu: t.nameRu,
        nameEn: t.nameEn,
        tagType: t.tagType,
        articleCount: 0,
      },
    });
    tagMap[t.slug] = tag.id;
  }
  console.log(`  ${tagsData.length} tags seeded`);

  // ============================================================
  // Placeholder Articles
  // ============================================================
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000);

  // Helper to check if article already exists
  async function upsertArticle(
    slug: string,
    data: Parameters<typeof prisma.article.create>[0]['data']
  ) {
    const existing = await prisma.article.findUnique({ where: { slug } });
    if (existing) return existing;
    return prisma.article.create({ data });
  }

  // --- Article 1: News ---
  const article1 = await upsertArticle('nolan-obyavil-novyj-film', {
    slug: 'nolan-obyavil-novyj-film',
    categoryId: categoryMap['news'],
    authorId: editorUser.id,
    title: 'Кристофер Нолан объявил о новом фильме: съёмки начнутся в 2026 году',
    subtitle: 'Режиссёр подтвердил, что работает над оригинальным сценарием',
    lead: 'Кристофер Нолан подтвердил, что его следующий фильм будет основан на оригинальном сценарии. Съёмки запланированы на лето 2026 года.',
    body: [
      { type: 'paragraph', text: 'Кристофер Нолан, режиссёр таких фильмов как <b>Интерстеллар</b>, <b>Начало</b> и <b>Оппенгеймер</b>, подтвердил, что его следующий проект будет полностью оригинальным.' },
      { type: 'heading', level: 2, text: 'Что известно о проекте' },
      { type: 'paragraph', text: 'По словам источников, близких к производству, фильм будет сочетать элементы научной фантастики и триллера. Бюджет проекта оценивается в $200 млн.' },
      { type: 'quote', text: 'Я всегда возвращаюсь к историям, которые невозможно рассказать в другом формате. Кино остаётся уникальным медиумом.', author: 'Кристофер Нолан', source: 'Интервью для Variety' },
      { type: 'paragraph', text: 'Каст пока не объявлен, но по слухам, студия ведёт переговоры с несколькими звёздами первого эшелона.' },
      { type: 'heading', level: 3, text: 'Сроки и прокат' },
      { type: 'list', style: 'unordered', items: [
        'Съёмки: лето 2026',
        'Планируемая премьера: конец 2027',
        'Прокатчик: Universal Pictures',
        'Формат: IMAX 70mm',
      ] },
      { type: 'divider' },
      { type: 'paragraph', text: 'Это будет второй совместный проект Нолана и Universal после оскароносного <b>Оппенгеймера</b>.' },
    ],
    status: 'published',
    publishedAt: hoursAgo(2),
    viewCount: 1842,
    commentCount: 0,
    isFeatured: true,
    isPinned: true,
    allowComments: true,
  });

  // --- Article 2: Review ---
  const article2 = await upsertArticle('retsenziya-dyuna-chast-vtoraya', {
    slug: 'retsenziya-dyuna-chast-vtoraya',
    categoryId: categoryMap['reviews'],
    authorId: editorUser2.id,
    title: 'Рецензия: «Дюна: Часть вторая» — масштаб, который меняет кино',
    subtitle: 'Дени Вильнёв создал эпос, достойный первоисточника',
    lead: '«Дюна: Часть вторая» — редкий пример сиквела, который превосходит оригинал. Вильнёв поднимает планку для всего жанра.',
    body: [
      { type: 'paragraph', text: 'Второй фильм Дени Вильнёва по роману Фрэнка Герберта — это не просто продолжение. Это завершение истории, которая требовала именно такого масштаба и внимания к деталям.' },
      { type: 'heading', level: 2, text: 'Визуальное совершенство' },
      { type: 'paragraph', text: 'Грегг Фрейзер, оператор фильма, создал одни из самых запоминающихся кадров в истории научной фантастики. Сцены на Арракисе залиты светом и песком, а Гиди Прайм — тёмный, промышленный мир — снят в инфракрасном спектре.' },
      { type: 'infobox', title: 'Технические данные', blocks: [
        { type: 'list', style: 'unordered', items: [
          'Режиссёр: Дени Вильнёв',
          'Оператор: Грегг Фрейзер',
          'Хронометраж: 166 минут',
          'Бюджет: $190 млн',
          'Формат съёмки: IMAX, частично ARRI Alexa LF',
        ] },
      ] },
      { type: 'heading', level: 2, text: 'Актёрские работы' },
      { type: 'paragraph', text: 'Тимоти Шаламе убедительно играет трансформацию Пола Атрейдеса из беженца в мессию. Зендая получает значительно больше экранного времени и полностью оправдывает ожидания. Но настоящее открытие фильма — Остин Батлер в роли Фейд-Рауты.' },
      { type: 'quote', text: 'Вильнёв снял фильм, который Герберт, вероятно, хотел бы увидеть. Это кино, которое уважает литературный первоисточник, но говорит на собственном визуальном языке.' },
      { type: 'heading', level: 2, text: 'Вердикт' },
      { type: 'paragraph', text: '<b>9 из 10</b>. «Дюна: Часть вторая» — один из лучших научно-фантастических фильмов десятилетия. Обязателен к просмотру на большом экране.' },
    ],
    status: 'published',
    publishedAt: hoursAgo(12),
    viewCount: 3205,
    commentCount: 0,
    isFeatured: true,
    allowComments: true,
  });

  // --- Article 3: Analysis ---
  const article3 = await upsertArticle('pochemu-a24-menyaet-industriyu', {
    slug: 'pochemu-a24-menyaet-industriyu',
    categoryId: categoryMap['analysis'],
    authorId: editorUser.id,
    title: 'Почему A24 меняет киноиндустрию: разбор бизнес-модели студии',
    lead: 'A24 стала одной из самых влиятельных студий Голливуда. Разбираемся, как независимая компания конкурирует с мейджорами.',
    body: [
      { type: 'paragraph', text: 'За последнее десятилетие A24 превратилась из маленького дистрибьютора в одну из самых узнаваемых студий в мире. Их подход к кинопроизводству радикально отличается от традиционной голливудской модели.' },
      { type: 'heading', level: 2, text: 'Модель низких бюджетов' },
      { type: 'paragraph', text: 'Средний бюджет фильма A24 составляет $10-15 млн — это в 10-20 раз меньше, чем у типичного блокбастера. Но отдача на инвестиции часто превышает показатели крупных студий.' },
      { type: 'list', style: 'ordered', items: [
        '«Всё везде и сразу» — бюджет $25 млн, сборы $140 млн + 7 Оскаров',
        '«Лунный свет» — бюджет $4 млн, сборы $65 млн + Оскар за лучший фильм',
        '«Наследники» — бюджет $9 млн, сборы $20 млн + культовый статус',
      ] },
      { type: 'heading', level: 2, text: 'Маркетинг через культуру' },
      { type: 'paragraph', text: 'A24 одними из первых поняли силу социальных сетей для продвижения фильмов. Их мерчандайз, мемы и коллаборации с артистами создают культурный контекст вокруг каждого релиза.' },
      { type: 'spoiler', title: 'Примеры нестандартного маркетинга A24', blocks: [
        { type: 'list', style: 'unordered', items: [
          'Продажа камня из фильма «Всё везде и сразу» за $1',
          'Pop-up магазины тематического мерча',
          'Коллаборации с независимыми дизайнерами',
          'Документальные ролики о производстве фильмов',
        ] },
      ] },
      { type: 'divider' },
      { type: 'paragraph', text: 'Модель A24 доказывает, что качество контента и умный маркетинг могут быть эффективнее, чем огромные бюджеты и массовый прокат.' },
    ],
    status: 'published',
    publishedAt: hoursAgo(36),
    viewCount: 2100,
    commentCount: 0,
    isFeatured: true,
    allowComments: true,
  });

  // --- Article 4: List ---
  const article4 = await upsertArticle('10-luchshikh-nauchnoy-fantastiki', {
    slug: '10-luchshikh-nauchnoy-fantastiki',
    categoryId: categoryMap['lists'],
    authorId: editorUser2.id,
    title: '10 лучших научно-фантастических фильмов XXI века',
    lead: 'От «Интерстеллара» до «Прибытия» — фильмы, которые переопределили жанр.',
    body: [
      { type: 'paragraph', text: 'Научная фантастика в XXI веке переживает ренессанс. Режиссёры используют жанр не только для спецэффектов, но и для исследования глубоких философских вопросов.' },
      { type: 'heading', level: 2, text: '1. Интерстеллар (2014)' },
      { type: 'paragraph', text: 'Кристофер Нолан создал фильм, в котором научная точность служит эмоциональной истории об отце и дочери. Визуализация чёрной дыры Гаргантюа стала культовой.' },
      { type: 'heading', level: 2, text: '2. Прибытие (2016)' },
      { type: 'paragraph', text: 'Дени Вильнёв адаптировал рассказ Теда Чана и сделал лингвистику центром научно-фантастического сюжета. Финальный поворот меняет восприятие всего фильма.' },
      { type: 'heading', level: 2, text: '3. Бегущий по лезвию 2049 (2017)' },
      { type: 'paragraph', text: 'Продолжение культовой классики Ридли Скотта. Вильнёв и оператор Роджер Дикинс создали один из самых красивых фильмов в истории кино.' },
      { type: 'heading', level: 2, text: '4. Из машины (2014)' },
      { type: 'paragraph', text: 'Камерный триллер Алекса Гарленда об искусственном интеллекте, который задолго до ChatGPT поставил вопрос о природе сознания.' },
      { type: 'heading', level: 2, text: '5. Гравитация (2013)' },
      { type: 'paragraph', text: 'Альфонсо Куарон снял фильм, который буквально заставляет зрителя задыхаться. Технический прорыв и актёрский подвиг Сандры Буллок.' },
      { type: 'list', style: 'ordered', items: [
        'Марсианин (2015) — Ридли Скотт',
        'Аннигиляция (2018) — Алекс Гарленд',
        'Луна 2112 (2009) — Данкан Джонс',
        'Дюна (2021) — Дени Вильнёв',
        'Всё везде и сразу (2022) — Дэниелы',
      ] },
      { type: 'divider' },
      { type: 'paragraph', text: 'Какие фильмы вы бы добавили в этот список? Делитесь в комментариях.' },
    ],
    status: 'published',
    publishedAt: hoursAgo(48),
    viewCount: 5430,
    commentCount: 0,
    isFeatured: false,
    allowComments: true,
  });

  // --- Article 5: Interview ---
  const article5 = await upsertArticle('intervyu-molodoj-rezhissyor-o-debyute', {
    slug: 'intervyu-molodoj-rezhissyor-o-debyute',
    categoryId: categoryMap['interviews'],
    authorId: editorUser.id,
    title: 'Интервью: «Мой дебют снят за три миллиона — и это свобода»',
    subtitle: 'Молодой режиссёр Алексей Громов о независимом кино в России',
    lead: 'Режиссёр Алексей Громов рассказывает о своём дебютном фильме, работе с непрофессиональными актёрами и будущем российского кино.',
    body: [
      { type: 'paragraph', text: 'Мы встретились с Алексеем Громовым после премьеры его дебютного фильма «Тишина между нами» на фестивале «Кинотавр».' },
      { type: 'heading', level: 2, text: 'О начале пути' },
      { type: 'quote', text: 'Я снимал короткометражки на телефон, пока учился в университете. Первый серьёзный проект — короткий метр на 15 минут — я показал на студенческом фестивале. После этого мне предложили снять полный метр.', author: 'Алексей Громов' },
      { type: 'paragraph', text: 'Фильм «Тишина между нами» рассказывает историю двух незнакомцев, застрявших в маленьком городе из-за отменённого поезда. За одну ночь они делятся друг с другом тем, что никогда не говорили близким людям.' },
      { type: 'heading', level: 2, text: 'О бюджете и компромиссах' },
      { type: 'quote', text: 'Три миллиона рублей — это не ограничение, это свобода. Когда у тебя нет больших денег, никто не диктует условия. Я мог снимать так, как считаю нужным.', author: 'Алексей Громов' },
      { type: 'heading', level: 2, text: 'О будущем' },
      { type: 'paragraph', text: 'Громов уже работает над вторым фильмом. На этот раз это будет жанровое кино — мистический триллер, действие которого происходит в Мурманской области.' },
      { type: 'infobox', title: 'Фильмография Алексея Громова', blocks: [
        { type: 'list', style: 'unordered', items: [
          '«Тишина между нами» (2025) — полнометражный дебют',
          '«Окно» (2023) — короткометражный фильм, 18 мин.',
          '«Последняя остановка» (2022) — короткометражный фильм, 12 мин.',
        ] },
      ] },
    ],
    status: 'published',
    publishedAt: hoursAgo(72),
    viewCount: 980,
    commentCount: 0,
    isFeatured: false,
    allowComments: true,
  });

  // --- Article 6: News (Marvel) ---
  const article6 = await upsertArticle('marvel-plany-na-2026', {
    slug: 'marvel-plany-na-2026',
    categoryId: categoryMap['news'],
    authorId: editorUser2.id,
    title: 'Marvel представила расписание фильмов на 2026-2027 годы',
    lead: 'Студия анонсировала пять новых проектов в рамках обновлённой стратегии MCU.',
    body: [
      { type: 'paragraph', text: 'На презентации Disney Upfront студия Marvel представила обновлённое расписание фильмов и сериалов. После периода пересмотра стратегии компания делает ставку на качество вместо количества.' },
      { type: 'heading', level: 2, text: 'Подтверждённые проекты' },
      { type: 'list', style: 'ordered', items: [
        '«Мстители: Канг-династия» — перенесён на 2027',
        '«Человек-паук 4» — совместная работа с Sony',
        '«Росомаха» — полнометражный фильм после успеха «Дэдпул и Росомаха»',
        '«Фантастическая четвёрка» — съёмки завершены',
        '«Шан-Чи 2» — в разработке',
      ] },
      { type: 'heading', level: 2, text: 'Новая стратегия' },
      { type: 'paragraph', text: 'Глава Marvel Studios Кевин Файги подчеркнул, что студия сокращает количество релизов до 2-3 фильмов в год. Каждый проект получит больше времени на разработку и пост-продакшн.' },
      { type: 'quote', text: 'Мы услышали наших зрителей. Качество всегда было нашим приоритетом, и мы возвращаемся к этому принципу.', author: 'Кевин Файги', source: 'Disney Upfront 2025' },
    ],
    status: 'published',
    publishedAt: hoursAgo(6),
    viewCount: 4150,
    commentCount: 0,
    isFeatured: true,
    allowComments: true,
  });

  // --- Article 7: Draft (to test draft state) ---
  const article7 = await upsertArticle('chernovik-obzor-seriala', {
    slug: 'chernovik-obzor-seriala',
    categoryId: categoryMap['reviews'],
    authorId: editorUser.id,
    title: 'Обзор нового сериала (черновик)',
    lead: 'Рабочий черновик для тестирования статуса draft.',
    body: [
      { type: 'paragraph', text: 'Это черновик статьи, который не должен отображаться на публичных страницах сайта.' },
      { type: 'paragraph', text: 'Используется для тестирования фильтрации по статусу и работы админ-панели.' },
    ],
    status: 'draft',
    viewCount: 0,
    commentCount: 0,
    allowComments: true,
  });

  // --- Article 8: Article in review ---
  const article8 = await upsertArticle('anime-vesna-2026-obzor', {
    slug: 'anime-vesna-2026-obzor',
    categoryId: categoryMap['articles'],
    authorId: editorUser2.id,
    title: 'Аниме весеннего сезона 2026: что смотреть',
    lead: 'Обзор самых ожидаемых аниме-сериалов весны 2026.',
    body: [
      { type: 'paragraph', text: 'Весенний сезон 2026 года обещает быть насыщенным. Несколько долгожданных продолжений и перспективных новинок.' },
      { type: 'heading', level: 2, text: 'Продолжения' },
      { type: 'paragraph', text: 'Фанаты ждут новые сезоны нескольких популярных тайтлов.' },
      { type: 'heading', level: 2, text: 'Новинки' },
      { type: 'paragraph', text: 'Среди оригинальных проектов выделяется несколько студий, известных качественной анимацией.' },
    ],
    status: 'review',
    viewCount: 0,
    commentCount: 0,
    allowComments: true,
  });

  const articles = [article1, article2, article3, article4, article5, article6, article7, article8];
  console.log(`  ${articles.length} articles seeded (6 published, 1 draft, 1 in review)`);

  // ============================================================
  // Article-Tag Associations
  // ============================================================
  const articleTagPairs: Array<{ articleId: number; tagSlug: string; isPrimary: boolean }> = [
    { articleId: article1.id, tagSlug: 'kristofer-nolan', isPrimary: true },
    { articleId: article1.id, tagSlug: 'nauchaya-fantastika', isPrimary: false },
    { articleId: article1.id, tagSlug: 'triller', isPrimary: false },
    { articleId: article1.id, tagSlug: 'premery', isPrimary: false },

    { articleId: article2.id, tagSlug: 'dyuna', isPrimary: true },
    { articleId: article2.id, tagSlug: 'denis-vilnyov', isPrimary: false },
    { articleId: article2.id, tagSlug: 'nauchaya-fantastika', isPrimary: false },
    { articleId: article2.id, tagSlug: 'drama', isPrimary: false },

    { articleId: article3.id, tagSlug: 'a24', isPrimary: true },
    { articleId: article3.id, tagSlug: 'boks-ofis', isPrimary: false },

    { articleId: article4.id, tagSlug: 'nauchaya-fantastika', isPrimary: true },
    { articleId: article4.id, tagSlug: 'kristofer-nolan', isPrimary: false },
    { articleId: article4.id, tagSlug: 'denis-vilnyov', isPrimary: false },
    { articleId: article4.id, tagSlug: 'interstellar', isPrimary: false },
    { articleId: article4.id, tagSlug: 'dyuna', isPrimary: false },

    { articleId: article5.id, tagSlug: 'drama', isPrimary: true },

    { articleId: article6.id, tagSlug: 'marvel', isPrimary: true },
    { articleId: article6.id, tagSlug: 'premery', isPrimary: false },

    { articleId: article8.id, tagSlug: 'anime', isPrimary: true },
    { articleId: article8.id, tagSlug: 'serial-nedeli', isPrimary: false },
  ];

  let tagLinksCreated = 0;
  for (const pair of articleTagPairs) {
    const tagId = tagMap[pair.tagSlug];
    if (!tagId) continue;
    await prisma.articleTag.upsert({
      where: { articleId_tagId: { articleId: pair.articleId, tagId } },
      update: {},
      create: {
        articleId: pair.articleId,
        tagId,
        isPrimary: pair.isPrimary,
      },
    });
    tagLinksCreated++;
  }
  console.log(`  ${tagLinksCreated} article-tag links seeded`);

  // Update tag article counts
  for (const t of tagsData) {
    const count = await prisma.articleTag.count({
      where: { tagId: tagMap[t.slug] },
    });
    await prisma.tag.update({
      where: { id: tagMap[t.slug] },
      data: { articleCount: count },
    });
  }
  console.log('  tag article counts updated');

  // ============================================================
  // Placeholder Comments
  // ============================================================
  // Only add comments to published articles that allow them
  const commentableArticles = [article1, article2, article4, article6];
  let commentCount = 0;

  for (const article of commentableArticles) {
    // Top-level comment from reader
    const c1 = await prisma.comment.upsert({
      where: { id: article.id * 100 + 1 },
      update: {},
      create: {
        id: article.id * 100 + 1,
        articleId: article.id,
        userId: readerUser.id,
        body: getCommentForArticle(article.slug, 1),
        status: 'visible',
      },
    });
    commentCount++;

    // Reply from editor
    await prisma.comment.upsert({
      where: { id: article.id * 100 + 2 },
      update: {},
      create: {
        id: article.id * 100 + 2,
        articleId: article.id,
        userId: article.authorId,
        parentId: c1.id,
        body: getCommentForArticle(article.slug, 2),
        status: 'visible',
      },
    });
    commentCount++;

    // Another top-level comment
    await prisma.comment.upsert({
      where: { id: article.id * 100 + 3 },
      update: {},
      create: {
        id: article.id * 100 + 3,
        articleId: article.id,
        userId: editorUser2.id,
        body: getCommentForArticle(article.slug, 3),
        status: 'visible',
      },
    });
    commentCount++;

    // Update article comment count
    await prisma.article.update({
      where: { id: article.id },
      data: { commentCount: 3 },
    });
  }
  console.log(`  ${commentCount} comments seeded across ${commentableArticles.length} articles`);

  // ============================================================
  // Collection
  // ============================================================
  const collection = await prisma.collection.upsert({
    where: { slug: 'luchshee-za-mesyats' },
    update: {},
    create: {
      slug: 'luchshee-za-mesyats',
      title: 'Лучшее за месяц',
      description: 'Самые популярные и обсуждаемые материалы',
      sortOrder: 0,
      isVisible: true,
    },
  });

  const collectionArticles = [article2, article4, article3];
  for (let i = 0; i < collectionArticles.length; i++) {
    await prisma.collectionArticle.upsert({
      where: {
        collectionId_articleId: {
          collectionId: collection.id,
          articleId: collectionArticles[i].id,
        },
      },
      update: {},
      create: {
        collectionId: collection.id,
        articleId: collectionArticles[i].id,
        sortOrder: i,
      },
    });
  }
  console.log(`  1 collection seeded with ${collectionArticles.length} articles`);

  console.log('\nSeed complete.');
}

function getCommentForArticle(slug: string, index: number): string {
  const comments: Record<string, string[]> = {
    'nolan-obyavil-novyj-film': [
      'Наконец-то! Жду не дождусь подробностей. Надеюсь, снова IMAX.',
      'Спасибо за интерес! Будем следить за новостями.',
      'Если это будет на уровне Интерстеллара или Начала — готов стоять в очереди за билетами.',
    ],
    'retsenziya-dyuna-chast-vtoraya': [
      'Согласен с оценкой. Визуально это лучшее, что я видел в кино за последние годы.',
      'Рады, что вам понравилось! Фильм действительно заслуживает большого экрана.',
      'Остин Батлер просто блестящий в роли Фейд-Рауты. Жаль, что его экранное время ограничено.',
    ],
    '10-luchshikh-nauchnoy-fantastiki': [
      'Добавил бы ещё «Район N9» и «Петлю времени». Но список отличный!',
      'Спасибо за предложения! Оба фильма достойны упоминания.',
      'Отсутствие «Матрицы» объяснимо рамками XXI века, но «Начало» Нолана точно заслуживает места.',
    ],
    'marvel-plany-na-2026': [
      'Сокращение количества — правильный шаг. Последние годы было слишком много проходных проектов.',
      'Согласны! Качество важнее количества.',
      'Главное, чтобы «Фантастическая четвёрка» получилась. Три предыдущие попытки были провальными.',
    ],
  };

  const articleComments = comments[slug] || [
    'Интересный материал, спасибо!',
    'Благодарим за отзыв!',
    'Буду ждать продолжения темы.',
  ];

  return articleComments[index - 1] || articleComments[0];
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
