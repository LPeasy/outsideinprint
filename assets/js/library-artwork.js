(function (window, document) {
  function setArticleAnalytics(anchor, item) {
    anchor.setAttribute('data-analytics-event', 'internal_promo_click');
    anchor.setAttribute('data-analytics-source-slot', 'library_search');
    anchor.setAttribute('data-analytics-slug', item.slug || '');
    anchor.setAttribute('data-analytics-title', item.title);
    anchor.setAttribute('data-analytics-section', item.sectionLabel || item.typeTitle || '');
    anchor.setAttribute('data-analytics-path', item.url);
  }

  function renderArtwork(item) {
    var image = item.image;
    var wrapper = document.createElement('span');
    wrapper.className = 'essay-cartoon-thumb-wrap essay-cartoon-thumb-wrap--collection-artwork';
    var media = image.credit ? document.createElement('span') : wrapper;
    if (image.credit) media.className = 'essay-cartoon-thumb-media';

    var link = document.createElement('a');
    link.className = 'essay-cartoon-thumb';
    link.href = item.url;
    link.setAttribute('aria-label', 'Read ' + item.title);
    setArticleAnalytics(link, item);
    var picture = image.avifSrcset && image.webpSrcset ? document.createElement('picture') : null;
    if (picture) {
      picture.className = 'oip-picture';
      if (image.imageId) picture.setAttribute('data-oip-image-id', image.imageId);
      if (image.imageClass) picture.setAttribute('data-oip-image-class', image.imageClass);
      if (image.reviewState) picture.setAttribute('data-oip-image-review-state', image.reviewState);
      [['image/avif', image.avifSrcset], ['image/webp', image.webpSrcset]].forEach(function (sourceData) {
        var source = document.createElement('source');
        source.setAttribute('type', sourceData[0]);
        source.setAttribute('srcset', sourceData[1]);
        source.setAttribute('sizes', '(min-width: 72rem) 30rem, (min-width: 641px) 46vw, calc(100vw - 2.25rem)');
        picture.appendChild(source);
      });
    }
    var img = document.createElement('img');
    img.src = image.src;
    img.alt = image.alt || item.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    if (image.width) img.width = image.width;
    if (image.height) img.height = image.height;
    if (picture) {
      img.setAttribute('srcset', image.webpSrcset);
      img.setAttribute('sizes', '(min-width: 72rem) 30rem, (min-width: 641px) 46vw, calc(100vw - 2.25rem)');
      if (image.imageId) img.setAttribute('data-oip-image-id', image.imageId);
      picture.appendChild(img);
      link.appendChild(picture);
    } else {
      link.appendChild(img);
    }
    media.appendChild(link);

    var zoom = document.createElement('button');
    zoom.type = 'button';
    zoom.className = 'essay-cartoon-zoom';
    zoom.setAttribute('data-essay-cartoon-lightbox-trigger', '');
    zoom.setAttribute('data-title', image.title || item.title);
    zoom.setAttribute('data-date', image.date || item.date || '');
    zoom.setAttribute('data-date-label', image.dateLabel || '');
    zoom.setAttribute('data-image', image.lightboxSrc || image.src);
    zoom.setAttribute('data-alt', image.alt || item.title);
    zoom.setAttribute('data-width', image.lightboxWidth || image.width || 0);
    zoom.setAttribute('data-height', image.lightboxHeight || image.height || 0);
    if (image.cartoonSlug) zoom.setAttribute('data-cartoon-slug', image.cartoonSlug);
    if (image.gallery) zoom.setAttribute('data-gallery', image.gallery);
    zoom.setAttribute('aria-label', 'Open the illustration for ' + item.title + ' fullscreen');
    var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    icon.setAttribute('width', '18');
    icon.setAttribute('height', '18');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '10.5');
    circle.setAttribute('cy', '10.5');
    circle.setAttribute('r', '6.5');
    var handle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    handle.setAttribute('d', 'm16 16 5 5');
    icon.appendChild(circle);
    icon.appendChild(handle);
    zoom.appendChild(icon);
    media.appendChild(zoom);

    if (image.credit) {
      wrapper.appendChild(media);
      var credit = document.createElement('span');
      credit.className = 'image-credit';
      credit.appendChild(document.createTextNode('Photo: '));
      var author = document.createElement('a');
      author.href = image.credit.sourceUrl;
      author.textContent = image.credit.author;
      credit.appendChild(author);
      credit.appendChild(document.createTextNode(' · '));
      var license = document.createElement('a');
      license.href = image.credit.licenseUrl;
      license.textContent = image.credit.license;
      credit.appendChild(license);
      if (image.credit.changes) credit.appendChild(document.createTextNode(' · ' + image.credit.changes));
      wrapper.appendChild(credit);
    }
    return wrapper;
  }

  window.oipLibraryArtwork = { setArticleAnalytics: setArticleAnalytics, renderArtwork: renderArtwork };
}(window, document));
