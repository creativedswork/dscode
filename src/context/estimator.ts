export function estimateTokens(text: string): number {
  const cjkCount = (text.match(/[一-鿿぀-ゟ゠-ヿ가-힯]/g) ?? []).length;
  const total = text.length;
  if (total === 0) return 0;

  const cjkRatio = cjkCount / total;
  const divisor = 3.5 * (1 - cjkRatio) + 2.5 * cjkRatio;
  return Math.ceil(total / divisor);
}

export function estimateMessagesTokens(messages: unknown[]): number {
  let total = 0;
  for (const msg of messages) {
    const content = (msg as any)?.content;
    if (typeof content === "string") {
      total += estimateTokens(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === "text" && typeof block.text === "string") {
          total += estimateTokens(block.text);
        }
      }
    }
    total += 4; // message framing overhead
  }
  return total;
}
