/**
 * Admin article editor — redirects to the article editor modal.
 * Routes: /admin/articles/new, /admin/articles/:id
 * The actual editor lives in ArticleEditorModal component.
 */

Router.registerPage('/admin/articles/new', {
  styles: ['/css/admin.css'],
  init: function () {
    ArticleEditorModal.open(null);
    document.title = 'Новая статья — CineFiles';
  },
});

Router.registerPage('/admin/articles/:id', {
  styles: ['/css/admin.css'],
  init: function (params) {
    ArticleEditorModal.open(params.id);
    document.title = 'Редактировать статью — CineFiles';
  },
});
