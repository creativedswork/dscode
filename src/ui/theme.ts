import chalk from "chalk";
import type { MarkdownTheme, EditorTheme, SelectListTheme } from "@earendil-works/pi-tui";

export const c = {
  dim: chalk.dim,
  cyan: chalk.cyan,
  green: chalk.green,
  red: chalk.red,
  yellow: chalk.yellow,
  magenta: chalk.magenta,
  bold: chalk.bold,
  white: chalk.white,
  blue: chalk.blue,
  reset: chalk.reset,
  bgBlack: chalk.bgBlack,
};

export const markdownTheme: MarkdownTheme = {
  heading: (s) => c.bold(s),
  link: (s) => c.cyan.underline(s),
  linkUrl: (s) => c.dim(s),
  code: (s) => c.yellow(s),
  codeBlock: (s) => c.dim(s),
  codeBlockBorder: (s) => c.dim(s),
  quote: (s) => c.dim(s),
  quoteBorder: (s) => c.dim(s),
  hr: (s) => c.dim(s),
  listBullet: (s) => c.dim(s),
  bold: (s) => c.bold(s),
  italic: (s) => chalk.italic(s),
  strikethrough: (s) => chalk.strikethrough(s),
  underline: (s) => chalk.underline(s),
};

export const selectListTheme: SelectListTheme = {
  selectedPrefix: (s) => c.cyan(s),
  selectedText: (s) => s,
  description: (s) => c.dim(s),
  scrollInfo: (s) => c.dim(s),
  noMatch: (s) => c.dim(s),
};

export const editorTheme: EditorTheme = {
  borderColor: c.dim,
  selectList: selectListTheme,
};

export const TIPS = [
  "Tip: Use /help to see all available commands.",
  "Tip: Use /reset to clear conversation history.",
  "Tip: Use /session save to save your current session.",
  "Tip: Use /session list to see all saved sessions.",
  "Tip: Use /memory add <content> to store a memory.",
  "Tip: Use /skills list to see available skills.",
  "Tip: Use /cost to check token usage.",
  "Tip: Use /compact to force context compaction.",
  "Tip: Press Ctrl+C or Tab to abort the current response.",
  "Tip: Type exit or quit to leave.",
  "Tip: Use /drivers to list all loaded drivers.",
  "Tip: Use /permissions to see session permission grants.",
  "Tip: Use /session load <id> to restore a previous session.",
  "Tip: Use /memory list to see all stored memories.",
  "Tip: Use /skills activate <name> to enable a skill.",
  "Tip: Use /skills deactivate <name> to disable a skill.",
];

export function randomTip(): string {
  return TIPS[Math.floor(Math.random() * TIPS.length)];
}
