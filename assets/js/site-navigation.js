(function () {
  'use strict';
  if (window.oipNavigation || !window.Swup || !document.querySelector('#site-page')) return;

  const containers = ['#site-page', '#site-overlays'];
  const configSelector = 'script[data-oip-route-config]';
  const metadataSelector = 'meta[name="description"],meta[name="author"],meta[name="robots"],meta[property^="og:"],meta[name^="twitter:"],link[rel="canonical"],link[rel="alternate"],script[type="application/ld+json"]';
  const loadedScripts = new Set(Array.from(document.scripts, script => script.src).filter(Boolean));
  const registeredWidgets = new Set(Array.from(document.querySelectorAll('script[data-oip-route-script]'), script => script.dataset.oipRouteScript));
  const criticalAssets = documentAssets(document);
  const positions = new Map();
  let displayedUrl = location.pathname + location.search;
  let displayedIndex = history.state?.index || 1;
  let loadingTimer;
  let scrollFrame;

  function documentAssets(doc) {
    return Array.from(doc.querySelectorAll('[data-oip-persistent]'), node => [node.dataset.oipPersistent, node.getAttribute('src') || node.getAttribute('href')]).sort().map(pair => pair.join(':')).join('|');
  }
  function resolveUrl(raw) {
    const url = new URL(raw, location.href);
    return /\/library\/$/.test(url.pathname) ? url.pathname : url.pathname + url.search;
  }
  function permitted(raw) {
    const url = new URL(raw, location.href);
    return url.origin === location.origin && /^https?:$/.test(url.protocol) &&
      !/\/(?:demos|companion-bob)\//.test(url.pathname) &&
      (!/\.[a-z0-9]+$/i.test(url.pathname) || /\/404\.html$/.test(url.pathname));
  }
  function rememberScroll() {
    positions.set(displayedIndex, [window.scrollX, window.scrollY]);
    if (positions.size > 80) positions.delete(positions.keys().next().value);
  }
  function focusContent(hash) {
    if (Array.from(document.querySelectorAll('dialog[open], [aria-modal="true"]')).some(node => node.getClientRects().length && !node.closest('[hidden]'))) return;
    const target = (hash && swup.getAnchorElement(hash)) || document.querySelector('#main-content h1') || document.querySelector('#main-content');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  function setLoading(active) {
    clearTimeout(loadingTimer);
    if (active) {
      loadingTimer = setTimeout(() => document.documentElement.setAttribute('data-route-loading', ''), 180);
      document.querySelector('#main-content')?.setAttribute('aria-busy', 'true');
    } else {
      document.documentElement.removeAttribute('data-route-loading');
      document.querySelector('#main-content')?.removeAttribute('aria-busy');
    }
  }
  function dispatch(name, visit) {
    document.dispatchEvent(new CustomEvent(name, { detail: {
      url: location.href, previousUrl: visit?.from.url || displayedUrl,
      history: visit?.history || null
    } }));
  }
  function hardNavigate(visit) {
    // Swup has already recorded this destination. Replace it, avoiding a duplicate entry.
    visit.abort();
    setLoading(false);
    location.replace(visit.to.url + visit.to.hash);
  }
  function randomDestination(doc) {
    const data = doc.querySelector('script[data-oip-random]');
    if (!data) return null;
    const config = JSON.parse(data.textContent);
    const urls = Array.isArray(config.urls) ? config.urls.filter(permitted) : [];
    return urls.length ? urls[Math.floor(Math.random() * urls.length)] : config.fallback;
  }

  const swup = new window.Swup({
    containers, animationSelector: false, cache: true, timeout: 12000,
    resolveUrl,
    ignoreVisit: (url, { el } = {}) => !permitted(url) || !!el?.closest('[data-no-swup], [data-no-route], [download], [target]:not([target="_self"])')
  });
  // One owner for restoration: the page can still have its old height at popstate.
  history.scrollRestoration = 'manual';
  displayedIndex = swup.currentHistoryIndex;
  rememberScroll();

  swup.hooks.on('visit:start', visit => {
    rememberScroll();
    visit.animation.animate = false;
    visit.meta.scrollPosition = visit.history.popstate ? positions.get(history.state?.index) : null;
    setLoading(true);
  });
  swup.hooks.on('cache:set', () => {
    while (swup.cache.size > 20) swup.cache.delete(swup.cache.all.keys().next().value);
  });
  swup.hooks.on('link:anchor', (visit, { hash }) => focusContent(hash));
  swup.hooks.before('scroll:top', (visit, args) => { args.options.behavior = 'instant'; });
  swup.hooks.before('scroll:anchor', (visit, args) => {
    if (visit.from.url !== visit.to.url) args.options.behavior = 'instant';
  });
  swup.hooks.before('link:click', (visit, { event }) => {
    if (visit.to.url !== visit.from.url && resolveUrl(visit.to.url) === resolveUrl(visit.from.url)) {
      event.preventDefault();
      window.oipNavigation.updateQuery(visit.to.url + visit.to.hash);
      document.dispatchEvent(new CustomEvent('oip:query', { detail: { url: location.href } }));
      visit.ignore();
    }
  });
  swup.hooks.replace('page:load', async (visit, args, load) => {
    try {
      let page = await load(visit, args);
      // Hugo's section aliases and Random are real routes too. Follow their local
      // destination before swapping so neither creates another Bob/player instance.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const doc = new DOMParser().parseFromString(page.html, 'text/html');
        const refresh = doc.querySelector('meta[http-equiv="refresh" i]')?.content;
        const redirect = randomDestination(doc) || refresh?.match(/^\s*0\s*;\s*url\s*=\s*["']?([^"']+)["']?\s*$/i)?.[1];
        if (!redirect) return page;
        const target = new URL(redirect.trim(), new URL(page.url, location.origin));
        if (!permitted(target.href)) throw new Error('Unsupported page redirect');
        page = await swup.fetchPage(target.pathname + target.search, { visit });
      }
      throw new Error('Page redirect loop');
    } catch (error) {
      // Resolve the load hook after aborting: Swup also observes this promise
      // when parsing the destination, so a rejected fetch would be unhandled.
      if (!visit.done) {
        console.warn('Page navigation fell back to a full load:', error.message);
        hardNavigate(visit);
      }
      return { url: location.pathname + location.search, html: document.documentElement.outerHTML };
    }
  });

  async function loadStyles(doc) {
    const urls = new Set(Array.from(document.querySelectorAll('link[rel="stylesheet"]'), node => node.href));
    const pending = [];
    for (const source of doc.head.querySelectorAll('link[rel="stylesheet"]')) {
      if (urls.has(source.href)) continue;
      const link = source.cloneNode(true);
      pending.push(new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Page stylesheet timed out')), 8000);
        link.onload = () => { clearTimeout(timer); resolve(); };
        link.onerror = () => { clearTimeout(timer); reject(new Error('Page stylesheet failed')); };
        document.head.append(link);
      }));
    }
    await Promise.all(pending);
  }
  function updatePageContext(doc) {
    document.body.className = doc.body.className;
    document.documentElement.lang = doc.documentElement.lang || 'en';
    document.head.querySelectorAll(metadataSelector).forEach(node => node.remove());
    doc.head.querySelectorAll(metadataSelector).forEach(node => document.head.append(node.cloneNode(true)));
    document.querySelectorAll(configSelector).forEach(node => node.remove());
    doc.querySelectorAll(configSelector).forEach(node => document.body.append(node.cloneNode(true)));
  }
  async function loadRouteScripts(doc) {
    for (const source of doc.querySelectorAll('script[data-oip-route-script]')) {
      const key = source.dataset.oipRouteScript;
      if (source.src ? loadedScripts.has(source.src) : registeredWidgets.has(key)) continue;
      if (source.src && new URL(source.src).origin !== location.origin) throw new Error('External route script');
      const script = document.createElement('script');
      for (const attr of source.attributes) script.setAttribute(attr.name, attr.value);
      script.removeAttribute('defer');
      script.async = false;
      if (source.src) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Page controls timed out')), 10000);
          script.onload = () => { clearTimeout(timer); resolve(); };
          script.onerror = () => { clearTimeout(timer); reject(new Error('Page controls failed')); };
          document.body.append(script);
        });
        loadedScripts.add(source.src);
      } else {
        script.textContent = source.textContent;
        document.body.append(script);
      }
      registeredWidgets.add(key);
    }
  }
  function unsupportedScripts(doc) {
    return containers.some(selector => Array.from(doc.querySelectorAll(`${selector} script`)).some(script =>
      (!script.type || /^(module|text\/javascript|application\/javascript)$/.test(script.type)) &&
      !script.hasAttribute('data-oip-route-script') && !(script.src && loadedScripts.has(script.src))
    ));
  }
  swup.hooks.replace('content:replace', async (visit, args, replace) => {
    const doc = visit.to.document;
    if (!doc || containers.some(selector => !doc.querySelector(selector)) ||
        documentAssets(doc) !== criticalAssets || unsupportedScripts(doc)) {
      hardNavigate(visit);
      return;
    }
    await loadStyles(doc);
    rememberScroll();
    dispatch('oip:before-route', visit);
    replace(visit, args);
    updatePageContext(doc);
    await loadRouteScripts(doc);
    dispatch('oip:route', visit);
  });
  swup.hooks.replace('content:scroll', visit => {
    const saved = visit.meta.scrollPosition;
    if (visit.history.popstate) window.scrollTo({ left: saved?.[0] || 0, top: saved?.[1] || 0, behavior: 'instant' });
    else swup.scrollToContent(visit);
  });
  swup.hooks.on('page:view', visit => {
    displayedUrl = location.pathname + location.search;
    displayedIndex = history.state?.index || swup.currentHistoryIndex;
    // Focus after the new controls exist; preventScroll retains history/anchor position.
    focusContent(visit.to.hash);
    const announcement = document.querySelector('[data-route-announcement]');
    if (announcement) announcement.textContent = document.title;
    rememberScroll();
    setLoading(false);
    dispatch('oip:after-route', visit);
  });
  swup.hooks.on('visit:abort', () => setLoading(false));
  swup.hooks.replace('visit:fail', (visit, { error }) => {
    console.warn('Page navigation fell back to a full load:', error.message);
    hardNavigate(visit);
  });

  window.addEventListener('scroll', () => {
    if (scrollFrame || swup.navigating) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = null; if (!swup.navigating) rememberScroll(); });
  }, { passive: true });
  window.addEventListener('popstate', () => {
    if (resolveUrl(location.href) !== resolveUrl(displayedUrl)) return;
    // Library query changes are handled by its mounted controller, without a swap.
    displayedUrl = location.pathname + location.search;
    displayedIndex = history.state?.index || swup.currentHistoryIndex;
    swup.currentHistoryIndex = displayedIndex;
    swup.location = new swup.location.constructor(location.href);
    const saved = positions.get(displayedIndex);
    if (saved) requestAnimationFrame(() => window.scrollTo({ left: saved[0], top: saved[1], behavior: 'instant' }));
  });
  window.addEventListener('pagehide', rememberScroll);

  window.oipNavigation = {
    navigate(url, options = {}) { swup.navigate(String(url), { ...options, animate: false }); },
    updateQuery(raw, { replace = false, state = {} } = {}) {
      if (swup.navigating) return;
      const url = new URL(raw, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname) return;
      rememberScroll();
      if (!replace) swup.currentHistoryIndex += 1;
      const path = url.pathname + url.search + url.hash;
      const next = { ...history.state, ...state, source: 'swup', url: path, index: swup.currentHistoryIndex, random: Math.random() };
      history[replace ? 'replaceState' : 'pushState'](next, '', path);
      swup.location = new swup.location.constructor(url.href);
      displayedUrl = url.pathname + url.search;
      displayedIndex = next.index;
      rememberScroll();
    }
  };
  window.oipNavigate = (url, options) => window.oipNavigation.navigate(url, options);
  document.documentElement.dataset.oipNavigation = 'ready';
  const initialRandom = randomDestination(document);
  if (initialRandom) window.oipNavigation.navigate(initialRandom, { history: 'replace' });
}());
