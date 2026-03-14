/**
 * Media / image URL resolution helper.
 */

var Media = (function () {
  /**
   * Resolve an image URL — handles relative paths, S3 URLs, etc.
   * @param {string|null|undefined} url
   * @param {string} [fallback]
   * @returns {string}
   */
  function resolveImageUrl(url, fallback) {
    if (!url) return fallback || '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      return url;
    }
    if (url.startsWith('/')) return url;
    return '/' + url;
  }

  return {
    resolveImageUrl: resolveImageUrl,
  };
})();
