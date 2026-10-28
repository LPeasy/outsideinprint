(function () {
  'use strict';
  window.oipRegisterRouteWidget('music-page', function (scope) {
    const page = document.querySelector('[data-music-page]');
    if (!page) return;
    const choices = Array.from(page.querySelectorAll('[data-music-album]'));
    const panels = Array.from(page.querySelectorAll('[data-music-panel]'));
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

    function setText(node, value) {
      if (node.textContent !== value) node.textContent = value;
    }
    function chooseAlbum(id) {
      choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.musicAlbum === id)));
      panels.forEach(panel => { panel.hidden = panel.dataset.musicPanel !== id; });
    }
    // Browsing is independent of the playing album, including Back/Forward.
    if (choices[0]) chooseAlbum(choices[0].dataset.musicAlbum);

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
    choices.forEach(button => scope.on(button, 'click', () => chooseAlbum(button.dataset.musicAlbum)));
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
    scope.cleanup(() => { if (unsubscribe) unsubscribe(); unsubscribe = null; api = null; });
    connect();
  });
}());
