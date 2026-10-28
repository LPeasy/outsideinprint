(function () {
  'use strict';
  window.oipRegisterRouteWidget('music-page', function (scope) {
    const page = document.querySelector('[data-music-page]');
    if (!page) return;
    const choices = Array.from(page.querySelectorAll('[data-music-album]'));
    const panels = Array.from(page.querySelectorAll('[data-music-panel]'));
    const selector = page.querySelector('[data-music-selector]');
    const covers = page.querySelector('[data-music-covers]');
    const browsePrevious = page.querySelector('[data-music-browse-previous]');
    const browseNext = page.querySelector('[data-music-browse-next]');
    const selectionTitle = page.querySelector('[data-music-selection-title]');
    const selectionArtist = page.querySelector('[data-music-selection-artist]');
    const selectionCount = page.querySelector('[data-music-selection-count]');
    const selectionAnnouncement = page.querySelector('[data-music-selection-announcement]');
    const rows = Array.from(page.querySelectorAll('[data-music-track-row]'));
    const commands = Array.from(page.querySelectorAll('[data-music-command]'));
    const status = page.querySelector('[data-music-status]');
    const title = page.querySelector('[data-music-now-title]');
    const message = page.querySelector('[data-music-message]');
    const toggle = page.querySelector('[data-music-toggle]');
    const volume = page.querySelector('[data-music-volume]');
    let api = null;
    let unsubscribe = null;
    let state = { ready: false };
    let selectedIndex = 0;
    let touch = null;
    let ignoreClickUntil = 0;

    function setText(node, value) {
      if (node && node.textContent !== value) node.textContent = value;
    }
    function chooseAlbum(index, announce = true) {
      if (!choices.length) return;
      selectedIndex = Math.max(0, Math.min(choices.length - 1, index));
      const selected = choices[selectedIndex];
      const id = selected.dataset.musicAlbum;
      choices.forEach((button, position) => {
        const offset = position - selectedIndex;
        button.dataset.musicPosition = offset === 0 ? 'current' : offset === -1 ? 'left' : offset === 1 ? 'right' : offset < 0 ? 'before' : 'after';
        button.setAttribute('aria-pressed', String(offset === 0));
        button.setAttribute('aria-hidden', String(Math.abs(offset) > 1));
        button.tabIndex = offset === 0 ? 0 : -1;
      });
      panels.forEach(panel => { panel.hidden = panel.dataset.musicPanel !== id; });
      if (browsePrevious) { browsePrevious.disabled = selectedIndex === 0; browsePrevious.hidden = choices.length < 2; }
      if (browseNext) { browseNext.disabled = selectedIndex === choices.length - 1; browseNext.hidden = choices.length < 2; }
      const count = `${String(selectedIndex + 1).padStart(2, '0')} / ${String(choices.length).padStart(2, '0')}`;
      setText(selectionTitle, selected.dataset.musicAlbumTitle || '');
      setText(selectionArtist, selected.dataset.musicAlbumArtist || '');
      setText(selectionCount, count);
      if (announce) setText(selectionAnnouncement, `${selected.dataset.musicAlbumTitle || 'Album'}, ${selectedIndex + 1} of ${choices.length}.`);
    }
    // Browsing is independent of the playing album, including Back/Forward.
    chooseAlbum(0, false);
    function browseFromArrow(button, index, event) {
      const keyboardFocus = event.detail === 0 && document.activeElement === button;
      chooseAlbum(index);
      if (keyboardFocus && button.disabled && choices[selectedIndex]) choices[selectedIndex].focus({ preventScroll: true });
    }
    scope.on(browsePrevious, 'click', event => browseFromArrow(browsePrevious, selectedIndex - 1, event));
    scope.on(browseNext, 'click', event => browseFromArrow(browseNext, selectedIndex + 1, event));
    scope.on(selector, 'keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const index = event.key === 'ArrowLeft' ? selectedIndex - 1 : event.key === 'ArrowRight' ? selectedIndex + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : null;
      if (index === null || !choices.length) return;
      event.preventDefault();
      chooseAlbum(index);
      if (event.target.closest('[data-music-album]') || ((event.target === browsePrevious || event.target === browseNext) && event.target.disabled)) choices[selectedIndex].focus({ preventScroll: true });
    });
    scope.on(covers, 'touchstart', event => {
      ignoreClickUntil = 0;
      const point = event.touches.length === 1 ? event.touches[0] : null;
      touch = point ? { id: point.identifier, x: point.clientX, y: point.clientY } : null;
    }, { passive: true });
    scope.on(covers, 'touchmove', event => {
      const point = touch && event.touches.length === 1 ? event.touches[0] : null;
      if (!point || point.identifier !== touch.id || (Math.abs(point.clientY - touch.y) > 8 && Math.abs(point.clientY - touch.y) > Math.abs(point.clientX - touch.x))) touch = null;
    }, { passive: true });
    scope.on(covers, 'touchend', event => {
      const start = touch;
      touch = null;
      if (!start) return;
      const point = Array.from(event.changedTouches).find(point => point.identifier === start.id);
      if (!point) return;
      const dx = point.clientX - start.x, dy = point.clientY - start.y;
      if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
      ignoreClickUntil = Date.now() + 600;
      chooseAlbum(selectedIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
    scope.on(covers, 'touchcancel', () => { touch = null; }, { passive: true });

    function render(nextState) {
      if (!scope.active()) return;
      state = nextState || { ready: false };
      const ready = state.ready === true && state.playlistStatus === 'ready';
      const track = state.currentTrack;
      const playing = state.isPlaying === true;
      const loading = state.isBuffering === true;
      commands.forEach(button => { button.disabled = !ready; });
      setText(status, state.errorMessage ? 'Playback unavailable' : !ready ? 'Connecting to JukeBob…' : loading ? 'Loading' : playing ? 'Now playing' : state.hasStarted ? 'Paused' : 'Ready to play');
      setText(title, track ? `${track.title} · ${track.artist}` : 'Choose a track when the player is ready.');
      setText(toggle, playing ? 'Pause' : 'Play');
      toggle.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
      toggle.setAttribute('aria-pressed', String(playing));
      if (Number.isFinite(state.volume) && document.activeElement !== volume) volume.value = String(state.volume);
      rows.forEach(row => {
        const active = Boolean(track && row.dataset.musicTrackRow === track.id);
        const button = row.querySelector('[data-music-track]');
        row.classList.toggle('music-track--current', active);
        if (active) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
        button.setAttribute('aria-label', `${active && playing ? 'Pause' : 'Play'} ${button.dataset.musicTitle}`);
        setText(row.querySelector('[data-music-track-status]'), active && loading ? 'Loading…' : active && playing ? 'Playing' : active && state.hasStarted ? 'Paused' : '');
        setText(row.querySelector('[data-music-track-icon]'), active && playing ? 'Ⅱ' : '▶');
      });
      const notice = state.errorMessage || (state.playlistStatus === 'error' ? 'JukeBob could not load its music catalog. Reload the page to try again.' : state.playlistStatus === 'empty' ? 'No tracks are available.' : loading ? `Loading ${track ? track.title : 'music'}…` : playing && track ? `Playing ${track.title}.` : '');
      setText(message, notice);
    }
    function connect() {
      const next = window.oipMusic;
      if (!next || typeof next.subscribe !== 'function' || typeof next.getState !== 'function') return;
      if (api === next) { render(api.getState()); return; }
      if (unsubscribe) unsubscribe();
      api = next;
      unsubscribe = api.subscribe(render);
    }
    function invoke(method, argument) {
      if (!api || state.ready !== true || state.playlistStatus !== 'ready') return;
      // Keep the shared controller call inside this trusted event's stack.
      // In particular, do not await catalog loading or post a deferred Play.
      try {
        const result = argument === undefined ? api[method]() : api[method](argument);
        if (result && typeof result.catch === 'function') result.catch(() => {
          if (scope.active()) setText(message, 'Playback could not start. Try Play again.');
        });
      } catch (_) {
        setText(message, 'Playback could not start. Try Play again.');
      }
    }
    choices.forEach((button, index) => scope.on(button, 'click', event => {
      if (event.detail !== 0 && Date.now() < ignoreClickUntil) { event.preventDefault(); return; }
      chooseAlbum(index);
    }));
    page.querySelectorAll('[data-music-play-album]').forEach(button => scope.on(button, 'click', () => invoke('playAlbum', button.dataset.musicPlayAlbum)));
    page.querySelectorAll('[data-music-track]').forEach(button => scope.on(button, 'click', () => {
      if (state.isPlaying && state.currentTrack && state.currentTrack.id === button.dataset.musicTrack) invoke('pause');
      else invoke('playTrack', button.dataset.musicTrack);
    }));
    scope.on(toggle, 'click', () => invoke('togglePlay'));
    scope.on(page.querySelector('[data-music-previous]'), 'click', () => invoke('previous'));
    scope.on(page.querySelector('[data-music-next]'), 'click', () => invoke('next'));
    scope.on(volume, 'input', () => invoke('setVolume', Number(volume.value)));
    scope.on(document, 'oip:music-ready', connect);
    scope.cleanup(() => { if (unsubscribe) unsubscribe(); unsubscribe = null; api = null; touch = null; ignoreClickUntil = 0; });
    connect();
  });
}());
