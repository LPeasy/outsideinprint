import { initialCompactState, compactTransition, compactVisible, compactPlacement, paintedCanvasBounds, paintedCanvasRect, compactNearby } from './bob-music-state.js';

export function initializeBobMusic(host, { ensureRuntime }) {
  const frame = host.querySelector('[data-bob-frame]');
  const listeners = new Set();
  let runtime, unsubscribe, presentation = initialCompactState(), typing = false, routing = false;
  let petRect, positionFrame = 0;
  let paintedCanvas = null, paintedBounds = null, lastAlphaRead = -Infinity, visiblePetRect = null;
  let pointerDocument = null, pointer = null, proximityFrame = 0;
  let state = { ready: false, playlistStatus: 'loading', tracks: [], albums: [], currentTrack: null,
    isPlaying: false, isBuffering: false, errorMessage: null, volume: .5 };
  const controls = document.createElement('section');
  controls.className = 'bob-music-compact'; controls.hidden = true;
  controls.dataset.nearby = 'false';
  controls.setAttribute('aria-label', 'JukeBob compact music controls');
  const title = document.createElement('p'); title.className = 'bob-music-compact__title'; title.id = 'bob-music-compact-title';
  controls.setAttribute('aria-describedby', title.id);
  const row = document.createElement('div'); row.className = 'bob-music-compact__buttons';
  const button = (label, text, action) => {
    const el = document.createElement('button'); el.type = 'button';
    el.setAttribute('aria-label', label); el.title = label; el.textContent = text;
    el.addEventListener('click', () => invoke(action)); row.append(el); return el;
  };
  const previous = button('Previous track', '‹', 'previous');
  const play = button('Play music', '▶', 'togglePlay');
  const next = button('Next track', '›', 'next');
  const browse = document.createElement('a'); browse.href = '/music/'; browse.textContent = '▤';
  browse.setAttribute('aria-label', 'Browse albums'); browse.title = 'Browse albums'; row.append(browse);
  const error = document.createElement('p'); error.className = 'bob-music-compact__error'; error.setAttribute('role', 'status'); error.hidden = true;
  controls.append(title, row, error); document.body.append(controls);

  function view() {
    const v = window.visualViewport;
    return { left: v?.offsetLeft || 0, top: v?.offsetTop || 0, width: v?.width || innerWidth, height: v?.height || innerHeight };
  }
  function concealed() {
    return typing || routing || document.hidden || host.dataset.obscured === 'true';
  }
  function clearNearby() {
    pointer = null; controls.dataset.nearby = 'false';
    if (proximityFrame) cancelAnimationFrame(proximityFrame);
    proximityFrame = 0;
  }
  function updateNearby() {
    proximityFrame = 0;
    if (!pointer || controls.hidden || concealed()) { controls.dataset.nearby = 'false'; return; }
    const offset = pointer.inFrame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
    const point = { x: pointer.x + offset.left, y: pointer.y + offset.top };
    const rect = controls.getBoundingClientRect();
    controls.dataset.nearby = String(compactNearby(point, visiblePetRect, { x: rect.left, y: rect.top, width: rect.width, height: rect.height }));
  }
  function rememberPointer(event, inFrame = false) {
    if (event.pointerType === 'touch') return;
    if (controls.hidden || concealed()) { clearNearby(); return; }
    pointer = { x: event.clientX, y: event.clientY, inFrame };
    if (!proximityFrame) proximityFrame = requestAnimationFrame(updateNearby);
  }
  const framePointer = event => rememberPointer(event, true);
  function bindFramePointer() {
    let next;
    try { next = frame.contentDocument; } catch { next = null; }
    if (next === pointerDocument) return;
    pointerDocument?.removeEventListener('pointermove', framePointer);
    pointerDocument?.removeEventListener('pointerleave', clearNearby);
    pointerDocument = next;
    pointerDocument?.addEventListener('pointermove', framePointer, { passive: true });
    pointerDocument?.addEventListener('pointerleave', clearNearby);
    paintedCanvas = null; paintedBounds = null; lastAlphaRead = -Infinity;
    clearNearby();
  }
  function paintedPet() {
    try {
      const canvas = frame.contentDocument?.querySelector('.pet-bob__canvas');
      if (!canvas) return null;
      if (canvas !== paintedCanvas) { paintedCanvas = canvas; paintedBounds = null; lastAlphaRead = -Infinity; }
      const now = performance.now();
      if (now - lastAlphaRead >= 100) {
        lastAlphaRead = now;
        if (canvas.width && canvas.height && canvas.width * canvas.height <= 4194304) {
          try {
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (context) paintedBounds = paintedCanvasBounds(context.getImageData(0, 0, canvas.width, canvas.height)) || paintedBounds;
          } catch { /* Retain the last valid shape during an empty/tainted frame. */ }
        }
      }
      const rect = canvas.getBoundingClientRect();
      return rect.width && rect.height ? paintedCanvasRect(paintedBounds, rect, frame.getBoundingClientRect()) : null;
    } catch { return null; }
  }
  function render() {
    const hiddenBob = !document.querySelector('[data-bob-restore]')?.hidden;
    controls.hidden = !compactVisible(presentation, { bobHidden: hiddenBob, concealed: concealed() });
    if (controls.hidden) clearNearby();
    title.textContent = state.currentTrack ? `${state.currentTrack.title} · ${state.currentTrack.artist}` : 'JukeBob';
    controls.title = title.textContent; controls.dataset.playing = String(state.isPlaying === true);
    play.textContent = state.isPlaying ? 'Ⅱ' : state.isBuffering ? '…' : '▶';
    const label = state.isPlaying ? 'Pause music' : state.isBuffering ? 'Loading music' : 'Play music';
    play.setAttribute('aria-label', label); play.title = label;
    for (const el of [previous, play, next]) el.disabled = !state.ready;
    error.hidden = !state.errorMessage; error.textContent = state.errorMessage || '';
    schedulePosition();
  }
  function position() {
    positionFrame = 0;
    if (controls.hidden) return;
    const viewport = view(); controls.style.maxWidth = `${Math.max(0, viewport.width - 24)}px`;
    const hiddenBob = !document.querySelector('[data-bob-restore]')?.hidden;
    const anchorX = parseFloat(host.style.getPropertyValue('--bob-x')) || viewport.left + viewport.width / 2;
    const anchorY = parseFloat(host.style.getPropertyValue('--bob-y')) || viewport.top + viewport.height;
    const pet = (!hiddenBob && paintedPet()) || petRect || { x: anchorX - 64, y: anchorY - 100, width: 128, height: 100 };
    visiblePetRect = hiddenBob ? null : pet;
    const restore = document.querySelector('[data-bob-restore]');
    const reservedBottom = hiddenBob && restore ? Math.max(0, viewport.top + viewport.height - restore.getBoundingClientRect().top) : 0;
    const point = compactPlacement(viewport, { width: controls.offsetWidth, height: controls.offsetHeight }, pet, hiddenBob, reservedBottom);
    controls.style.left = `${Math.round(point.left)}px`; controls.style.top = `${Math.round(point.top)}px`;
    if (!error.hidden) {
      error.style.maxWidth = `${Math.max(0, viewport.width - 24)}px`;
      error.style.maxHeight = `${Math.max(40, viewport.height - 24)}px`;
      const width = error.offsetWidth, height = error.offsetHeight;
      const desiredTop = point.top - height - 6 >= viewport.top + 12 ? point.top - height - 6 : point.top + controls.offsetHeight + 6;
      error.style.left = `${Math.max(viewport.left + 12, Math.min(point.left + controls.offsetWidth / 2 - width / 2, viewport.left + viewport.width - width - 12))}px`;
      error.style.top = `${Math.max(viewport.top + 12, Math.min(desiredTop, viewport.top + viewport.height - height - 12))}px`;
    }
    if (proximityFrame) cancelAnimationFrame(proximityFrame);
    updateNearby();
  }
  function schedulePosition() { if (!positionFrame) positionFrame = requestAnimationFrame(position); }
  function publish(value) {
    state = { ...value, ready: value.ready ?? value.playlistStatus === 'ready' };
    presentation = compactTransition(presentation, { type: 'playback', playing: state.isPlaying });
    render(); listeners.forEach(callback => callback(state));
  }
  function connect() {
    bindFramePointer();
    // A direct same-origin call retains the reader's trusted activation for play().
    let candidate;
    try { candidate = frame.contentWindow?.oipBobMusic; } catch { return; }
    if (!candidate || candidate === runtime) return;
    unsubscribe?.(); runtime = candidate;
    unsubscribe = runtime.subscribe(publish);
    document.dispatchEvent(new CustomEvent('oip:music-ready'));
  }
  function invoke(action, ...args) {
    connect();
    if (!runtime || !state.ready || typeof runtime[action] !== 'function') return false;
    // Do not queue commands or await readiness: mobile playback needs this call stack.
    return runtime[action](...args);
  }
  window.oipMusic = Object.freeze({
    getState: () => state,
    subscribe(callback) { listeners.add(callback); callback(state); return () => listeners.delete(callback); },
    playAlbum: id => invoke('playAlbum', id), playTrack: id => invoke('playTrack', id),
    play: () => invoke('play'), pause: () => invoke('pause'), togglePlay: () => invoke('togglePlay'),
    next: () => invoke('next'), previous: () => invoke('previous'), setVolume: value => invoke('setVolume', value),
  });
  document.dispatchEvent(new CustomEvent('oip:music-ready'));
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.channel !== 'oip-site-bob-v1') return;
    const data = event.data;
    if (data.type === 'music-ready' || data.type === 'ready') connect();
    if (data.type === 'cabinet-state' && typeof data.open === 'boolean') {
      presentation = compactTransition(presentation, { type: 'cabinet', open: data.open, reason: data.reason, playing: state.isPlaying }); render();
    }
    if (data.type === 'reading-typing') { typing = data.active === true; render(); }
    if (data.type === 'reading-layout' && data.petRect && [data.petRect.x,data.petRect.y,data.petRect.width,data.petRect.height].every(Number.isFinite)) { petRect = data.petRect; schedulePosition(); }
    if (data.type === 'hit-regions' && Array.isArray(data.rects) && !controls.hidden) schedulePosition();
    if (data.type === 'browse-music') {
      if (window.oipNavigate) window.oipNavigate('/music/'); else location.assign('/music/');
    }
  });
  frame.addEventListener('load', connect);
  document.addEventListener('pointermove', event => rememberPointer(event), { passive: true });
  document.addEventListener('pointerleave', clearNearby);
  window.addEventListener('blur', clearNearby);
  window.addEventListener('pagehide', clearNearby);
  new MutationObserver(render).observe(host, { attributes: true, attributeFilter: ['hidden','data-obscured','data-mode'] });
  new MutationObserver(schedulePosition).observe(host, { attributes: true, attributeFilter: ['style'] });
  new ResizeObserver(schedulePosition).observe(controls);
  window.addEventListener('resize', schedulePosition);
  window.visualViewport?.addEventListener('resize', schedulePosition);
  window.visualViewport?.addEventListener('scroll', schedulePosition);
  document.addEventListener('visibilitychange', render);
  document.addEventListener('oip:before-route', () => { routing = true; render(); });
  document.addEventListener('oip:after-route', () => { routing = false; render(); });
  window.render_bob_music_to_text = () => JSON.stringify({ ...presentation, visible: !controls.hidden, typing,
    ready: state.ready, trackId: state.currentTrack?.id, playing: state.isPlaying, buffering: state.isBuffering, error: state.errorMessage,
    nearby: controls.dataset.nearby === 'true', paintedBounds, visiblePetRect });
  ensureRuntime(); connect();
}
