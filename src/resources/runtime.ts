import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function defaultRuntimeResourceRoot(moduleUrl = import.meta.url): string {
  const modulePath = fileURLToPath(moduleUrl);
  return extname(modulePath) === ".ts"
    ? resolve(dirname(modulePath), "../../resources")
    : resolve(dirname(modulePath), "resources");
}

export function resolveRuntimeResource(...segments: string[]): string {
  return resolve(defaultRuntimeResourceRoot(), ...segments);
}

export function defaultBuiltResourceRoot(moduleUrl = import.meta.url): string {
  const modulePath = fileURLToPath(moduleUrl);
  return extname(modulePath) === ".ts"
    ? resolve(dirname(modulePath), "../../dist/resources")
    : resolve(dirname(modulePath), "resources");
}

export function resolveBuiltResource(...segments: string[]): string {
  return resolve(defaultBuiltResourceRoot(), ...segments);
}
