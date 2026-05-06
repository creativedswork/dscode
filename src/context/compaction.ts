import { estimateMessagesTokens } from "./estimator.js";

export function dropOldest(messages: unknown[], budget: number, minRetain: number): unknown[] {
  let current = [...messages];
  while (estimateMessagesTokens(current) > budget && current.length > minRetain) {
    current = current.slice(2); // drop user+assistant pair
  }
  return current;
}

export function slidingWindow(messages: unknown[], maxMessages: number): unknown[] {
  if (messages.length <= maxMessages) return messages;
  return messages.slice(-maxMessages);
}
