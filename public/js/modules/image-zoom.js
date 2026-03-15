/**
 * Image zoom — full-screen image viewer.
 * Click image to open, click overlay to close.
 */

var ImageZoom = (function () {
  var overlay = null;

  function init() {
    // Delegate click on zoomable images
    document.addEventListener('click', function (e) {
      var img = e.target.closest('.zoomable-image');
      if (!img) return;
      open(img.src, img.alt);
    });
  }

  function open(src, alt) {
    overlay = document.createElement('div');
    overlay.className = 'image-zoom-overlay';
    overlay.innerHTML =
      '<img src="' + Utils.escapeHtml(src) + '" alt="' + Utils.escapeHtml(alt || '') + '" class="image-zoom-img">';

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    document.body.appendChild(overlay);
    document.body.classList.add('popup-open');
  }

  function close() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
      document.body.classList.remove('popup-open');
      overlay = null;
    }
  }

  return {
    init: init,
    close: close,
  };
})();
