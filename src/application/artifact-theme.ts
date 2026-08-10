export const ARTIFACT_THEME_TOKENS = {
  light: {
    "--bg": "#f8f7f5",
    "--surface": "#f3f2ef",
    "--border": "#e6e4e0",
    "--text": "#2d2a26",
    "--muted": "#8a8580",
    "--accent": "#b87503",
    "--success": "#347539",
    "--error": "#9f2f2d",
    "--warning": "#8a6500",
    "--success-bg": "#edf4ed",
    "--error-bg": "#fdebec",
    "--warning-bg": "#fbf3db",
    "--user-bubble-bg": "#b87503",
    "--user-bubble-text": "#ffffff",
    "--status-text": "#ffffff",
  },
  dark: {
    "--bg": "#1e1c19",
    "--surface": "#282622",
    "--border": "#3a3732",
    "--text": "#e8e4dd",
    "--muted": "#8a8580",
    "--accent": "#c98605",
    "--success": "#5ca860",
    "--error": "#e05553",
    "--warning": "#d5a72a",
    "--success-bg": "#1a2e1a",
    "--error-bg": "#3a1a1a",
    "--warning-bg": "#3a2e10",
    "--user-bubble-bg": "#c98605",
    "--user-bubble-text": "#ffffff",
    "--status-text": "#1e1c19",
  },
} as const;

export type ArtifactTheme = keyof typeof ARTIFACT_THEME_TOKENS;

export function serializeArtifactThemeVariables(
  theme: ArtifactTheme,
  indentation = "",
): string {
  return Object.entries(ARTIFACT_THEME_TOKENS[theme])
    .map(([name, value]) => `${indentation}${name}: ${value};`)
    .join("\n");
}
