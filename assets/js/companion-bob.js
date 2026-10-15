import { createBobStorage, claimVisit, PREFERENCES_KEY, VISITOR_KEY } from './companion-bob-visit.js';
import { initializeBobReading } from './companion-bob-reading.js';

const POSITION_KEY = 'oip-bob-position:v1';
const CHANNEL = 'oip-site-bob-v1';
const host = document.querySelector('[data-bob-companion]');
let slot = document.querySelector('[data-bob-slot]');
if (host && slot) initialize();

function initialize() {
  const frame = host.querySelector('[data-bob-frame]');
  const fallback = host.querySelector('[data-bob-fallback]');
  const bubble = host.querySelector('[data-bob-greeting]');
  const status = host.querySelector('[data-bob-status]');
  const restore = document.querySelector('[data-bob-restore]');
  const storage = createBobStorage();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let minimized = storage.read(PREFERENCES_KEY)?.hidden === true;
  let savedPosition = validPosition(storage.read(POSITION_KEY));
  let anchor = { x: 0, y: 0 };
  let ready = false;
  let painted = false;
  let active = false;
  let audioActive = !minimized;
  let suspended = false;
  let routing = false;
  let dragging = false;
  let visitReady = false;
  let visiting = false;
  let lastTouch = 0;
  let pendingOpen = false;
  let pendingOpenKeyboard = false;
  let pendingFocus = false;
  let loadTimer;
  let positioning = 0;
  let lastPlacement = '';
  let regionCount = 0;
  let pageBindings;
  const slotObserver = new ResizeObserver(schedulePosition);
  const overlayObserver = new MutationObserver(syncVisibility);
  const emptyMask = 'path("M 0 0 Z")';

  function validPosition(value) {
    return value?.version === 1 && Number.isFinite(value.x) && Number.isFinite(value.y)
      && value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1 ? value : null;
  }
  function viewport() {
    const view = window.visualViewport;
    return { width: view?.width || innerWidth, height: view?.height || innerHeight,
      left: view?.offsetLeft || 0, top: view?.offsetTop || 0 };
  }
  function clamp(point) {
    const view = viewport();
    return {
      x: Math.max(view.left + Math.min(64, view.width / 2), Math.min(point.x, view.left + view.width - Math.min(64, view.width / 2))),
      y: Math.max(view.top + Math.min(112, view.height / 2), Math.min(point.y, view.top + view.height - 12)),
    };
  }
  const obscured = () => Boolean(
    document.querySelector('dialog[open], [data-primary-nav-disclosure][open]') ||
    document.body.matches('.paper-route-open, .cartoon-lightbox-open, .home-featured-image-open')
  );
  const visible = () => !document.hidden && !suspended;
  const send = message => {
    if (ready) frame.contentWindow?.postMessage({ channel: CHANNEL, ...message }, location.origin);
  };
  function updateAnchor(point) {
    anchor = { x: Math.round(point.x), y: Math.round(point.y) };
    host.style.setProperty('--bob-x', `${anchor.x}px`);
    host.style.setProperty('--bob-y', `${anchor.y}px`);
    host.dataset.bubbleAlign = anchor.x + 95 > viewport().left + viewport().width - 8 ? 'right' : 'center';
    host.dataset.bubbleBelow = String(anchor.y < viewport().top + 155);
  }
  function position() {
    positioning = 0;
    if (dragging || !slot?.isConnected || routing) return;
    const view = viewport();
    const rect = slot.getBoundingClientRect();
    let mode, point;
    if (savedPosition) {
      mode = 'free';
      point = { x: view.left + savedPosition.x * view.width, y: view.top + savedPosition.y * view.height };
    } else {
      const docked = rect.top < view.top + 8 || rect.bottom > view.top + view.height;
      mode = docked ? 'docked' : 'masthead';
      const safeBottom = parseFloat(getComputedStyle(host).getPropertyValue('--bob-safe-bottom')) || 0;
      point = docked ? { x: view.left + view.width - 80, y: view.top + view.height - 24 - safeBottom }
        : { x: rect.left + rect.width / 2, y: rect.bottom - 5 };
    }
    host.dataset.mode = minimized ? 'hidden' : mode;
    host.dataset.docked = String(mode === 'docked');
    updateAnchor(clamp(point));
    const next = JSON.stringify(anchor);
    if (next !== lastPlacement) { send({ type: 'placement', ...anchor }); lastPlacement = next; }
  }
  function schedulePosition() {
    if (!positioning) positioning = requestAnimationFrame(position);
  }
  function dismissGreeting() {
    host.dataset.greeting = 'hidden';
    bubble.textContent = '';
  }
  async function visit(force = false) {
    if (!visitReady || !visible() || visiting || (!force && Date.now() - lastTouch < 15000)) return;
    visiting = true;
    lastTouch = Date.now();
    // Every viewport arrives sprite-only; retain visit bookkeeping silently.
    const claim = () => { claimVisit(storage); };
    try {
      if (navigator.locks?.request) await navigator.locks.request('oip-bob-visit', claim);
      else claim();
    } catch { claim(); }
    finally { visiting = false; }
  }
  function startVisit() {
    if (visitReady) return;
    visitReady = true;
    visit(true);
  }
  function applyRegions(rects) {
    if (!Array.isArray(rects) || !active || host.dataset.failed === 'true') return;
    // The frame occupies the viewport but only these actual sprite/control
    // islands participate in hit testing. Transparent page areas stay usable.
    const paths = [];
    for (const rect of rects.slice(0, 1024)) {
      if (![rect?.x, rect?.y, rect?.width, rect?.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) continue;
      const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
      const right = Math.min(innerWidth, rect.x + rect.width);
      const bottom = Math.min(innerHeight, rect.y + rect.height);
      if (right <= x || bottom <= y) continue;
      const n = value => Math.round(value * 10) / 10;
      paths.push(`M ${n(x)} ${n(y)} H ${n(right)} V ${n(bottom)} H ${n(x)} Z`);
    }
    regionCount = paths.length;
    frame.style.clipPath = paths.length ? `path("${paths.join(' ')}")` : emptyMask;
    frame.inert = !painted || !active || !paths.length;
    focusRuntime();
  }
  function focusRuntime() {
    if (!pendingFocus || frame.inert || !active) return;
    pendingFocus = false;
    frame.focus({ preventScroll: true });
    send({ type: 'focus' });
  }
  function load() {
    clearTimeout(loadTimer);
    ready = false;
    painted = false;
    lastPlacement = '';
    regionCount = 0;
    frame.inert = true;
    frame.style.clipPath = emptyMask;
    fallback.hidden = false;
    delete host.dataset.failed;
    host.dataset.painted = 'false';
    if (status) { status.hidden = true; status.textContent = ''; }
    frame.src = frame.dataset.src;
    loadTimer = setTimeout(() => fail('Bob is taking a little longer to arrive. Select Bob to try again.'), 25000);
  }
  function fail(message) {
    clearTimeout(loadTimer);
    painted = false;
    host.dataset.painted = 'false';
    frame.inert = true;
    frame.style.clipPath = emptyMask;
    regionCount = 0;
    host.dataset.failed = 'true';
    fallback.hidden = false;
    if (status) { status.textContent = message; status.hidden = false; }
    startVisit();
  }
  function syncTheme() {
    send({ type: 'theme', theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' });
  }
  function syncVisibility() {
    const covered = obscured();
    const next = visible() && !minimized && !covered;
    // Music continues through page/menu transitions and background tabs.
    // Explicit Hide and the separate Paper-Bob arcade pause at the same time.
    const nextAudio = !minimized && !suspended && !document.body.classList.contains('paper-route-open');
    host.hidden = minimized || covered;
    host.inert = !next;
    host.dataset.obscured = String(covered);
    restore.hidden = !minimized || covered;
    if (next !== active || nextAudio !== audioActive) {
      active = next;
      audioActive = nextAudio;
      if (!active) {
        frame.inert = true;
        frame.style.clipPath = emptyMask;
        regionCount = 0;
        dismissGreeting();
      }
      send({ type: 'visibility', active, audioActive });
      if (active && !frame.hasAttribute('src')) load();
    }
    schedulePosition();
  }
  function setHidden(hidden) {
    minimized = hidden;
    pendingOpen = false;
    pendingFocus = !hidden;
    storage.write(PREFERENCES_KEY, { version: 1, hidden });
    dismissGreeting();
    syncVisibility();
    if (hidden) restore.focus({ preventScroll: true });
    else if (!fallback.hidden) fallback.querySelector('button')?.focus({ preventScroll: true });
  }
  function openControls(event) {
    minimized = false;
    storage.write(PREFERENCES_KEY, { version: 1, hidden: false });
    pendingOpen = true;
    pendingOpenKeyboard = event?.detail === 0;
    pendingFocus = false;
    syncVisibility();
    if (host.dataset.failed === 'true') load();
    if (ready && painted) { send({ type: 'reveal-controls', keyboard: pendingOpenKeyboard }); pendingOpen = false; }
  }
  function home() {
    dragging = false;
    savedPosition = null;
    storage.write(POSITION_KEY, null);
    lastPlacement = '';
    position();
  }

  function bindPage() {
    pageBindings?.abort();
    pageBindings = new AbortController();
    slotObserver.disconnect();
    overlayObserver.disconnect();
    slot = document.querySelector('[data-bob-slot]');
    if (slot) {
      slotObserver.observe(slot);
      host.classList.toggle('companion-bob--compact', Boolean(slot.closest('.masthead--compressed')));
    }
    document.querySelectorAll('[data-bob-open], [data-bob-open-full]').forEach(button => {
      button.hidden = false;
      button.removeAttribute('aria-expanded');
      button.addEventListener('click', openControls, { signal: pageBindings.signal });
    });
    document.querySelectorAll('dialog, [data-primary-nav-disclosure]').forEach(element =>
      overlayObserver.observe(element, { attributes: true, attributeFilter: ['open'] }));
    lastPlacement = '';
  }
  bindPage();
  restore.addEventListener('click', () => { setHidden(false); });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.channel !== CHANNEL) return;
    const data = event.data;
    if (data.type === 'ready') {
      ready = true;
      lastPlacement = '';
      position();
      syncTheme();
      send({ type: 'visibility', active, audioActive });
    } else if (data.type === 'painted') {
      painted = true;
      host.dataset.painted = 'true';
      delete host.dataset.failed;
      fallback.hidden = true;
      if (status) status.hidden = true;
      frame.inert = !active || !regionCount;
      focusRuntime();
      clearTimeout(loadTimer);
      startVisit();
      if (pendingOpen && active) { send({ type: 'reveal-controls', keyboard: pendingOpenKeyboard }); pendingOpen = false; }
    } else if (data.type === 'hit-regions') {
      applyRegions(data.rects);
    } else if (data.type === 'position' && Number.isFinite(data.x) && Number.isFinite(data.y)) {
      dragging = data.dragging === true;
      updateAnchor(dragging ? { x: data.x, y: data.y } : clamp(data));
      host.dataset.mode = 'free';
      const view = viewport();
      savedPosition = { version: 1, x: Math.max(0, Math.min(1, (anchor.x - view.left) / view.width)),
        y: Math.max(0, Math.min(1, (anchor.y - view.top) / view.height)) };
      // Drag frames are transient; only settled placement is written to storage.
      if (!dragging) {
        storage.write(POSITION_KEY, savedPosition);
        lastPlacement = '';
        position();
      }
      dismissGreeting();
      visit();
    } else if (data.type === 'home') home();
    else if (data.type === 'hide') setHidden(true);
    else if (data.type === 'activity') { dismissGreeting(); visit(); }
    else if (data.type === 'error') fail('Bob could not load. Select Bob to try again.');
  });
  window.addEventListener('scroll', () => { schedulePosition(); visit(); }, { passive: true });
  window.addEventListener('resize', () => { lastPlacement = ''; schedulePosition(); }, { passive: true });
  window.visualViewport?.addEventListener('resize', () => { lastPlacement = ''; schedulePosition(); });
  window.visualViewport?.addEventListener('scroll', schedulePosition);
  document.fonts?.ready.then(schedulePosition);
  document.addEventListener('pointerdown', () => visit(), { passive: true });
  document.addEventListener('keydown', () => visit());
  let pointerFrame = 0, latestPointer;
  document.addEventListener('pointermove', event => {
    if (!active || !ready || event.pointerType === 'touch') return;
    latestPointer = { x: event.clientX, y: event.clientY, screenX: event.screenX, screenY: event.screenY, timestamp: event.timeStamp };
    if (!pointerFrame) pointerFrame = requestAnimationFrame(() => { pointerFrame = 0; send({ type: 'pointer', ...latestPointer }); });
  }, { passive: true });
  window.addEventListener('blur', () => send({ type: 'pointer-leave' }));
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) send({ type: 'pointer-leave' }); }, { passive: true });
  document.addEventListener('visibilitychange', () => { syncVisibility(); if (!document.hidden) visit(true); });
  window.addEventListener('pagehide', () => { suspended = true; syncVisibility(); });
  window.addEventListener('pageshow', () => { suspended = false; syncVisibility(); visit(true); });
  document.addEventListener('oip:before-route', () => {
    routing = true;
    syncVisibility();
  });
  document.addEventListener('oip:route', () => {
    bindPage();
    routing = false;
    syncTheme();
    syncVisibility();
    position();
  });
  window.addEventListener('storage', event => {
    if (event.key === PREFERENCES_KEY) { minimized = storage.read(PREFERENCES_KEY)?.hidden === true; syncVisibility(); }
    if (event.key === VISITOR_KEY) lastTouch = Date.now();
    if (event.key === POSITION_KEY && !dragging) { savedPosition = validPosition(storage.read(POSITION_KEY)); lastPlacement = ''; schedulePosition(); }
  });
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new MutationObserver(syncVisibility).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  host.dataset.ready = 'true';
  host.dataset.greeting = 'hidden';
  syncVisibility();
  position();
  window.render_bob_to_text = () => JSON.stringify({
    mode: minimized ? 'hidden' : host.dataset.mode, anchor, greeting: bubble.textContent,
    greetingState: host.dataset.greeting, ready: ready && painted, active, audioActive, routing, dragging,
    interactiveRegions: regionCount, fullLoaded: frame.hasAttribute('src'), reducedMotion: media.matches,
    coordinates: 'Viewport CSS pixels; x right, y down. Anchor is Bob’s foot center.',
  });
  if (!window.render_game_to_text) window.render_game_to_text = window.render_bob_to_text;
  if (!window.advanceTime) window.advanceTime = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  initializeBobReading(host, { onNavigate() {
    pendingOpen = false;
    pendingFocus = false;
    home();
    send({ type: 'home' });
  } });
}
