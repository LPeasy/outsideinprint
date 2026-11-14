(function () {
  'use strict';

  window.oipRegisterRouteWidget('author-portraits', function (scope) {
    document.querySelectorAll('[data-author-portraits]').forEach(function (gallery) {
      var slides = Array.from(gallery.querySelectorAll('[data-portrait-slide]'));
      var previous = gallery.querySelector('[data-portrait-previous]');
      var next = gallery.querySelector('[data-portrait-next]');
      var status = gallery.querySelector('[data-portrait-status]');
      if (slides.length < 2 || !previous || !next) return;
      var current = 0;

      function show(index) {
        current = (index + slides.length) % slides.length;
        slides.forEach(function (slide, i) { slide.hidden = i !== current; });
        slides[current].querySelector('img').loading = 'eager';
        status.textContent = 'Portrait ' + (current + 1) + ' of ' + slides.length;
      }

      scope.on(previous, 'click', function () { show(current - 1); });
      scope.on(next, 'click', function () { show(current + 1); });
      scope.on(gallery, 'keydown', function (event) {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          show(current + (event.key === 'ArrowLeft' ? -1 : 1));
        }
      });
      previous.hidden = false;
      next.hidden = false;
    });
  });
}());
