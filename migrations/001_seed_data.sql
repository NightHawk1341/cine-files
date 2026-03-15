-- ============================================================
-- CineFiles Seed Data
-- Run manually via Supabase SQL editor
-- Creates a placeholder admin user if none exists.
-- After first Telegram login, update the placeholder with your
-- real telegram_id:
--   UPDATE users SET telegram_id = 'YOUR_ID'
--     WHERE display_name = 'Admin' AND telegram_id IS NULL;
-- ============================================================

-- ============================================================
-- ADMIN USER (placeholder — update telegram_id after first login)
-- ============================================================

INSERT INTO "users" ("telegram_id", "display_name", "login_method", "role", "created_at")
SELECT NULL, 'Admin', 'telegram', 'admin', NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role IN ('admin', 'editor'));


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

INSERT INTO "tags" ("slug", "name_ru", "tag_type") VALUES
  ('kristofer-nolan',      'Кристофер Нолан',      'person'),
  ('denis-vilnyov',        'Дени Вильнёв',         'person'),
  ('nauchaya-fantastika',  'Научная фантастика',   'genre'),
  ('dyuna',                'Дюна',                 'franchise'),
  ('drama',                'Драма',                'genre'),
  ('triller',              'Триллер',              'genre'),
  ('marvel',               'Marvel',               'franchise'),
  ('a24',                  'A24',                  'studio'),
  ('premery',              'Премьеры',             'topic'),
  ('boks-ofis',            'Бокс-офис',            'topic'),
  ('anime',                'Аниме',                'anime'),
  ('igry',                 'Игры',                 'game'),
  ('serial-nedeli',        'Сериал недели',        'topic'),
  ('komediya',             'Комедия',              'genre'),
  ('interstellar',         'Интерстеллар',         'movie')
ON CONFLICT ("slug") DO NOTHING;

-- ============================================================
-- ARTICLES
-- Uses first admin/editor user as author. If no such user
-- exists, the INSERT will fail with a FK violation — create
-- an admin user first.
-- ============================================================

DO $$
DECLARE
  _author_id INTEGER;
