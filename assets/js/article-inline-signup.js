(() => {
  "use strict";

  const template = document.querySelector("[data-article-inline-signup]");
  const body = document.querySelector(".piece-body");
  if (!template || !body || !template.content.firstElementChild) return;

  const blocks = Array.from(body.children);
  if (blocks.length < 6) return;
  const lengths = blocks.map((block) => (block.textContent || "").trim().length);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total < 1200) return;

  let before = 0;
  let placement = null;
  for (let index = 0; index < blocks.length - 2; index += 1) {
    before += lengths[index];
    const ratio = before / total;
    if (index < 1 || ratio < 0.3) continue;
    if (ratio > 0.45) break;
    if (blocks[index].matches("p, ul, ol, blockquote, figure, aside")) {
      placement = blocks[index];
      break;
    }
  }
  if (placement) placement.after(template.content.firstElementChild);
})();
