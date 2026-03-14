/**
 * All tags page — grouped by type.
 * Route: /tags
 */

Router.registerPage('/tags', {
  styles: ['/css/tags.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '<div class="container page-content"><div class="skeleton" style="height:400px"></div></div>';

    try {
      var data = await Utils.apiFetch('/api/tags?limit=500');
      var tags = data.tags || [];

      content.innerHTML = '';
      var container = document.createElement('div');
      container.className = 'container page-content';

      var h1 = document.createElement('h1');
      h1.className = 'tags-page-title';
      h1.textContent = 'Все теги';
      container.appendChild(h1);

      if (tags.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'tags-empty';
        empty.textContent = 'Тегов пока нет';
        container.appendChild(empty);
      } else {
        // Group by type
        var groups = {};
        var typeLabels = {
          movie: 'Фильмы',
          tv: 'Сериалы',
          person: 'Персоны',
          genre: 'Жанры',
          franchise: 'Франшизы',
          studio: 'Студии',
          topic: 'Темы',
          game: 'Игры',
          anime: 'Аниме',
        };

        tags.forEach(function (tag) {
          var type = tag.type || 'topic';
          if (!groups[type]) groups[type] = [];
          groups[type].push(tag);
        });

        Object.keys(groups).forEach(function (type) {
          var section = document.createElement('div');
          section.className = 'tags-section';

          var sectionTitle = document.createElement('h2');
          sectionTitle.className = 'tags-section-title';
          sectionTitle.innerHTML = (typeLabels[type] || type) +
            ' <span class="tags-count">' + groups[type].length + '</span>';
          section.appendChild(sectionTitle);

          var cloud = document.createElement('div');
          cloud.className = 'tag-cloud';
          groups[type].forEach(function (tag) {
            var a = document.createElement('a');
            a.className = 'tag-pill';
            a.href = '/tag/' + tag.slug;
            a.textContent = tag.name_ru;
            if (tag.article_count > 0) {
              var count = document.createElement('span');
              count.className = 'tag-pill-count';
              count.textContent = tag.article_count;
              a.appendChild(count);
            }
            cloud.appendChild(a);
          });
          section.appendChild(cloud);
          container.appendChild(section);
        });
      }

      content.appendChild(container);
      document.title = 'Все теги — CineFiles';
    } catch (err) {
      console.error('Tags page error:', err);
    }
  },
});