BEGIN
  SELECT id INTO _author_id FROM users
    WHERE role IN ('admin', 'editor')
    ORDER BY id LIMIT 1;

  IF _author_id IS NULL THEN
    RAISE EXCEPTION 'No admin or editor user found. Create one before running this migration.';
  END IF;

  -- 1. Nolan new film (news, featured)
  INSERT INTO "articles" ("slug", "category_id", "author_id", "title", "lead", "body", "status", "published_at", "view_count", "comment_count", "is_featured")
  VALUES (
    'nolan-obyavil-novyj-film',
    (SELECT id FROM categories WHERE slug = 'news'),
    _author_id,
    'Кристофер Нолан объявил о новом фильме: съёмки начнутся в 2026 году',
    'Кристофер Нолан подтвердил, что его следующий фильм будет основан на оригинальном сценарии. Съёмки запланированы на лето 2026 года.',
    '[{"type":"paragraph","text":"Кристофер Нолан, режиссёр таких фильмов как <b>Интерстеллар</b>, <b>Начало</b> и <b>Оппенгеймер</b>, подтвердил, что его следующий проект будет полностью оригинальным."},{"type":"heading","level":2,"text":"Что известно о проекте"},{"type":"paragraph","text":"По словам источников, близких к производству, фильм будет сочетать элементы научной фантастики и триллера. Бюджет проекта оценивается в $200 млн."},{"type":"quote","text":"Я всегда возвращаюсь к историям, которые невозможно рассказать в другом формате. Кино остаётся уникальным медиумом.","author":"Кристофер Нолан","source":"Интервью для Variety"},{"type":"paragraph","text":"Каст пока не объявлен, но по слухам, студия ведёт переговоры с несколькими звёздами первого эшелона."},{"type":"heading","level":3,"text":"Сроки и прокат"},{"type":"list","style":"unordered","items":["Съёмки: лето 2026","Планируемая премьера: конец 2027","Прокатчик: Universal Pictures","Формат: IMAX 70mm"]},{"type":"divider"},{"type":"paragraph","text":"Это будет второй совместный проект Нолана и Universal после оскароносного <b>Оппенгеймера</b>."}]',
    'published', '2026-03-14T10:00:00Z', 1842, 0, TRUE
  ) ON CONFLICT ("slug") DO NOTHING;

  -- 2. Dune Part Two review (reviews, featured)
  INSERT INTO "articles" ("slug", "category_id", "author_id", "title", "lead", "body", "status", "published_at", "view_count", "comment_count", "is_featured")
  VALUES (
    'retsenziya-dyuna-chast-vtoraya',
    (SELECT id FROM categories WHERE slug = 'reviews'),
    _author_id,
    'Рецензия: «Дюна: Часть вторая» — масштаб, который меняет кино',
    '«Дюна: Часть вторая» — редкий пример сиквела, который превосходит оригинал.',
    '[{"type":"paragraph","text":"Второй фильм Дени Вильнёва по роману Фрэнка Герберта — это не просто продолжение. Это завершение истории, которая требовала именно такого масштаба."},{"type":"heading","level":2,"text":"Визуальное совершенство"},{"type":"paragraph","text":"Грегг Фрейзер создал одни из самых запоминающихся кадров в истории научной фантастики. Сцены на Арракисе, снятые в естественном свете пустыни, выглядят как ожившие полотна."},{"type":"infobox","title":"Технические данные","blocks":[{"type":"list","style":"unordered","items":["Режиссёр: Дени Вильнёв","Оператор: Грегг Фрейзер","Хронометраж: 166 минут","Бюджет: $190 млн"]}]},{"type":"heading","level":2,"text":"Вердикт"},{"type":"paragraph","text":"<b>9 из 10</b>. Один из лучших научно-фантастических фильмов десятилетия."}]',
    'published', '2026-03-13T14:00:00Z', 3205, 0, TRUE
  ) ON CONFLICT ("slug") DO NOTHING;

  -- 3. A24 analysis (analysis, featured)
  INSERT INTO "articles" ("slug", "category_id", "author_id", "title", "lead", "body", "status", "published_at", "view_count", "comment_count", "is_featured")
  VALUES (
    'pochemu-a24-menyaet-industriyu',
    (SELECT id FROM categories WHERE slug = 'analysis'),
    _author_id,
    'Почему A24 меняет киноиндустрию: разбор бизнес-модели студии',
    'A24 стала одной из самых влиятельных студий Голливуда. Разбираем, как им это удалось.',
    '[{"type":"paragraph","text":"За последнее десятилетие A24 прошла путь от малоизвестного дистрибьютора до одной из самых узнаваемых студий в мире. Их фильмы регулярно попадают в оскаровские номинации, а бренд стал синонимом качественного авторского кино."},{"type":"heading","level":2,"text":"Модель минимального вмешательства"},{"type":"paragraph","text":"Главное отличие A24 от классических студий — свобода, которую они дают режиссёрам. Студия не вмешивается в монтаж, не требует тестовых показов и не навязывает кастинг. Это привлекает авторов, которые устали от студийного контроля."},{"type":"heading","level":2,"text":"Маркетинг через сообщество"},{"type":"paragraph","text":"Вместо традиционных рекламных кампаний A24 делает ставку на вирусный маркетинг и мерч. Их худи и футболки стали модным аксессуаром, а соцсети работают как прямой канал связи с аудиторией."},{"type":"quote","text":"Мы не продаём фильмы. Мы создаём культуру вокруг них.","author":"Дэниел Кац","source":"основатель A24"},{"type":"heading","level":2,"text":"Финансовая устойчивость"},{"type":"paragraph","text":"Средний бюджет фильма A24 — $10-15 млн. При грамотном маркетинге даже скромные сборы обеспечивают окупаемость, а хиты вроде <b>Всё везде и сразу</b> приносят сотни миллионов."},{"type":"divider"},{"type":"paragraph","text":"A24 доказала, что авторское кино может быть прибыльным. Вопрос в том, смогут ли они масштабироваться, не потеряв идентичность."}]',
    'published', '2026-03-12T12:00:00Z', 2100, 0, TRUE
  ) ON CONFLICT ("slug") DO NOTHING;

  -- 4. Marvel plans (news, featured)
  INSERT INTO "articles" ("slug", "category_id", "author_id", "title", "lead", "body", "status", "published_at", "view_count", "comment_count", "is_featured")
  VALUES (
    'marvel-plany-na-2026',
    (SELECT id FROM categories WHERE slug = 'news'),
    _author_id,
    'Marvel представила расписание фильмов на 2026-2027 годы',
    'Студия анонсировала пять новых проектов в рамках обновлённой стратегии MCU.',
    '[{"type":"paragraph","text":"На специальной презентации для прессы глава Marvel Studios Кевин Файги представил обновлённую дорожную карту киновселенной. После нескольких неудачных проектов студия делает ставку на качество, а не количество."},{"type":"heading","level":2,"text":"Что анонсировано"},{"type":"list","style":"unordered","items":["<b>Мстители: Секретные войны</b> — май 2027","<b>Человек-паук: Новая глава</b> — декабрь 2026","<b>Росомаха</b> — сольный фильм, 2027","<b>Фантастическая четвёрка: Первые шаги</b> — июль 2026","<b>Шан-Чи 2</b> — ноябрь 2027"]},{"type":"heading","level":2,"text":"Новая стратегия"},{"type":"paragraph","text":"Файги признал, что за последние два года студия выпускала слишком много контента. Новая стратегия предполагает три фильма и два сериала в год вместо прежних пяти-шести проектов."},{"type":"quote","text":"Мы вернулись к тому, что делает Marvel особенным — рассказываем истории, которые зрители хотят увидеть на большом экране.","author":"Кевин Файги"},{"type":"divider"},{"type":"paragraph","text":"Акции Disney выросли на 3% после презентации. Аналитики отмечают, что фокус на качество — правильный шаг после критики последних релизов."}]',
    'published', '2026-03-14T06:00:00Z', 4150, 0, TRUE
  ) ON CONFLICT ("slug") DO NOTHING;

  -- 5. Top 10 sci-fi (lists)
  INSERT INTO "articles" ("slug", "category_id", "author_id", "title", "lead", "body", "status", "published_at", "view_count", "comment_count", "is_featured")
  VALUES (
    '10-luchshikh-nauchnoy-fantastiki',
    (SELECT id FROM categories WHERE slug = 'lists'),
    _author_id,
    '10 лучших научно-фантастических фильмов XXI века',
    'От «Интерстеллара» до «Прибытия» — фильмы, которые переопределили жанр.',
    '[{"type":"paragraph","text":"Научная фантастика всегда была полигоном для больших идей. В XXI веке жанр переживает ренессанс: режиссёры используют спецэффекты не ради зрелищности, а для рассказа глубоких человеческих историй."},{"type":"heading","level":2,"text":"10. Гравитация (2013)"},{"type":"paragraph","text":"Альфонсо Куарон превратил космическую катастрофу в камерную драму о выживании. 91 минута чистого напряжения."},{"type":"heading","level":2,"text":"9. Из машины (2014)"},{"type":"paragraph","text":"Дебют Алекса Гарленда — минималистичный триллер об искусственном интеллекте, который задаёт неудобные вопросы о природе сознания."},{"type":"heading","level":2,"text":"8. Марсианин (2015)"},{"type":"paragraph","text":"Ридли Скотт вернулся к научной фантастике с оптимистичной историей о человеческой изобретательности."},{"type":"heading","level":2,"text":"7. Прибытие (2016)"},{"type":"paragraph","text":"Дени Вильнёв снял фильм о контакте с инопланетянами, в котором главное оружие — лингвистика. Один из самых интеллектуальных блокбастеров десятилетия."},{"type":"heading","level":2,"text":"6. Аннигиляция (2018)"},{"type":"paragraph","text":"Второй фильм Алекса Гарленда — визуально ошеломляющее путешествие в зону мутации, где законы биологии перестают работать."},{"type":"heading","level":2,"text":"5. Дюна (2021)"},{"type":"paragraph","text":"Вильнёв сделал то, что считалось невозможным — перенёс роман Герберта на экран, сохранив его масштаб и философскую глубину."},{"type":"heading","level":2,"text":"4. Начало (2010)"},{"type":"paragraph","text":"Нолан построил лабиринт из снов, который работает и как головоломка, и как эмоциональная драма об утрате."},{"type":"heading","level":2,"text":"3. Интерстеллар (2014)"},{"type":"paragraph","text":"Космическая одиссея Нолана, в которой физика чёрных дыр служит метафорой родительской любви. Финал, от которого до сих пор перехватывает дыхание."},{"type":"heading","level":2,"text":"2. Бегущий по лезвию 2049 (2017)"},{"type":"paragraph","text":"Вильнёв создал сиквел, который не уступает оригиналу Ридли Скотта. Роджер Дикинс снял, возможно, самый красивый фильм десятилетия."},{"type":"heading","level":2,"text":"1. Всё везде и сразу (2022)"},{"type":"paragraph","text":"Дэниелы взяли концепцию мультивселенной и превратили её в историю о семье, иммиграции и поиске смысла. Фильм, который смеётся, плачет и ломает четвёртую стену одновременно."}]',
    'published', '2026-03-12T00:00:00Z', 5430, 0, FALSE
  ) ON CONFLICT ("slug") DO NOTHING;

  -- 6. Interview with debut director (interviews)
  INSERT INTO "articles" ("slug", "category_id", "author_id", "title", "lead", "body", "status", "published_at", "view_count", "comment_count", "is_featured")
  VALUES (
    'intervyu-molodoj-rezhissyor-o-debyute',
    (SELECT id FROM categories WHERE slug = 'interviews'),
    _author_id,
    'Интервью: «Мой дебют снят за три миллиона — и это свобода»',
    'Режиссёр Алексей Громов рассказывает о своём дебютном фильме и независимом кино в России.',
    '[{"type":"paragraph","text":"Алексей Громов — один из самых заметных дебютантов последних лет. Его фильм <b>«Тишина между нами»</b> получил приз на «Кинотавре» и вышел в ограниченный прокат."},{"type":"heading","level":2,"text":"О пути в кино"},{"type":"quote","text":"Я учился на программиста, но после второго курса понял, что хочу рассказывать истории. Поступил на Высшие курсы сценаристов и режиссёров — и ни разу не пожалел.","author":"Алексей Громов"},{"type":"heading","level":2,"text":"О бюджете"},{"type":"paragraph","text":"Три миллиона рублей — это ничто по меркам индустрии. Но именно ограничения заставляют искать нестандартные решения. Мы снимали в реальных локациях, без декораций, с естественным светом."},{"type":"quote","text":"Когда у тебя нет денег на кран, ты придумываешь кадр, который сильнее любого дрона. Бедность — это творческий вызов, а не приговор.","author":"Алексей Громов"},{"type":"heading","level":2,"text":"О будущем российского кино"},{"type":"paragraph","text":"Громов убеждён, что будущее за региональным кино. Москва перенасыщена, а в регионах есть истории, которые никто не рассказывает."},{"type":"divider"},{"type":"paragraph","text":"Следующий проект Алексея — документальный фильм о закрытии последнего кинотеатра в маленьком уральском городе. Съёмки начнутся осенью 2026 года."}]',
    'published', '2026-03-11T00:00:00Z', 980, 0, FALSE
  ) ON CONFLICT ("slug") DO NOTHING;

  -- 7. Anime spring 2026 (articles)
  INSERT INTO "articles" ("slug", "category_id", "author_id", "title", "lead", "body", "status", "published_at", "view_count", "comment_count", "is_featured")
  VALUES (
    'anime-vesna-2026-obzor',
    (SELECT id FROM categories WHERE slug = 'articles'),
    _author_id,
    'Аниме весеннего сезона 2026: что смотреть',
    'Обзор самых ожидаемых аниме-сериалов весны 2026 года.',
    '[{"type":"paragraph","text":"Весенний сезон традиционно считается одним из сильнейших в аниме-индустрии. 2026 год не исключение: нас ждут продолжения культовых франшиз и многообещающие оригиналы."},{"type":"heading","level":2,"text":"Продолжения"},{"type":"list","style":"unordered","items":["<b>Магическая битва</b> — 3 сезон. Студия MAPPA продолжает адаптацию манги Гэгэ Акутами","<b>Человек-бензопила</b> — 2 сезон. Возвращение Дэндзи после годового перерыва","<b>Атака титанов: Последняя глава</b> — специальный эпизод к юбилею франшизы"]},{"type":"heading","level":2,"text":"Оригиналы сезона"},{"type":"paragraph","text":"Среди оригинальных проектов выделяется <b>«Город зеркал»</b> от студии Trigger — научно-фантастический сериал о мире, где каждое отражение ведёт в параллельную реальность."},{"type":"heading","level":2,"text":"На что обратить внимание"},{"type":"paragraph","text":"Отдельного упоминания заслуживает новый проект Синъитиро Ватанабэ (режиссёр <b>Cowboy Bebop</b> и <b>Samurai Champloo</b>). Детали пока под NDA, но студия Bones уже подтвердила участие."},{"type":"divider"},{"type":"paragraph","text":"Полный список релизов весеннего сезона будет опубликован в начале апреля."}]',
    'published', '2026-03-10T00:00:00Z', 1560, 0, FALSE
  ) ON CONFLICT ("slug") DO NOTHING;

  -- 8. Oppenheimer analysis (analysis)
  INSERT INTO "articles" ("slug", "category_id", "author_id", "title", "lead", "body", "status", "published_at", "view_count", "comment_count", "is_featured")
  VALUES (
    'oppenheimer-razgovor-s-kinovedami',
    (SELECT id FROM categories WHERE slug = 'analysis'),
    _author_id,
    'Оппенгеймер: как Нолан переосмыслил байопик',
    'Разбираем структуру и киноязык фильма, собравшего 7 Оскаров.',
    '[{"type":"paragraph","text":"<b>Оппенгеймер</b> — это не просто биография учёного. Нолан деконструировал жанр байопика, превратив историю создания атомной бомбы в субъективный психологический триллер."},{"type":"heading","level":2,"text":"Нелинейная структура"},{"type":"paragraph","text":"Фильм использует две временные линии — цветную (от лица Оппенгеймера) и чёрно-белую (от лица Штрауса). Этот приём позволяет показать одни и те же события с противоположных точек зрения."},{"type":"heading","level":2,"text":"Монтаж как оружие"},{"type":"paragraph","text":"Сцена испытания «Тринити» длится всего несколько минут, но к ней ведут два часа нарастающего напряжения. Нолан намеренно лишает зрителя катарсиса: взрыв беззвучен, а ударная волна приходит с задержкой."},{"type":"quote","text":"Я хотел, чтобы зритель почувствовал то же, что Оппенгеймер — восторг от научного достижения и немедленный ужас от его последствий.","author":"Кристофер Нолан","source":"пресс-конференция на BAFTA"},{"type":"heading","level":2,"text":"Музыка Людвига Йоранссона"},{"type":"paragraph","text":"Саундтрек построен на повторяющемся мотиве скрипки, который становится всё более тревожным по мере приближения к кульминации. Йоранссон записал оркестр вживую, отказавшись от синтезаторов."},{"type":"divider"},{"type":"paragraph","text":"<b>Оппенгеймер</b> доказал, что байопик может быть таким же формально изобретательным, как любой жанровый фильм. 7 Оскаров — заслуженное признание."}]',
    'published', '2026-03-09T00:00:00Z', 2870, 0, FALSE
  ) ON CONFLICT ("slug") DO NOTHING;

  -- 9. Film festivals 2026 (news)
  INSERT INTO "articles" ("slug", "category_id", "author_id", "title", "lead", "body", "status", "published_at", "view_count", "comment_count", "is_featured")
  VALUES (
    'kinofestivali-2026-raspisanie',
    (SELECT id FROM categories WHERE slug = 'news'),
    _author_id,
    'Кинофестивали 2026: расписание и ожидания',
    'Канны, Венеция, Берлинале — что покажут главные фестивали в этом году.',
    '[{"type":"paragraph","text":"2026 год обещает быть насыщенным для фестивального кино. Составили гид по главным событиям года."},{"type":"heading","level":2,"text":"Берлинале (февраль)"},{"type":"paragraph","text":"76-й Берлинский кинофестиваль уже завершился. «Золотого медведя» получил фильм южнокорейского режиссёра — третий год подряд азиатское кино доминирует в Берлине."},{"type":"heading","level":2,"text":"Канны (май)"},{"type":"paragraph","text":"79-й Каннский фестиваль пройдёт с 12 по 23 мая. В этом году жюри возглавит Пон Чжун Хо. Среди ожидаемых премьер — новые фильмы Пола Томаса Андерсона и Джордана Пила."},{"type":"heading","level":2,"text":"Венеция (сентябрь)"},{"type":"paragraph","text":"Венецианский фестиваль традиционно открывает оскаровский сезон. В прошлом году именно здесь стартовали кампании главных претендентов на «Оскар»."},{"type":"heading","level":2,"text":"Российские фестивали"},{"type":"list","style":"unordered","items":["<b>Кинотавр</b> — июнь, Сочи. Главный смотр российского авторского кино","<b>ММКФ</b> — апрель, Москва. Международная программа и ретроспективы","<b>Послание к человеку</b> — сентябрь, Санкт-Петербург. Фокус на документальном кино"]},{"type":"divider"},{"type":"paragraph","text":"Будем следить за каждым фестивалем и публиковать обзоры конкурсных программ."}]',
    'published', '2026-03-08T00:00:00Z', 1230, 0, FALSE
  ) ON CONFLICT ("slug") DO NOTHING;

