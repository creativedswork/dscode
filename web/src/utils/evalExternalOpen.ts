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
  objectUrlApi: EvalObjectUrlApi = URL,
  opener: EvalWindowOpener = window.open.bind(window),
): string {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const objectUrl = objectUrlApi.createObjectURL(blob);
  opener(objectUrl, "_blank", "noopener,noreferrer");
  return objectUrl;
}
