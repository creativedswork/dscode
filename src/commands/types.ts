export interface CommandManifest {
  name: string;
  description: string;
  body: string;
  source: "user" | "project";
  path: string;
}
