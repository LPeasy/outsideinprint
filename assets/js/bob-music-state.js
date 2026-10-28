// Presentation state only: temporary concealment never changes dismissal.
export const initialCompactState = () => ({ hasStarted: false, dismissed: false, cabinetOpen: false });
export function compactTransition(state, event) {
  if (event.type === 'playback' && event.playing) return { ...state, hasStarted: true, dismissed: false };
  if (event.type === 'cabinet') {
    const dismiss = state.cabinetOpen && !event.open && event.reason === 'user' && !event.playing;
    return { ...state, cabinetOpen: event.open, dismissed: dismiss ? true : state.dismissed };
  }
  return state;
}
export function compactVisible(state, { bobHidden = false, concealed = false } = {}) {
  return state.hasStarted && !state.dismissed && (!state.cabinetOpen || bobHidden) && !concealed;
}

export function compactPlacement(view, size, pet, hidden = false, reservedBottom = 0) {
  const gap = 10, pad = 12;
  const clamp = (n, low, high) => Math.max(low, Math.min(n, Math.max(low, high)));
  const minX = view.left + pad, maxX = view.left + view.width - size.width - pad;
  const minY = view.top + pad, maxY = view.top + view.height - size.height - pad - reservedBottom;
  if (hidden || !pet) return { left: Math.max(minX, maxX), top: Math.max(minY, maxY) };
  const choices = [
    { left: pet.x + pet.width + gap, top: pet.y + pet.height - size.height },
    { left: pet.x - size.width - gap, top: pet.y + pet.height - size.height },
    { left: pet.x + pet.width / 2 - size.width / 2, top: pet.y - size.height - gap },
    { left: pet.x + pet.width / 2 - size.width / 2, top: pet.y + pet.height + gap },
  ];
  const fit = choices.find(p => p.left >= minX && p.left <= maxX && p.top >= minY && p.top <= maxY) || choices[2];
  return { left: clamp(fit.left, minX, maxX), top: clamp(fit.top, minY, maxY) };
}
