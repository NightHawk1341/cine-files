/**
 * Placeholder data for CineFiles pages.
 * Renders fallback content when the API is unavailable (no DB, network error, etc.).
 * This lets all pages display meaningful content during development and demos.
 */

var Placeholders = (function () {
  var articles = [
    {
      id: 1, slug: 'nolan-obyavil-novyj-film', category_slug: 'news',
      title: 'Кристофер Нолан объявил о новом фильме: съёмки начнутся в 2026 году',
      lead: 'Кристофер Нолан подтвердил, что его следующий фильм будет основан на оригинальном сценарии. Съёмки запланированы на лето 2026 года.',
      author_name: 'Редактор Иванов', published_at: '2026-03-14T10:00:00Z',
      view_count: 1842, comment_count: 3, is_featured: true,
      category_name_ru: 'Новости',
      tags: [
        { slug: 'kristofer-nolan', name_ru: 'Кристофер Нолан' },
        { slug: 'nauchaya-fantastika', name_ru: 'Научная фантастика' },
      ],
    },
    {
      id: 2, slug: 'retsenziya-dyuna-chast-vtoraya', category_slug: 'reviews',
      title: 'Рецензия: «Дюна: Часть вторая» — масштаб, который меняет кино',
      lead: '«Дюна: Часть вторая» — редкий пример сиквела, который превосходит оригинал.',
      author_name: 'Мария Петрова', published_at: '2026-03-13T14:00:00Z',
      view_count: 3205, comment_count: 3, is_featured: true,
      category_name_ru: 'Рецензии',
      tags: [
        { slug: 'dyuna', name_ru: 'Дюна' },
        { slug: 'denis-vilnyov', name_ru: 'Дени Вильнёв' },
      ],
    },
    {
      id: 3, slug: 'pochemu-a24-menyaet-industriyu', category_slug: 'analysis',
      title: 'Почему A24 меняет киноиндустрию: разбор бизнес-модели студии',
      lead: 'A24 стала одной из самых влиятельных студий Голливуда. Разбираем, как им это удалось.',
      author_name: 'Редактор Иванов', published_at: '2026-03-12T12:00:00Z',
      view_count: 2100, comment_count: 0, is_featured: true,
      category_name_ru: 'Разборы',
      tags: [
        { slug: 'a24', name_ru: 'A24' },
        { slug: 'boks-ofis', name_ru: 'Бокс-офис' },
      ],
    },
    {
      id: 4, slug: 'marvel-plany-na-2026', category_slug: 'news',
      title: 'Marvel представила расписание фильмов на 2026-2027 годы',
      lead: 'Студия анонсировала пять новых проектов в рамках обновлённой стратегии MCU.',
      author_name: 'Мария Петрова', published_at: '2026-03-14T06:00:00Z',
      view_count: 4150, comment_count: 3, is_featured: true,
      category_name_ru: 'Новости',
      tags: [
        { slug: 'marvel', name_ru: 'Marvel' },
        { slug: 'premery', name_ru: 'Премьеры' },
      ],
    },
    {
      id: 5, slug: '10-luchshikh-nauchnoy-fantastiki', category_slug: 'lists',
      title: '10 лучших научно-фантастических фильмов XXI века',
      lead: 'От «Интерстеллара» до «Прибытия» — фильмы, которые переопределили жанр.',
      author_name: 'Мария Петрова', published_at: '2026-03-12T00:00:00Z',
      view_count: 5430, comment_count: 3,
      category_name_ru: 'Подборки',
      tags: [
        { slug: 'nauchaya-fantastika', name_ru: 'Научная фантастика' },
        { slug: 'kristofer-nolan', name_ru: 'Кристофер Нолан' },
      ],
    },
    {
      id: 6, slug: 'intervyu-molodoj-rezhissyor-o-debyute', category_slug: 'interviews',
      title: 'Интервью: «Мой дебют снят за три миллиона — и это свобода»',
      lead: 'Режиссёр Алексей Громов рассказывает о своём дебютном фильме и независимом кино в России.',
      author_name: 'Редактор Иванов', published_at: '2026-03-11T00:00:00Z',
      view_count: 980, comment_count: 0,
      category_name_ru: 'Интервью',
      tags: [
        { slug: 'drama', name_ru: 'Драма' },
      ],
    },
    {
      id: 7, slug: 'anime-vesna-2026-obzor', category_slug: 'articles',
      title: 'Аниме весеннего сезона 2026: что смотреть',
      lead: 'Обзор самых ожидаемых аниме-сериалов весны 2026 года.',
      author_name: 'Мария Петрова', published_at: '2026-03-10T00:00:00Z',
      view_count: 1560, comment_count: 0,
      category_name_ru: 'Статьи',
      tags: [
        { slug: 'anime', name_ru: 'Аниме' },
        { slug: 'serial-nedeli', name_ru: 'Сериал недели' },
      ],
    },
    {
      id: 8, slug: 'oppenheimer-razgovor-s-kinovedami', category_slug: 'analysis',
      title: 'Оппенгеймер: как Нолан переосмыслил байопик',
      lead: 'Разбираем структуру и киноязык фильма, собравшего 7 Оскаров.',
      author_name: 'Редактор Иванов', published_at: '2026-03-09T00:00:00Z',
      view_count: 2870, comment_count: 0,
      category_name_ru: 'Разборы',
      tags: [
        { slug: 'kristofer-nolan', name_ru: 'Кристофер Нолан' },
        { slug: 'drama', name_ru: 'Драма' },
      ],
    },
    {
      id: 9, slug: 'kinofestivali-2026-raspisanie', category_slug: 'news',
      title: 'Кинофестивали 2026: расписание и ожидания',
      lead: 'Канны, Венеция, Берлинале — что покажут главные фестивали в этом году.',
      author_name: 'Мария Петрова', published_at: '2026-03-08T00:00:00Z',
      view_count: 1230, comment_count: 0,
      category_name_ru: 'Новости',
      tags: [
        { slug: 'premery', name_ru: 'Премьеры' },
      ],
    },
  ];

  var tags = [
    { slug: 'kristofer-nolan', name_ru: 'Кристофер Нолан', tag_type: 'person', article_count: 3 },
    { slug: 'denis-vilnyov', name_ru: 'Дени Вильнёв', tag_type: 'person', article_count: 2 },
    { slug: 'nauchaya-fantastika', name_ru: 'Научная фантастика', tag_type: 'genre', article_count: 3 },
    { slug: 'dyuna', name_ru: 'Дюна', tag_type: 'franchise', article_count: 2 },
    { slug: 'drama', name_ru: 'Драма', tag_type: 'genre', article_count: 2 },
    { slug: 'triller', name_ru: 'Триллер', tag_type: 'genre', article_count: 1 },
    { slug: 'marvel', name_ru: 'Marvel', tag_type: 'franchise', article_count: 1 },
    { slug: 'a24', name_ru: 'A24', tag_type: 'studio', article_count: 1 },
    { slug: 'premery', name_ru: 'Премьеры', tag_type: 'topic', article_count: 2 },
    { slug: 'boks-ofis', name_ru: 'Бокс-офис', tag_type: 'topic', article_count: 1 },
    { slug: 'anime', name_ru: 'Аниме', tag_type: 'anime', article_count: 1 },
    { slug: 'igry', name_ru: 'Игры', tag_type: 'game', article_count: 0 },
    { slug: 'serial-nedeli', name_ru: 'Сериал недели', tag_type: 'topic', article_count: 1 },
    { slug: 'komediya', name_ru: 'Комедия', tag_type: 'genre', article_count: 0 },
    { slug: 'interstellar', name_ru: 'Интерстеллар', tag_type: 'movie', article_count: 1 },
  ];

  var categories = [
    { slug: 'news', name_ru: 'Новости', name_en: 'News', description: 'Новости кино, сериалов и индустрии развлечений' },
    { slug: 'reviews', name_ru: 'Рецензии', name_en: 'Reviews', description: 'Обзоры и рецензии на фильмы, сериалы и игры' },
    { slug: 'articles', name_ru: 'Статьи', name_en: 'Articles', description: 'Аналитические и авторские материалы' },
    { slug: 'interviews', name_ru: 'Интервью', name_en: 'Interviews', description: 'Интервью с деятелями кино и индустрии' },
    { slug: 'lists', name_ru: 'Подборки', name_en: 'Lists', description: 'Тематические подборки и топ-листы' },
    { slug: 'analysis', name_ru: 'Разборы', name_en: 'Analysis', description: 'Глубокие разборы фильмов, сериалов и трендов' },
  ];

  // Placeholder article body for article detail pages
  var articleBodies = {
    'nolan-obyavil-novyj-film': [
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
    'retsenziya-dyuna-chast-vtoraya': [
      { type: 'paragraph', text: 'Второй фильм Дени Вильнёва по роману Фрэнка Герберта — это не просто продолжение. Это завершение истории, которая требовала именно такого масштаба.' },
      { type: 'heading', level: 2, text: 'Визуальное совершенство' },
      { type: 'paragraph', text: 'Грегг Фрейзер создал одни из самых запоминающихся кадров в истории научной фантастики. Сцены на Арракисе, снятые в естественном свете пустыни, выглядят как ожившие полотна.' },
      { type: 'infobox', title: 'Технические данные', blocks: [
        { type: 'list', style: 'unordered', items: ['Режиссёр: Дени Вильнёв', 'Оператор: Грегг Фрейзер', 'Хронометраж: 166 минут', 'Бюджет: $190 млн'] },
      ] },
      { type: 'heading', level: 2, text: 'Вердикт' },
      { type: 'paragraph', text: '<b>9 из 10</b>. Один из лучших научно-фантастических фильмов десятилетия.' },
    ],
  };

  function getArticles() {
    return articles;
  }

  function getFeatured() {
    return articles.filter(function (a) { return a.is_featured; });
  }

  function getByCategory(categorySlug) {
    return articles.filter(function (a) { return a.category_slug === categorySlug; });
  }

  function getBySlug(slug) {
    var article = null;
    for (var i = 0; i < articles.length; i++) {
      if (articles[i].slug === slug) {
        article = Object.assign({}, articles[i]);
        break;
      }
    }
    if (article && articleBodies[slug]) {
      article.content_blocks = articleBodies[slug];
    }
    return article;
  }

  function getByTag(tagSlug) {
    return articles.filter(function (a) {
      return a.tags && a.tags.some(function (t) { return t.slug === tagSlug; });
    });
  }

  function getTags() {
    return tags;
  }

  function getTag(slug) {
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].slug === slug) return tags[i];
    }
    return null;
  }

  function getCategories() {
    return categories;
  }

  function getCategoryName(slug) {
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].slug === slug) return categories[i].name_ru;
    }
    // Capitalize first letter as fallback
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  }

  return {
    getArticles: getArticles,
    getFeatured: getFeatured,
    getByCategory: getByCategory,
    getBySlug: getBySlug,
    getByTag: getByTag,
    getTags: getTags,
    getTag: getTag,
    getCategories: getCategories,
    getCategoryName: getCategoryName,
  };
})();
