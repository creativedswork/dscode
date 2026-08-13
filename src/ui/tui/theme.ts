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
  gray: chalk.gray,
  bgBlue: chalk.bgBlue,
  blue: chalk.blue,
  reset: chalk.reset,
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


