(function () {
  "use strict";
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function decimalDate(year, month = 0, day = 1) {
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
    const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
    return year + (date.getTime() - start) / (end - start);
  }
  function parseDates(label) {
    const years = [...label.matchAll(/\b(?:1|2)\d{3}\b/g)];
    if (!years.length) return [];
    const points = [];
    years.forEach((match, index) => {
      const previous = index ? years[index - 1].index + 4 : 0;
      const prefix = label.slice(previous, match.index);
      const months = [...prefix.matchAll(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s*(\d{1,2})?/gi)];
      if (!months.length) points.push(Number(match[0]));
      else months.forEach(m => points.push(decimalDate(Number(match[0]), monthNames.indexOf(m[1].slice(0, 3).toLowerCase()), m[2] ? Number(m[2]) : 1)));
    });
    if (points.some(x => x === null)) return [];
    return [...new Set(points)].sort((a, b) => a - b);
  }
  function positionAt(value, points) {
    if (value <= points[0].date) return points[0].y;
    for (let i = 1; i < points.length; i++) {
      if (value <= points[i].date) {
        const previous = points[i - 1], next = points[i];
        return previous.y + (value - previous.date) / (next.date - previous.date) * (next.y - previous.y);
      }
    }
    return points[points.length - 1].y;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { parseDates, decimalDate, positionAt };
  if (typeof document === "undefined") return;

  const ns = "http://www.w3.org/2000/svg";
  function svgNode(tag, attributes, text) {
    const node = document.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function enhance(list, scope) {
    if (list.dataset.timelineScale) return;
    const items = [...list.children].filter(e => e.tagName === "LI");
    const dates = items.map(e => parseDates(e.querySelector('.piece-timeline__date, .timeline-date')?.textContent || ""));
    if (!items.length || dates.some(d => !d.length)) return;
    const means = dates.map(d => d.reduce((a, b) => a + b, 0) / d.length);
    if (means.some((d, i) => i && d < means[i - 1])) return;
    list.dataset.timelineScale = "true";
    const rail = list.parentElement;
    rail.classList.add('timeline-scale-rail');
    list.classList.add('timeline-scale-ready');
    const svg = svgNode('svg', { class: 'timeline-scale-axis', 'aria-hidden': 'true', focusable: 'false' });
    list.prepend(svg);
    const start = Math.floor(Math.min(...dates.flat()));
    const last = Math.floor(Math.max(...dates.flat()));
    let frame = 0, disposed = false;
    function draw() {
      frame = 0;
      if (disposed || !list.isConnected || list.clientWidth < 100) return;
      const bounds = list.getBoundingClientRect();
      const height = bounds.height;
      const anchors = items.map((item, i) => {
        const heading = item.querySelector('.piece-timeline__date, .timeline-date');
        const rect = heading.getBoundingClientRect();
        const center = parseFloat(getComputedStyle(heading).lineHeight) / 2 || 10;
        return { date: means[i], y: rect.top - bounds.top + center };
      });
      // Keep the existing editorial spacing. Interpolate years only within
      // each gap; a date range is anchored at its midpoint.
      const points = [...anchors];
      if (start < points[0].date) points.unshift({ date: start, y: 0 });
      points.push({ date: last + 1, y: height });
      svg.replaceChildren();
      svg.setAttribute('viewBox', `0 0 18 ${height}`);
      svg.setAttribute('width', '18');
      svg.setAttribute('height', String(height));
      const firstY = positionAt(start, points);
      const finalY = anchors[anchors.length - 1].y;
      svg.append(svgNode('line', { x1: 1, y1: firstY, x2: 1, y2: finalY, class: 'timeline-scale-spine' }));
      for (let year = start; year <= last; year++) {
        const y = positionAt(year, points);
        svg.append(svgNode('line', { x1: 1, y1: y, x2: 6, y2: y, class: 'timeline-scale-year', 'data-year': year }));
      }
      anchors.forEach(point => {
        svg.append(svgNode('line', { x1: 1, y1: point.y, x2: 14, y2: point.y, class: 'timeline-scale-event', 'data-date-value': point.date }));
      });
      list.dataset.timelineStart = String(start);
      list.dataset.timelineEnd = String(last);
      list.dataset.timelineAnnualTicks = String(last - start + 1);
    }
    function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(draw); }
    const observer = new ResizeObserver(schedule);
    observer.observe(list);
    items.forEach(item => observer.observe(item));
    window.addEventListener('resize', schedule);
    document.fonts?.ready.then(schedule);
    if (scope?.cleanup) scope.cleanup(() => { disposed = true; observer.disconnect(); window.removeEventListener('resize', schedule); if (frame) cancelAnimationFrame(frame); });
    schedule();
  }
  function mount(scope) { document.querySelectorAll('.piece-timeline__entries, .timeline-entries').forEach(list => enhance(list, scope)); }
  if (window.oipRegisterRouteWidget) window.oipRegisterRouteWidget('timeline-scale', mount);
  else mount();
  document.addEventListener('oip:timeline-ready', () => mount());
}());
