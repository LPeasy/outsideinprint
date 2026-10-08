(() => {
  const panel = document.querySelector('[data-idle-bob]');
  if (!panel) return;
  const frame = panel.querySelector('[data-idle-bob-frame]');
  const status = panel.querySelector('.home-idle-bob__status');
  const channel = 'oip-idle-bob-v1';
  let ready = false;
  let inView = false;
  let fallbackTimer;
  const send = (data) => frame.contentWindow?.postMessage({ channel, ...data }, location.origin);
  const update = () => {
    if (!ready) return;
    send({ type: 'visibility', active: inView && !document.hidden });
    send({ type: 'theme', theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' });
  };
  const load = () => {
    if (frame.hasAttribute('src')) return;
    frame.src = frame.dataset.src;
    fallbackTimer = setTimeout(() => {
      if (!status.hidden) status.textContent = 'Bob could not load. You can still find Idle Times on Steam above.';
    }, 20000);
  };
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.channel !== channel) return;
    const data = event.data;
    if (data.type === 'ready') {
      ready = true;
      panel.dataset.ready = 'true';
      update();
    } else if (data.type === 'painted') {
      clearTimeout(fallbackTimer);
      status.hidden = true;
    } else if (data.type === 'size' && typeof data.height === 'number' && Number.isFinite(data.height)) {
      frame.height = String(Math.min(640, Math.max(220, Math.ceil(data.height))));
    }
  });
  if ('IntersectionObserver' in window) {
    const loader = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) { load(); loader.disconnect(); }
    }, { rootMargin: '300px' });
    loader.observe(panel);
    const visibility = new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      update();
    });
    visibility.observe(frame);
  } else { inView = true; load(); }
  document.addEventListener('visibilitychange', update);
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
