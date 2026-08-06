import type { ArtifactTheme } from "../../../src/ui/shared/artifact-theme.js";
import { prepareEvalArtifactHtml } from "./artifactTheme.js";

export interface EvalObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export type EvalWindowOpener = (
  url: string,
  target: string,
  features: string,
) => unknown;

export function openEvalDashboardHtml(
  html: string,
  theme: ArtifactTheme,
  objectUrlApi: EvalObjectUrlApi = URL,
  opener: EvalWindowOpener = window.open.bind(window),
): string {
  const themedHtml = prepareEvalArtifactHtml(html, theme);
  const blob = new Blob([themedHtml], { type: "text/html;charset=utf-8" });
  const objectUrl = objectUrlApi.createObjectURL(blob);
  opener(objectUrl, "_blank", "noopener,noreferrer");
  return objectUrl;
}
