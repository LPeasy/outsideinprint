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
  const gap = 6, pad = 12;
  const clamp = (n, low, high) => Math.max(low, Math.min(n, Math.max(low, high)));
  const minX = view.left + pad, maxX = view.left + view.width - size.width - pad;
  const minY = view.top + pad, maxY = view.top + view.height - size.height - pad - reservedBottom;
  if (hidden || !pet) {
    // If a short viewport cannot fit the tower above Show Bob, use the other
    // bottom corner rather than covering that bottom-right restore control.
    if (reservedBottom && maxY < minY) return { left: minX, top: Math.max(minY, maxY + reservedBottom) };
    return { left: Math.max(minX, maxX), top: Math.max(minY, maxY) };
  }
  const alignedTop = clamp(pet.y + pet.height - size.height, minY, maxY);
  const right = pet.x + pet.width + gap, left = pet.x - size.width - gap;
  // Vertical clamping should not send a speaker away from Bob's right side.
  if (right >= minX && right <= maxX) return { left: right, top: alignedTop };
  if (left >= minX && left <= maxX) return { left, top: alignedTop };
  const choices = [
    { left: pet.x + pet.width / 2 - size.width / 2, top: pet.y - size.height - gap },
    { left: pet.x + pet.width / 2 - size.width / 2, top: pet.y + pet.height + gap },
    { left: right, top: alignedTop },
    { left, top: alignedTop },
  ];
  const bounded = choices.map(p => ({ left: clamp(p.left, minX, maxX), top: clamp(p.top, minY, maxY) }));
  const overlap = p => Math.max(0, Math.min(p.left + size.width, pet.x + pet.width) - Math.max(p.left, pet.x)) * Math.max(0, Math.min(p.top + size.height, pet.y + pet.height) - Math.max(p.top, pet.y));
  return bounded.reduce((best, point) => overlap(point) < overlap(best) ? point : best);
}
