-- ============================================================
-- CineFiles Seed Data
-- Run manually via Supabase SQL editor
-- Requires: at least one user with role 'editor' or 'admin'
-- ============================================================

-- ============================================================
-- CATEGORIES
-- ============================================================

INSERT INTO "categories" ("slug", "name_ru", "name_en", "description", "sort_order") VALUES
  ('news',       'Новости',   'News',       'Новости кино, сериалов и индустрии развлечений',     1),
  ('reviews',    'Рецензии',  'Reviews',    'Обзоры и рецензии на фильмы, сериалы и игры',        2),
  ('articles',   'Статьи',    'Articles',   'Аналитические и авторские материалы',                3),
  ('interviews', 'Интервью',  'Interviews', 'Интервью с деятелями кино и индустрии',              4),
  ('lists',      'Подборки',  'Lists',      'Тематические подборки и топ-листы',                  5),
  ('analysis',   'Разборы',   'Analysis',   'Глубокие разборы фильмов, сериалов и трендов',       6)
ON CONFLICT ("slug") DO NOTHING;

-- ============================================================
-- TAGS
-- ============================================================

INSERT INTO "tags" ("slug", "name_ru", "tag_type", "article_count") VALUES
  ('kristofer-nolan',      'Кристофер Нолан',      'person',    3),
  ('denis-vilnyov',        'Дени Вильнёв',         'person',    2),
  ('nauchaya-fantastika',  'Научная фантастика',    'genre',     3),
  ('dyuna',                'Дюна',                  'franchise', 2),
  ('drama',                'Драма',                 'genre',     2),
  ('triller',              'Триллер',               'genre',     1),
  ('marvel',               'Marvel',                'franchise', 1),
  ('a24',                  'A24',                   'studio',    1),
  ('premery',              'Премьеры',              'topic',     2),
  ('boks-ofis',            'Бокс-офис',             'topic',     1),
  ('anime',                'Аниме',                 'anime',     1),
  ('igry',                 'Игры',                  'game',      0),
  ('serial-nedeli',        'Сериал недели',         'topic',     1),
  ('komediya',             'Комедия',               'genre',     0),
  ('interstellar',         'Интерстеллар',          'movie',     1)
ON CONFLICT ("slug") DO NOTHING;

-- ============================================================
-- ARTICLES
-- Replace 1 with your actual author user ID
-- ============================================================

INSERT INTO "articles" ("slug", "category_id", "author_id", "title", "lead", "body", "status", "published_at", "view_count", "comment_count", "is_featured") VALUES
  (
    'nolan-obyavil-novyj-film',
    (SELECT id FROM categories WHERE slug = 'news'),
    1,
    'Кристофер Нолан объявил о новом фильме: съёмки начнутся в 2026 году',
    'Кристофер Нолан подтвердил, что его следующий фильм будет основан на оригинальном сценарии. Съёмки запланированы на лето 2026 года.',
    '[{"type":"paragraph","text":"Кристофер Нолан, режиссёр таких фильмов как <b>Интерстеллар</b>, <b>Начало</b> и <b>Оппенгеймер</b>, подтвердил, что его следующий проект будет полностью оригинальным."},{"type":"heading","level":2,"text":"Что известно о проекте"},{"type":"paragraph","text":"По словам источников, близких к производству, фильм будет сочетать элементы научной фантастики и триллера. Бюджет проекта оценивается в $200 млн."},{"type":"quote","text":"Я всегда возвращаюсь к историям, которые невозможно рассказать в другом формате. Кино остаётся уникальным медиумом.","author":"Кристофер Нолан","source":"Интервью для Variety"},{"type":"paragraph","text":"Каст пока не объявлен, но по слухам, студия ведёт переговоры с несколькими звёздами первого эшелона."},{"type":"heading","level":3,"text":"Сроки и прокат"},{"type":"list","style":"unordered","items":["Съёмки: лето 2026","Планируемая премьера: конец 2027","Прокатчик: Universal Pictures","Формат: IMAX 70mm"]},{"type":"divider"},{"type":"paragraph","text":"Это будет второй совместный проект Нолана и Universal после оскароносного <b>Оппенгеймера</b>."}]',
    'published', '2026-03-14T10:00:00Z', 1842, 3, TRUE
  ),
  (
    'retsenziya-dyuna-chast-vtoraya',
    (SELECT id FROM categories WHERE slug = 'reviews'),
    1,
    'Рецензия: «Дюна: Часть вторая» — масштаб, который меняет кино',
    '«Дюна: Часть вторая» — редкий пример сиквела, который превосходит оригинал.',
    '[{"type":"paragraph","text":"Второй фильм Дени Вильнёва по роману Фрэнка Герберта — это не просто продолжение. Это завершение истории, которая требовала именно такого масштаба."},{"type":"heading","level":2,"text":"Визуальное совершенство"},{"type":"paragraph","text":"Грегг Фрейзер создал одни из самых запоминающихся кадров в истории научной фантастики. Сцены на Арракисе, снятые в естественном свете пустыни, выглядят как ожившие полотна."},{"type":"infobox","title":"Технические данные","blocks":[{"type":"list","style":"unordered","items":["Режиссёр: Дени Вильнёв","Оператор: Грегг Фрейзер","Хронометраж: 166 минут","Бюджет: $190 млн"]}]},{"type":"heading","level":2,"text":"Вердикт"},{"type":"paragraph","text":"<b>9 из 10</b>. Один из лучших научно-фантастических фильмов десятилетия."}]',
    'published', '2026-03-13T14:00:00Z', 3205, 3, TRUE
  ),
  (
    'pochemu-a24-menyaet-industriyu',
    (SELECT id FROM categories WHERE slug = 'analysis'),
    1,
    'Почему A24 меняет киноиндустрию: разбор бизнес-модели студии',
    'A24 стала одной из самых влиятельных студий Голливуда. Разбираем, как им это удалось.',
    '[]',
    'published', '2026-03-12T12:00:00Z', 2100, 0, TRUE
  ),
  (
    'marvel-plany-na-2026',
    (SELECT id FROM categories WHERE slug = 'news'),
    1,
    'Marvel представила расписание фильмов на 2026-2027 годы',
    'Студия анонсировала пять новых проектов в рамках обновлённой стратегии MCU.',
    '[]',
    'published', '2026-03-14T06:00:00Z', 4150, 3, TRUE
  ),
  (
    '10-luchshikh-nauchnoy-fantastiki',
    (SELECT id FROM categories WHERE slug = 'lists'),
    1,
    '10 лучших научно-фантастических фильмов XXI века',
    'От «Интерстеллара» до «Прибытия» — фильмы, которые переопределили жанр.',
    '[]',
    'published', '2026-03-12T00:00:00Z', 5430, 3, FALSE
  ),
  (
    'intervyu-molodoj-rezhissyor-o-debyute',
    (SELECT id FROM categories WHERE slug = 'interviews'),
    1,
    'Интервью: «Мой дебют снят за три миллиона — и это свобода»',
    'Режиссёр Алексей Громов рассказывает о своём дебютном фильме и независимом кино в России.',
    '[]',
    'published', '2026-03-11T00:00:00Z', 980, 0, FALSE
  ),
  (
    'anime-vesna-2026-obzor',
    (SELECT id FROM categories WHERE slug = 'articles'),
    1,
    'Аниме весеннего сезона 2026: что смотреть',
    'Обзор самых ожидаемых аниме-сериалов весны 2026 года.',
    '[]',
    'published', '2026-03-10T00:00:00Z', 1560, 0, FALSE
  ),
  (
    'oppenheimer-razgovor-s-kinovedami',
    (SELECT id FROM categories WHERE slug = 'analysis'),
    1,
    'Оппенгеймер: как Нолан переосмыслил байопик',
    'Разбираем структуру и киноязык фильма, собравшего 7 Оскаров.',
    '[]',
    'published', '2026-03-09T00:00:00Z', 2870, 0, FALSE
  ),
  (
    'kinofestivali-2026-raspisanie',
    (SELECT id FROM categories WHERE slug = 'news'),
    1,
    'Кинофестивали 2026: расписание и ожидания',
    'Канны, Венеция, Берлинале — что покажут главные фестивали в этом году.',
    '[]',
    'published', '2026-03-08T00:00:00Z', 1230, 0, FALSE
  )
