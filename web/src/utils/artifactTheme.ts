import {
  serializeArtifactThemeVariables,
  type ArtifactTheme,
} from "../../../src/ui/shared/artifact-theme.js";

const LEGACY_EVAL_THEME_COLORS: ReadonlyArray<readonly [RegExp, string]> = [
  [/#1e1c19/gi, "var(--bg)"],
  [/#282622/gi, "var(--surface)"],
  [/#3a3732/gi, "var(--border)"],
  [/#e8e4dd/gi, "var(--text)"],
  [/#8a8580/gi, "var(--muted)"],
  [/#d49708/gi, "var(--accent)"],
  [/#3fb950/gi, "var(--success)"],
  [/#e05553/gi, "var(--error)"],
  [/#d4a017/gi, "var(--warning)"],
  [/#(?:000000|000|ffffff|fff)\b/gi, "var(--status-text)"],
  [
    /rgba\(\s*212\s*,\s*151\s*,\s*8\s*,\s*0\.15\s*\)/gi,
    "color-mix(in srgb, var(--accent) 15%, transparent)",
  ],
  [
    /rgba\(\s*212\s*,\s*151\s*,\s*8\s*,\s*0\.1\s*\)/gi,
    "color-mix(in srgb, var(--accent) 10%, transparent)",
  ],
  [
    /rgba\(\s*212\s*,\s*151\s*,\s*8\s*,\s*0\.08\s*\)/gi,
    "color-mix(in srgb, var(--accent) 8%, transparent)",
  ],
  [
    /rgba\(\s*212\s*,\s*151\s*,\s*8\s*,\s*0\.05\s*\)/gi,
    "color-mix(in srgb, var(--accent) 5%, transparent)",
  ],
  [
    /rgba\(\s*210\s*,\s*153\s*,\s*29\s*,\s*0\.5\s*\)/gi,
    "color-mix(in srgb, var(--warning) 50%, transparent)",
  ],
  [
    /rgba\(\s*210\s*,\s*153\s*,\s*29\s*,\s*0\.15\s*\)/gi,
    "color-mix(in srgb, var(--warning) 15%, transparent)",
  ],
  [
    /rgba\(\s*224\s*,\s*85\s*,\s*83\s*,\s*0\.15\s*\)/gi,
    "color-mix(in srgb, var(--error) 15%, transparent)",
  ],
];

export function normalizeLegacyEvalTheme(html: string): string {
  if (html.includes('data-dscode-theme-contract="1"')) return html;

  return html.replace(
    /<style\b[^>]*>[\s\S]*?<\/style>|style\s*=\s*(?:"[^"]*"|'[^']*')/gi,
    (css) => LEGACY_EVAL_THEME_COLORS.reduce(
      (result, [legacyColor, variable]) => result.replace(
        legacyColor,
        variable,
      ),
      css,
    ),
  );
}

export function applyArtifactTheme(html: string, theme: ArtifactTheme): string {
  const source = html.replace(
    /<style\s+id=(?:"dscode-artifact-theme"|'dscode-artifact-theme')[^>]*>[\s\S]*?<\/style>\s*/gi,
    "",
  );
  const variables = serializeArtifactThemeVariables(theme, "    ");
  const themeStyle = `<style id="dscode-artifact-theme">
  :root {
    color-scheme: ${theme};
${variables}
  }
  html, body {
    background-color: var(--bg) !important;
    color: var(--text) !important;
  }
</style>`;

  if (/<\/head\s*>/i.test(source)) {
    return source.replace(/<\/head\s*>/i, `${themeStyle}\n</head>`);
  }
  if (/<html(?:\s[^>]*)?>/i.test(source)) {
    return source.replace(
      /<html(?:\s[^>]*)?>/i,
      (tag) => `${tag}\n<head>${themeStyle}</head>`,
    );
  }
  return `${themeStyle}\n${source}`;
}

export function prepareEvalArtifactHtml(
  html: string,
  theme: ArtifactTheme,
): string {
  return applyArtifactTheme(normalizeLegacyEvalTheme(html), theme);
}