END $$;

-- ============================================================
-- ARTICLE-TAG ASSOCIATIONS
-- ============================================================

INSERT INTO "article_tags" ("article_id", "tag_id")
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'nolan-obyavil-novyj-film' AND t.slug = 'kristofer-nolan'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'nolan-obyavil-novyj-film' AND t.slug = 'nauchaya-fantastika'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'retsenziya-dyuna-chast-vtoraya' AND t.slug = 'dyuna'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'retsenziya-dyuna-chast-vtoraya' AND t.slug = 'denis-vilnyov'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'pochemu-a24-menyaet-industriyu' AND t.slug = 'a24'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'pochemu-a24-menyaet-industriyu' AND t.slug = 'boks-ofis'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'marvel-plany-na-2026' AND t.slug = 'marvel'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'marvel-plany-na-2026' AND t.slug = 'premery'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = '10-luchshikh-nauchnoy-fantastiki' AND t.slug = 'nauchaya-fantastika'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = '10-luchshikh-nauchnoy-fantastiki' AND t.slug = 'kristofer-nolan'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'intervyu-molodoj-rezhissyor-o-debyute' AND t.slug = 'drama'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'anime-vesna-2026-obzor' AND t.slug = 'anime'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'anime-vesna-2026-obzor' AND t.slug = 'serial-nedeli'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'oppenheimer-razgovor-s-kinovedami' AND t.slug = 'kristofer-nolan'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'oppenheimer-razgovor-s-kinovedami' AND t.slug = 'drama'
UNION ALL
SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = 'kinofestivali-2026-raspisanie' AND t.slug = 'premery'
ON CONFLICT DO NOTHING;

-- ============================================================
-- UPDATE TAG ARTICLE COUNTS
-- Recompute from actual article_tags data
-- ============================================================

UPDATE tags SET article_count = (
  SELECT COUNT(*) FROM article_tags at
  JOIN articles a ON a.id = at.article_id
  WHERE at.tag_id = tags.id AND a.status = 'published'
);
