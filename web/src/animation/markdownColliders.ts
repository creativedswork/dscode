const COLLIDER_BLOCK_SELECTOR = "p,li,blockquote,th,td,h1,h2,h3,h4";
let annotationRun = 0;

export function annotateVisibleTextLines(root: HTMLElement): void {
  const runId = annotationRun++;
  const blocks = root.querySelectorAll<HTMLElement>(COLLIDER_BLOCK_SELECTOR);
  blocks.forEach((block, blockIndex) => {
    const blockId = `${runId}:${blockIndex}`;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      const textNode = node as Text;
      const parent = textNode.parentElement;
      if (
        textNode.data.length > 0
        && parent
        && !parent.closest("pre")
        && !parent.closest("[data-collider]")
        && parent.closest(COLLIDER_BLOCK_SELECTOR) === block
      ) {
        textNodes.push(textNode);
      }
      node = walker.nextNode();
    }

    textNodes.forEach((textNode) => {
      const text = textNode.data;
      const range = document.createRange();
      const segments: Array<{ start: number; end: number }> = [];
      let segmentStart = 0;
      let lineTop: number | null = null;

      for (let index = 0; index < text.length; index++) {
        range.setStart(textNode, index);
        range.setEnd(textNode, index + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        if (lineTop == null) {
          lineTop = rect.top;
        } else if (Math.abs(rect.top - lineTop) > 2) {
          segments.push({ start: segmentStart, end: index });
          segmentStart = index;
          lineTop = rect.top;
        }
      }
      segments.push({ start: segmentStart, end: text.length });

      const fragment = document.createDocumentFragment();
      segments.forEach(({ start, end }) => {
        if (end <= start) return;
        const span = document.createElement("span");
        span.dataset.collider = "text-line";
        span.dataset.colliderBlock = blockId;
        span.dataset.colliderGenerated = "true";
        span.textContent = text.slice(start, end);
        fragment.appendChild(span);
      });
      textNode.replaceWith(fragment);
    });
  });
}
