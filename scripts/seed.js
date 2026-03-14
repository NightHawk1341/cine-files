const { getPool, closePool } = require('../lib/db');

async function main() {
  const pool = getPool();
  console.log('Seeding CineFiles database...');

  // ============================================================
  // Categories
  // ============================================================
  const categories = [
    { slug: 'news', name_ru: 'Новости', name_en: 'News', description: 'Новости кино, сериалов и индустрии развлечений', sort_order: 0 },
    { slug: 'reviews', name_ru: 'Рецензии', name_en: 'Reviews', description: 'Обзоры и рецензии на фильмы, сериалы и игры', sort_order: 1 },
    { slug: 'articles', name_ru: 'Статьи', name_en: 'Articles', description: 'Аналитические и авторские материалы', sort_order: 2 },
    { slug: 'interviews', name_ru: 'Интервью', name_en: 'Interviews', description: 'Интервью с деятелями кино и индустрии', sort_order: 3 },
    { slug: 'lists', name_ru: 'Подборки', name_en: 'Lists', description: 'Тематические подборки и топ-листы', sort_order: 4 },
    { slug: 'analysis', name_ru: 'Разборы', name_en: 'Analysis', description: 'Глубокие разборы фильмов, сериалов и трендов', sort_order: 5 },
  ];

  const categoryMap = {};
  for (const cat of categories) {
    const { rows } = await pool.query(
      `INSERT INTO categories (slug, name_ru, name_en, description, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET name_ru = $2
       RETURNING id`,
      [cat.slug, cat.name_ru, cat.name_en, cat.description, cat.sort_order]
    );
    categoryMap[cat.slug] = rows[0].id;
  }
  console.log(`  ${categories.length} categories seeded`);

  // ============================================================
  // App Settings
  // ============================================================
  const settings = [
    { key: 'site_name', value: { ru: 'CineFiles', en: 'CineFiles' } },
    { key: 'site_description', value: { ru: 'Кино, сериалы, обзоры и новости', en: 'Cinema, series, reviews and news' } },
    { key: 'articles_per_page', value: { default: 20 } },
    { key: 'comments_enabled', value: { default: true } },
    { key: 'featured_count', value: { default: 5 } },
  ];

  for (const s of settings) {
    await pool.query(
      `INSERT INTO app_settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [s.key, JSON.stringify(s.value)]
    );
  }
  console.log(`  ${settings.length} app settings seeded`);

  // ============================================================
  // Users
  // ============================================================
  const adminUser = await upsertUser(pool, {
    yandex_id: 'seed-admin-001', email: 'admin@cinefiles.dev',
    display_name: 'Администратор', login_method: 'yandex', role: 'admin',
  });
  const editorUser = await upsertUser(pool, {
    yandex_id: 'seed-editor-001', email: 'editor@cinefiles.dev',
    display_name: 'Редактор Иванов', login_method: 'yandex', role: 'editor',
  });
  const editorUser2 = await upsertUser(pool, {
    vk_id: 'seed-editor-002', email: 'editor2@cinefiles.dev',
    display_name: 'Мария Петрова', login_method: 'vk', role: 'editor',
  });
  const readerUser = await upsertUser(pool, {
    telegram_id: 'seed-reader-001', email: 'reader@cinefiles.dev',
    display_name: 'Читатель', login_method: 'telegram', role: 'reader',
  });
  console.log('  4 users seeded (admin, 2 editors, reader)');

  // ============================================================
  // Tags
  // ============================================================
  const tagsData = [
    { slug: 'kristofer-nolan', name_ru: 'Кристофер Нолан', name_en: 'Christopher Nolan', tag_type: 'person' },
    { slug: 'denis-vilnyov', name_ru: 'Дени Вильнёв', name_en: 'Denis Villeneuve', tag_type: 'person' },
    { slug: 'interstellar', name_ru: 'Интерстеллар', name_en: 'Interstellar', tag_type: 'movie' },
    { slug: 'dyuna', name_ru: 'Дюна', name_en: 'Dune', tag_type: 'franchise' },
    { slug: 'nauchaya-fantastika', name_ru: 'Научная фантастика', name_en: 'Sci-Fi', tag_type: 'genre' },
    { slug: 'drama', name_ru: 'Драма', name_en: 'Drama', tag_type: 'genre' },
    { slug: 'triller', name_ru: 'Триллер', name_en: 'Thriller', tag_type: 'genre' },
    { slug: 'komediya', name_ru: 'Комедия', name_en: 'Comedy', tag_type: 'genre' },
    { slug: 'marvel', name_ru: 'Marvel', name_en: 'Marvel', tag_type: 'franchise' },
    { slug: 'a24', name_ru: 'A24', name_en: 'A24', tag_type: 'studio' },
    { slug: 'serial-nedeli', name_ru: 'Сериал недели', name_en: 'Series of the week', tag_type: 'topic' },
    { slug: 'premery', name_ru: 'Премьеры', name_en: 'Premieres', tag_type: 'topic' },
    { slug: 'boks-ofis', name_ru: 'Бокс-офис', name_en: 'Box office', tag_type: 'topic' },
    { slug: 'anime', name_ru: 'Аниме', name_en: 'Anime', tag_type: 'anime' },
    { slug: 'igry', name_ru: 'Игры', name_en: 'Games', tag_type: 'game' },
  ];

  const tagMap = {};
  for (const t of tagsData) {
    const { rows } = await pool.query(
      `INSERT INTO tags (slug, name_ru, name_en, tag_type, article_count)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (slug) DO UPDATE SET name_ru = $2
       RETURNING id`,
      [t.slug, t.name_ru, t.name_en, t.tag_type]
    );
    tagMap[t.slug] = rows[0].id;
  }
  console.log(`  ${tagsData.length} tags seeded`);

  // ============================================================
  // Articles
  // ============================================================
  const hoursAgo = (h) => new Date(Date.now() - h * 3600000);

  const articlesData = [
    {
      slug: 'nolan-obyavil-novyj-film',
      category: 'news', author_id: editorUser.id,
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
        { type: 'list', style: 'unordered', items: ['Съёмки: лето 2026', 'Планируемая премьера: конец 2027', 'Прокатчик: Universal Pictures', 'Формат: IMAX 70mm'] },
        { type: 'divider' },
        { type: 'paragraph', text: 'Это будет второй совместный проект Нолана и Universal после оскароносного <b>Оппенгеймера</b>.' },
      ],
      status: 'published', published_at: hoursAgo(2),
      view_count: 1842, is_featured: true, is_pinned: true,
      tags: [{ slug: 'kristofer-nolan', primary: true }, { slug: 'nauchaya-fantastika' }, { slug: 'triller' }, { slug: 'premery' }],
    },
    {
      slug: 'retsenziya-dyuna-chast-vtoraya',
      category: 'reviews', author_id: editorUser2.id,
      title: 'Рецензия: «Дюна: Часть вторая» — масштаб, который меняет кино',
      subtitle: 'Дени Вильнёв создал эпос, достойный первоисточника',
      lead: '«Дюна: Часть вторая» — редкий пример сиквела, который превосходит оригинал.',
      body: [
        { type: 'paragraph', text: 'Второй фильм Дени Вильнёва по роману Фрэнка Герберта — это не просто продолжение. Это завершение истории, которая требовала именно такого масштаба.' },
        { type: 'heading', level: 2, text: 'Визуальное совершенство' },
        { type: 'paragraph', text: 'Грегг Фрейзер создал одни из самых запоминающихся кадров в истории научной фантастики.' },
        { type: 'infobox', title: 'Технические данные', blocks: [
          { type: 'list', style: 'unordered', items: ['Режиссёр: Дени Вильнёв', 'Оператор: Грегг Фрейзер', 'Хронометраж: 166 минут', 'Бюджет: $190 млн'] },
        ] },
        { type: 'heading', level: 2, text: 'Вердикт' },
        { type: 'paragraph', text: '<b>9 из 10</b>. Один из лучших научно-фантастических фильмов десятилетия.' },
      ],
      status: 'published', published_at: hoursAgo(12),
      view_count: 3205, is_featured: true,
      tags: [{ slug: 'dyuna', primary: true }, { slug: 'denis-vilnyov' }, { slug: 'nauchaya-fantastika' }, { slug: 'drama' }],
    },
    {
      slug: 'pochemu-a24-menyaet-industriyu',
      category: 'analysis', author_id: editorUser.id,
      title: 'Почему A24 меняет киноиндустрию: разбор бизнес-модели студии',
      lead: 'A24 стала одной из самых влиятельных студий Голливуда.',
      body: [
        { type: 'paragraph', text: 'За последнее десятилетие A24 превратилась из маленького дистрибьютора в одну из самых узнаваемых студий в мире.' },
        { type: 'heading', level: 2, text: 'Модель низких бюджетов' },
        { type: 'paragraph', text: 'Средний бюджет фильма A24 составляет $10-15 млн — это в 10-20 раз меньше, чем у типичного блокбастера.' },
        { type: 'list', style: 'ordered', items: [
          '«Всё везде и сразу» — бюджет $25 млн, сборы $140 млн + 7 Оскаров',
          '«Лунный свет» — бюджет $4 млн, сборы $65 млн + Оскар за лучший фильм',
        ] },
        { type: 'spoiler', title: 'Примеры нестандартного маркетинга A24', blocks: [
          { type: 'list', style: 'unordered', items: ['Продажа камня из фильма за $1', 'Pop-up магазины тематического мерча'] },
        ] },
      ],
      status: 'published', published_at: hoursAgo(36),
      view_count: 2100, is_featured: true,
      tags: [{ slug: 'a24', primary: true }, { slug: 'boks-ofis' }],
    },
    {
      slug: '10-luchshikh-nauchnoy-fantastiki',
      category: 'lists', author_id: editorUser2.id,
      title: '10 лучших научно-фантастических фильмов XXI века',
      lead: 'От «Интерстеллара» до «Прибытия» — фильмы, которые переопределили жанр.',
      body: [
        { type: 'paragraph', text: 'Научная фантастика в XXI веке переживает ренессанс.' },
        { type: 'heading', level: 2, text: '1. Интерстеллар (2014)' },
        { type: 'paragraph', text: 'Кристофер Нолан создал фильм, в котором научная точность служит эмоциональной истории.' },
        { type: 'heading', level: 2, text: '2. Прибытие (2016)' },
        { type: 'paragraph', text: 'Дени Вильнёв адаптировал рассказ Теда Чана и сделал лингвистику центром сюжета.' },
        { type: 'list', style: 'ordered', items: ['Марсианин (2015)', 'Аннигиляция (2018)', 'Луна 2112 (2009)', 'Дюна (2021)', 'Всё везде и сразу (2022)'] },
        { type: 'paragraph', text: 'Какие фильмы вы бы добавили в этот список? Делитесь в комментариях.' },
      ],
      status: 'published', published_at: hoursAgo(48),
      view_count: 5430,
      tags: [{ slug: 'nauchaya-fantastika', primary: true }, { slug: 'kristofer-nolan' }, { slug: 'denis-vilnyov' }, { slug: 'interstellar' }, { slug: 'dyuna' }],
    },
    {
      slug: 'intervyu-molodoj-rezhissyor-o-debyute',
      category: 'interviews', author_id: editorUser.id,
      title: 'Интервью: «Мой дебют снят за три миллиона — и это свобода»',
      subtitle: 'Молодой режиссёр Алексей Громов о независимом кино в России',
      lead: 'Режиссёр Алексей Громов рассказывает о своём дебютном фильме.',
      body: [
        { type: 'paragraph', text: 'Мы встретились с Алексеем Громовым после премьеры его дебютного фильма «Тишина между нами» на фестивале «Кинотавр».' },
        { type: 'heading', level: 2, text: 'О начале пути' },
        { type: 'quote', text: 'Я снимал короткометражки на телефон, пока учился в университете.', author: 'Алексей Громов' },
        { type: 'heading', level: 2, text: 'О бюджете и компромиссах' },
        { type: 'quote', text: 'Три миллиона рублей — это не ограничение, это свобода.', author: 'Алексей Громов' },
        { type: 'infobox', title: 'Фильмография', blocks: [
          { type: 'list', style: 'unordered', items: ['«Тишина между нами» (2025)', '«Окно» (2023) — короткий метр', '«Последняя остановка» (2022) — короткий метр'] },
        ] },
      ],
      status: 'published', published_at: hoursAgo(72),
      view_count: 980,
      tags: [{ slug: 'drama', primary: true }],
    },
    {
      slug: 'marvel-plany-na-2026',
      category: 'news', author_id: editorUser2.id,
      title: 'Marvel представила расписание фильмов на 2026-2027 годы',
      lead: 'Студия анонсировала пять новых проектов в рамках обновлённой стратегии MCU.',
      body: [
        { type: 'paragraph', text: 'На презентации Disney Upfront студия Marvel представила обновлённое расписание.' },
        { type: 'heading', level: 2, text: 'Подтверждённые проекты' },
        { type: 'list', style: 'ordered', items: ['«Мстители: Канг-династия» — перенесён на 2027', '«Человек-паук 4»', '«Росомаха»', '«Фантастическая четвёрка»', '«Шан-Чи 2»'] },
        { type: 'quote', text: 'Мы услышали наших зрителей. Качество всегда было нашим приоритетом.', author: 'Кевин Файги', source: 'Disney Upfront 2025' },
      ],
      status: 'published', published_at: hoursAgo(6),
      view_count: 4150, is_featured: true,
      tags: [{ slug: 'marvel', primary: true }, { slug: 'premery' }],
    },
    {
      slug: 'chernovik-obzor-seriala',
      category: 'reviews', author_id: editorUser.id,
      title: 'Обзор нового сериала (черновик)',
      lead: 'Рабочий черновик для тестирования статуса draft.',
      body: [
        { type: 'paragraph', text: 'Это черновик статьи, который не должен отображаться на публичных страницах сайта.' },
      ],
      status: 'draft', view_count: 0, tags: [],
    },
    {
      slug: 'anime-vesna-2026-obzor',
      category: 'articles', author_id: editorUser2.id,
      title: 'Аниме весеннего сезона 2026: что смотреть',
      lead: 'Обзор самых ожидаемых аниме-сериалов весны 2026.',
      body: [
        { type: 'paragraph', text: 'Весенний сезон 2026 года обещает быть насыщенным.' },
        { type: 'heading', level: 2, text: 'Продолжения' },
        { type: 'paragraph', text: 'Фанаты ждут новые сезоны нескольких популярных тайтлов.' },
      ],
      status: 'review', view_count: 0,
      tags: [{ slug: 'anime', primary: true }, { slug: 'serial-nedeli' }],
    },
  ];

  const articleMap = {};
  for (const a of articlesData) {
    const catId = categoryMap[a.category];
    const { rows } = await pool.query(
      `INSERT INTO articles (slug, category_id, author_id, title, subtitle, lead, body, status, published_at, view_count, comment_count, is_featured, is_pinned, allow_comments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, true)
       ON CONFLICT (slug) DO UPDATE SET title = $4
       RETURNING id`,
      [a.slug, catId, a.author_id, a.title, a.subtitle || null, a.lead || null,
       JSON.stringify(a.body), a.status, a.published_at || null,
       a.view_count || 0, a.is_featured || false, a.is_pinned || false]
    );
    articleMap[a.slug] = rows[0].id;

    // Tags
    if (a.tags && a.tags.length > 0) {
      for (const t of a.tags) {
        const tagId = tagMap[t.slug];
        if (!tagId) continue;
        await pool.query(
          `INSERT INTO article_tags (article_id, tag_id, is_primary)
           VALUES ($1, $2, $3)
           ON CONFLICT (article_id, tag_id) DO NOTHING`,
          [rows[0].id, tagId, t.primary || false]
        );
      }
    }
  }
  console.log(`  ${articlesData.length} articles seeded (6 published, 1 draft, 1 in review)`);

  // Update tag article counts
  for (const t of tagsData) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM article_tags WHERE tag_id = $1`,
      [tagMap[t.slug]]
    );
    await pool.query(
      `UPDATE tags SET article_count = $1 WHERE id = $2`,
      [rows[0].cnt, tagMap[t.slug]]
    );
  }
  console.log('  tag article counts updated');

  // ============================================================
  // Comments
  // ============================================================
  const commentArticles = ['nolan-obyavil-novyj-film', 'retsenziya-dyuna-chast-vtoraya', '10-luchshikh-nauchnoy-fantastiki', 'marvel-plany-na-2026'];
  const commentTexts = {
    'nolan-obyavil-novyj-film': [
      'Наконец-то! Жду не дождусь подробностей. Надеюсь, снова IMAX.',
      'Спасибо за интерес! Будем следить за новостями.',
      'Если это будет на уровне Интерстеллара — готов стоять в очереди за билетами.',
    ],
    'retsenziya-dyuna-chast-vtoraya': [
      'Согласен с оценкой. Визуально лучшее за последние годы.',
      'Рады, что вам понравилось!',
      'Остин Батлер просто блестящий в роли Фейд-Рауты.',
    ],
    '10-luchshikh-nauchnoy-fantastiki': [
      'Добавил бы ещё «Район N9» и «Петлю времени». Но список отличный!',
      'Спасибо за предложения!',
      'Отсутствие «Матрицы» объяснимо рамками XXI века, но «Начало» заслуживает места.',
    ],
    'marvel-plany-na-2026': [
      'Сокращение количества — правильный шаг.',
      'Согласны! Качество важнее количества.',
      'Главное, чтобы «Фантастическая четвёрка» получилась.',
    ],
  };

  let commentCount = 0;
  for (const slug of commentArticles) {
    const articleId = articleMap[slug];
    const texts = commentTexts[slug];
    // Find the article's author for the reply
    const articleData = articlesData.find(a => a.slug === slug);

    // Top-level comment from reader
    const { rows: c1Rows } = await pool.query(
      `INSERT INTO comments (article_id, user_id, body, status)
       VALUES ($1, $2, $3, 'visible')
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [articleId, readerUser.id, texts[0]]
    );
    commentCount++;

    // Reply from article author
    if (c1Rows[0]) {
      await pool.query(
        `INSERT INTO comments (article_id, user_id, parent_id, body, status)
         VALUES ($1, $2, $3, $4, 'visible')`,
        [articleId, articleData.author_id, c1Rows[0].id, texts[1]]
      );
      commentCount++;
    }

    // Another top-level comment
    await pool.query(
      `INSERT INTO comments (article_id, user_id, body, status)
       VALUES ($1, $2, $3, 'visible')`,
      [articleId, editorUser2.id, texts[2]]
    );
    commentCount++;

    // Update article comment count
    await pool.query(
      `UPDATE articles SET comment_count = 3 WHERE id = $1`,
      [articleId]
    );
  }
  console.log(`  ${commentCount} comments seeded`);

  // ============================================================
  // Collection
  // ============================================================
  const { rows: collRows } = await pool.query(
    `INSERT INTO collections (slug, title, description, sort_order, is_visible)
     VALUES ('luchshee-za-mesyats', 'Лучшее за месяц', 'Самые популярные и обсуждаемые материалы', 0, true)
     ON CONFLICT (slug) DO UPDATE SET title = 'Лучшее за месяц'
     RETURNING id`
  );
  const collectionId = collRows[0].id;

  const collArticleSlugs = ['retsenziya-dyuna-chast-vtoraya', '10-luchshikh-nauchnoy-fantastiki', 'pochemu-a24-menyaet-industriyu'];
  for (let i = 0; i < collArticleSlugs.length; i++) {
    await pool.query(
      `INSERT INTO collection_articles (collection_id, article_id, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (collection_id, article_id) DO NOTHING`,
      [collectionId, articleMap[collArticleSlugs[i]], i]
    );
  }
  console.log(`  1 collection seeded with ${collArticleSlugs.length} articles`);

  console.log('\nSeed complete.');
}

async function upsertUser(pool, data) {
  const idField = data.yandex_id ? 'yandex_id' : data.vk_id ? 'vk_id' : 'telegram_id';
  const idValue = data[idField];

  const { rows } = await pool.query(
    `INSERT INTO users (${idField}, email, display_name, login_method, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (${idField}) DO UPDATE SET display_name = $3
     RETURNING id`,
    [idValue, data.email, data.display_name, data.login_method, data.role]
  );
  return { id: rows[0].id };
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
