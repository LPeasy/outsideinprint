(function () {
  'use strict';
  if (window.oipRegisterRouteWidget) return;
  var widgets = new Map();

  function mount(widget) {
    if (widget.dispose) return;
    var cleanups = [];
    var active = true;
    widget.dispose = function () {
      active = false;
      for (var i = cleanups.length - 1; i >= 0; i -= 1) {
        try { cleanups[i](); } catch (error) { console.error('Route widget cleanup failed:', widget.name, error); }
      }
      cleanups.length = 0;
      widget.dispose = null;
    };
    var scope = {
      active: function () { return active; },
      cleanup: function (callback) { cleanups.push(callback); },
      on: function (target, type, callback, options) {
        target.addEventListener(type, callback, options);
        cleanups.push(function () { target.removeEventListener(type, callback, options); });
      }
    };
    try { widget.mount(scope); }
    catch (error) { widget.dispose(); throw error; }
  }

  window.oipRegisterRouteWidget = function (name, initialize) {
    if (widgets.has(name)) return;
    var widget = { name: name, mount: initialize, dispose: null };
    widgets.set(name, widget);
    mount(widget);
  };
  document.addEventListener('oip:before-route', function () {
    widgets.forEach(function (widget) { if (widget.dispose) widget.dispose(); });
  });
  document.addEventListener('oip:route', function () { widgets.forEach(mount); });
}());