ON CONFLICT ("slug") DO NOTHING;

-- ============================================================
-- ARTICLE-TAG ASSOCIATIONS
-- ============================================================

INSERT INTO "article_tags" ("article_id", "tag_id") VALUES
  ((SELECT id FROM articles WHERE slug = 'nolan-obyavil-novyj-film'),         (SELECT id FROM tags WHERE slug = 'kristofer-nolan')),
  ((SELECT id FROM articles WHERE slug = 'nolan-obyavil-novyj-film'),         (SELECT id FROM tags WHERE slug = 'nauchaya-fantastika')),
  ((SELECT id FROM articles WHERE slug = 'retsenziya-dyuna-chast-vtoraya'),   (SELECT id FROM tags WHERE slug = 'dyuna')),
  ((SELECT id FROM articles WHERE slug = 'retsenziya-dyuna-chast-vtoraya'),   (SELECT id FROM tags WHERE slug = 'denis-vilnyov')),
  ((SELECT id FROM articles WHERE slug = 'pochemu-a24-menyaet-industriyu'),   (SELECT id FROM tags WHERE slug = 'a24')),
  ((SELECT id FROM articles WHERE slug = 'pochemu-a24-menyaet-industriyu'),   (SELECT id FROM tags WHERE slug = 'boks-ofis')),
  ((SELECT id FROM articles WHERE slug = 'marvel-plany-na-2026'),             (SELECT id FROM tags WHERE slug = 'marvel')),
  ((SELECT id FROM articles WHERE slug = 'marvel-plany-na-2026'),             (SELECT id FROM tags WHERE slug = 'premery')),
  ((SELECT id FROM articles WHERE slug = '10-luchshikh-nauchnoy-fantastiki'), (SELECT id FROM tags WHERE slug = 'nauchaya-fantastika')),
  ((SELECT id FROM articles WHERE slug = '10-luchshikh-nauchnoy-fantastiki'), (SELECT id FROM tags WHERE slug = 'kristofer-nolan')),
  ((SELECT id FROM articles WHERE slug = 'intervyu-molodoj-rezhissyor-o-debyute'), (SELECT id FROM tags WHERE slug = 'drama')),
  ((SELECT id FROM articles WHERE slug = 'anime-vesna-2026-obzor'),           (SELECT id FROM tags WHERE slug = 'anime')),
  ((SELECT id FROM articles WHERE slug = 'anime-vesna-2026-obzor'),           (SELECT id FROM tags WHERE slug = 'serial-nedeli')),
  ((SELECT id FROM articles WHERE slug = 'oppenheimer-razgovor-s-kinovedami'), (SELECT id FROM tags WHERE slug = 'kristofer-nolan')),
  ((SELECT id FROM articles WHERE slug = 'oppenheimer-razgovor-s-kinovedami'), (SELECT id FROM tags WHERE slug = 'drama')),
  ((SELECT id FROM articles WHERE slug = 'kinofestivali-2026-raspisanie'),     (SELECT id FROM tags WHERE slug = 'premery'))
ON CONFLICT DO NOTHING;
