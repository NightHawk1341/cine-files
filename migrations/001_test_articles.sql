-- ============================================================
-- Test articles for TR-BUTE integration testing
-- Requires: categories (13-18) and at least one user (author)
-- Run manually via Supabase SQL editor
-- ============================================================

-- Create a system author if none exists
INSERT INTO users (yandex_id, email, display_name, login_method, role)
VALUES ('system', 'admin@cinefiles.ru', 'CineFiles', 'yandex', 'admin')
ON CONFLICT (yandex_id) DO NOTHING;

-- Use the first admin user as author for all test articles
DO $$
DECLARE
  v_author_id INTEGER;
BEGIN
  SELECT id INTO v_author_id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1;
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'No admin user found — create one first';
  END IF;

  -- ==========================================================
  -- Tags (movie/show titles for cross-site matching)
  -- ==========================================================
  INSERT INTO tags (slug, name_ru, name_en, tag_type) VALUES
    ('potok',               'Поток',                    'Flow',              'movie'),
    ('anora',               'Анора',                    'Anora',             'movie'),
    ('razdelenie',          'Разделение',               'Severance',         'series'),
    ('odni-iz-nas',         'Одни из нас',              'The Last of Us',    'series'),
    ('amerikanskiy-psikhopat', 'Американский психопат', 'American Psycho',   'movie'),
    ('substantsiya',        'Субстанция',               'The Substance',     'movie'),
    ('dyuna-chast-vtoraya', 'Дюна: Часть вторая',       'Dune: Part Two',    'movie'),
    ('odin-doma',           'Один дома',                'Home Alone',        'movie'),
    ('zavodoy-apelsin',     'Заводной апельсин',        'A Clockwork Orange','movie'),
    ('arkeyn',              'Аркейн',                   'Arcane',            'series')
  ON CONFLICT (slug) DO NOTHING;

  -- ==========================================================
  -- 1. Поток (Flow) — reviews
  -- ==========================================================
  INSERT INTO articles (slug, category_id, author_id, title, lead, body, status, published_at, is_featured)
  VALUES (
    'potok-obzor',
    14, -- reviews
    v_author_id,
    'Поток — анимация, которая не нуждается в словах',
    'Латвийский мультфильм без единого слова диалога покорил мировые фестивали и доказал, что анимация способна рассказывать истории на уровне чистых эмоций.',
    '[{"type":"paragraph","content":"Режиссёр Гинтс Зилбалодис создал фильм, в котором кот путешествует через затопленный мир. Ни одного слова — только музыка, движение и невероятная визуальная поэзия."},{"type":"paragraph","content":"«Поток» — это редкий случай, когда анимация обращается к зрителю напрямую, минуя языковой барьер. Фильм работает как медитация: он замедляет, погружает и оставляет после себя тишину, в которой хочется остаться."}]'::jsonb,
    'published',
    NOW() - INTERVAL '10 days',
    TRUE
  ) ON CONFLICT (slug) DO NOTHING;

  -- ==========================================================
  -- 2. Анора (Anora) — reviews
  -- ==========================================================
  INSERT INTO articles (slug, category_id, author_id, title, lead, body, status, published_at, is_featured)
  VALUES (
    'anora-retsenziya',
    14, -- reviews
    v_author_id,
    'Анора: Шон Бейкер снова снимает про тех, кого не замечают',
    'Золотая пальмовая ветвь Канн 2024 — за историю стриптизёрши из Брайтон-Бич, которая выходит замуж за сына русского олигарха.',
    '[{"type":"paragraph","content":"Шон Бейкер давно зарекомендовал себя как режиссёр, умеющий находить кинематографическое золото в историях маргинализированных людей. «Анора» продолжает эту линию — с размахом, юмором и неожиданной нежностью."},{"type":"paragraph","content":"Майки Мэдисон в главной роли создаёт персонажа, за которым невозможно не следить. Её Анора — это сгусток энергии, амбиций и уязвимости, запертый в теле женщины, которая привыкла рассчитывать только на себя."}]'::jsonb,
    'published',
    NOW() - INTERVAL '9 days',
    TRUE
  ) ON CONFLICT (slug) DO NOTHING;

  -- ==========================================================
  -- 3. Разделение (Severance) — articles
  -- ==========================================================
  INSERT INTO articles (slug, category_id, author_id, title, lead, body, status, published_at, is_featured)
  VALUES (
    'razdelenie-sezon-2-razbor',
    15, -- articles
    v_author_id,
    'Разделение: почему второй сезон оправдал ожидание',
    'Apple TV+ вернули один из лучших сериалов последних лет — и не разочаровали.',
    '[{"type":"paragraph","content":"Второй сезон «Разделения» делает то, что редко удаётся продолжениям: он расширяет мифологию, не теряя при этом интимности первого сезона. Марк и его коллеги по Lumon Industries продолжают искать ответы — но теперь вопросы стали ещё страшнее."},{"type":"paragraph","content":"Бен Стиллер как режиссёр окончательно утвердился в статусе визионера. Каждый кадр выстроен с хирургической точностью, а ритм повествования держит в напряжении от первой до последней минуты."}]'::jsonb,
    'published',
    NOW() - INTERVAL '8 days',
    TRUE
  ) ON CONFLICT (slug) DO NOTHING;

  -- ==========================================================
  -- 4. Одни из нас (The Last of Us) — news
  -- ==========================================================
  INSERT INTO articles (slug, category_id, author_id, title, lead, body, status, published_at, is_featured)
  VALUES (
    'odni-iz-nas-sezon-2',
    13, -- news
    v_author_id,
    'Второй сезон «Одни из нас» — всё, что известно',
    'HBO продолжает адаптацию культовой игры. Педро Паскаль и Белла Рэмзи возвращаются.',
    '[{"type":"paragraph","content":"Второй сезон охватит события The Last of Us Part II — самой противоречивой и эмоционально разрушительной части игровой серии. Крейг Мейзин и Нил Дракманн обещают верность оригиналу, но с неизбежными адаптационными решениями."},{"type":"paragraph","content":"Кэти О''Брайен в роли Эбби стала одним из самых обсуждаемых кастинговых решений года. Продакшн проходил в Канаде, бюджет значительно вырос по сравнению с первым сезоном."}]'::jsonb,
    'published',
    NOW() - INTERVAL '7 days',
    FALSE
  ) ON CONFLICT (slug) DO NOTHING;

  -- ==========================================================
  -- 5. Американский психопат (American Psycho) — analysis
  -- ==========================================================
  INSERT INTO articles (slug, category_id, author_id, title, lead, body, status, published_at, is_featured)
  VALUES (
    'amerikanskiy-psikhopat-analiz',
    18, -- analysis
    v_author_id,
    'Американский психопат 25 лет спустя: сатира, которая стала реальностью',
    'Фильм Мэри Хэррон о Патрике Бейтмане оказался пророческим высказыванием о культуре нарциссизма.',
    '[{"type":"paragraph","content":"В 2000 году «Американский психопат» казался гротескной карикатурой. Четверть века спустя фильм воспринимается почти как документальное кино. Кристиан Бэйл создал образ, который растащили на мемы, — но за мемами скрывается одна из самых точных сатир на корпоративную Америку."},{"type":"paragraph","content":"Мэри Хэррон превратила роман Брета Истона Эллиса в нечто принципиально иное: там, где книга тонула в подробностях насилия, фильм делает ставку на абсурд и чёрный юмор. Бейтман в её версии — не столько монстр, сколько пустая оболочка, идеально вписанная в систему, которая пустоту поощряет."}]'::jsonb,
    'published',
    NOW() - INTERVAL '6 days',
    TRUE
  ) ON CONFLICT (slug) DO NOTHING;

  -- ==========================================================
  -- 6. Субстанция (The Substance) — reviews
  -- ==========================================================
  INSERT INTO articles (slug, category_id, author_id, title, lead, body, status, published_at, is_featured)
  VALUES (
    'substantsiya-retsenziya',
    14, -- reviews
    v_author_id,
    'Субстанция: боди-хоррор как манифест против эйджизма',
    'Корали Фаржа сняла фильм, после которого хочется и аплодировать, и принять душ. Деми Мур в роли жизни.',
    '[{"type":"paragraph","content":"«Субстанция» — это два часа нарастающего безумия, в центре которого стоит простой вопрос: чего стоит молодость? Деми Мур играет телеведущую, чья карьера заканчивается в день пятидесятилетия. Таинственный препарат обещает вторую молодость — за определённую цену."},{"type":"paragraph","content":"Фаржа не церемонится со зрителем. Третий акт фильма — это каскад телесных трансформаций, который заставит даже закалённых фанатов хоррора отвернуться от экрана. Но за гротеском скрывается искренняя ярость — против индустрии, которая выбрасывает женщин за порог видимости."}]'::jsonb,
    'published',
    NOW() - INTERVAL '5 days',
    FALSE
  ) ON CONFLICT (slug) DO NOTHING;

  -- ==========================================================
  -- 7. Дюна: Часть вторая (Dune: Part Two) — reviews
  -- ==========================================================
  INSERT INTO articles (slug, category_id, author_id, title, lead, body, status, published_at, is_featured)
  VALUES (
    'dyuna-chast-vtoraya-retsenziya',
    14, -- reviews
    v_author_id,
    'Дюна: Часть вторая — Вильнёв завершает эпос',
    'Вторая часть «Дюны» — это масштабнее, громче и мрачнее. И при этом — один из лучших блокбастеров десятилетия.',
    '[{"type":"paragraph","content":"Дени Вильнёв сделал то, что казалось невозможным: снял вторую часть лучше первой. «Дюна: Часть вторая» — это не просто завершение истории Пола Атрейдиса, а полноценное политическое высказывание о природе власти, фанатизма и мессианства."},{"type":"paragraph","content":"Тимоти Шаламе наконец раскрывается как драматический актёр. Его Пол во второй части — уже не мальчик, потерявший отца, а человек, сознательно идущий по пути, который уничтожит миллионы. Зендея получает заслуженное экранное время, а Остин Батлер в роли Фейд-Рауты крадёт каждую сцену."}]'::jsonb,
    'published',
    NOW() - INTERVAL '4 days',
    TRUE
  ) ON CONFLICT (slug) DO NOTHING;

  -- ==========================================================
  -- 8. Один дома (Home Alone) — articles
  -- ==========================================================
  INSERT INTO articles (slug, category_id, author_id, title, lead, body, status, published_at, is_featured)
  VALUES (
    'odin-doma-fenomen',
    15, -- articles
    v_author_id,
    'Почему «Один дома» до сих пор работает',
    'Рождественская комедия 1990 года остаётся самым пересматриваемым фильмом в России каждый декабрь.',
    '[{"type":"paragraph","content":"«Один дома» — это не просто фильм, а культурный ритуал. Каждый год в конце декабря миллионы семей включают историю Кевина Маккаллистера, и каждый раз она работает. Вопрос — почему?"},{"type":"paragraph","content":"Ответ кроется в гениальной простоте конструкции. Сценарий Джона Хьюза работает как часовой механизм: каждая ловушка подготовлена, каждый гэг выстроен, а за фасадом слэпстик-комедии спрятана история о семье и одиночестве, которая трогает вне зависимости от возраста."}]'::jsonb,
    'published',
    NOW() - INTERVAL '3 days',
    FALSE
  ) ON CONFLICT (slug) DO NOTHING;

  -- ==========================================================
  -- 9. Заводной апельсин (A Clockwork Orange) — analysis
  -- ==========================================================
  INSERT INTO articles (slug, category_id, author_id, title, lead, body, status, published_at, is_featured)
  VALUES (
    'zavodoy-apelsin-analiz',
    18, -- analysis
    v_author_id,
    'Заводной апельсин: свобода воли против общественной безопасности',
    'Фильм Стэнли Кубрика остаётся самым неудобным вопросом кинематографа о границах допустимого.',
    '[{"type":"paragraph","content":"«Заводной апельсин» — это фильм-тест. То, как вы его воспринимаете, говорит о вас больше, чем о самом фильме. Кубрик намеренно лишает зрителя комфортной позиции: Алекс ДеЛардж одновременно отвратителен и обаятелен, жертва и палач."},{"type":"paragraph","content":"Центральный вопрос фильма — имеет ли человек право на зло? — не потерял актуальности. В эпоху алгоритмов, предиктивной полиции и социальных рейтингов «Заводной апельсин» звучит пугающе современно."}]'::jsonb,
    'published',
    NOW() - INTERVAL '2 days',
    FALSE
  ) ON CONFLICT (slug) DO NOTHING;

  -- ==========================================================
  -- 10. Аркейн (Arcane) — articles
  -- ==========================================================
  INSERT INTO articles (slug, category_id, author_id, title, lead, body, status, published_at, is_featured)
  VALUES (
    'arkeyn-fenomen',
    15, -- articles
    v_author_id,
    'Аркейн: как игровая адаптация стала лучшим анимационным сериалом',
    'Студия Fortiche доказала, что адаптации видеоигр могут быть не просто хорошими, а выдающимися.',
    '[{"type":"paragraph","content":"До «Аркейна» адаптации видеоигр считались проклятием кинематографа. После «Аркейна» индустрия пересмотрела свои взгляды. Сериал по мотивам League of Legends сделал невозможное — он понравился и фанатам игры, и тем, кто никогда о ней не слышал."},{"type":"paragraph","content":"Секрет успеха — в том, что создатели отнеслись к материалу серьёзно. Визуальный стиль Fortiche не похож ни на что в современной анимации: смесь 2D и 3D, живописные текстуры, кинематографическая камера. А история сестёр Вай и Джинкс — это шекспировская трагедия в фэнтези-обёртке."}]'::jsonb,
    'published',
    NOW() - INTERVAL '1 day',
    TRUE
  ) ON CONFLICT (slug) DO NOTHING;

  -- ==========================================================
  -- Link articles to tags
  -- ==========================================================
  INSERT INTO article_tags (article_id, tag_id, is_primary)
  SELECT a.id, t.id, TRUE
  FROM (VALUES
    ('potok-obzor',                'potok'),
    ('anora-retsenziya',           'anora'),
    ('razdelenie-sezon-2-razbor',  'razdelenie'),
    ('odni-iz-nas-sezon-2',        'odni-iz-nas'),
    ('amerikanskiy-psikhopat-analiz', 'amerikanskiy-psikhopat'),
    ('substantsiya-retsenziya',    'substantsiya'),
    ('dyuna-chast-vtoraya-retsenziya', 'dyuna-chast-vtoraya'),
    ('odin-doma-fenomen',          'odin-doma'),
    ('zavodoy-apelsin-analiz',     'zavodoy-apelsin'),
    ('arkeyn-fenomen',             'arkeyn')
  ) AS v(article_slug, tag_slug)
  JOIN articles a ON a.slug = v.article_slug
  JOIN tags t ON t.slug = v.tag_slug
  ON CONFLICT (article_id, tag_id) DO NOTHING;

  -- Update tag article counts
  UPDATE tags SET article_count = (
    SELECT COUNT(*) FROM article_tags WHERE tag_id = tags.id
  )
  WHERE slug IN (
    'potok', 'anora', 'razdelenie', 'odni-iz-nas',
    'amerikanskiy-psikhopat', 'substantsiya', 'dyuna-chast-vtoraya',
    'odin-doma', 'zavodoy-apelsin', 'arkeyn'
  );

END $$;
