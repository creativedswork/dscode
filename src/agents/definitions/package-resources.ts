import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { defaultRuntimeResourceRoot } from "../../resources/runtime.js";
import type { AgentApplicationSource } from "./types.js";

interface ResourceEntry {
  source?: string;
  path: string;
  mediaType: string;
  required: boolean;
  sha256?: string;
}

interface ResourceCatalog {
  schemaVersion: 1;
  entries: Record<string, ResourceEntry>;
}

interface ResourceManifest extends ResourceCatalog {
  packageName: string;
  packageVersion: string;
}

export interface BundledApplicationDocument {
  source: AgentApplicationSource;
  content: string;
  packageVersion?: string;
}

export interface BundledApplicationProvider {
  load(): Promise<BundledApplicationDocument[]>;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function safeResourcePath(root: string, path: string): string {
  const absolute = resolve(root, path);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (absolute !== root && !absolute.startsWith(prefix)) {
    throw new Error(`Resource path escapes package root: ${path}`);
  }
  return absolute;
}

function parseCatalog(raw: string, label: string): ResourceCatalog {
  const parsed = JSON.parse(raw) as Partial<ResourceCatalog>;
  if (parsed.schemaVersion !== 1 || !parsed.entries || typeof parsed.entries !== "object") {
    throw new Error(`Invalid resource catalog: ${label}`);
  }
  return parsed as ResourceCatalog;
}

export class PackageResourceProvider implements BundledApplicationProvider {
  constructor(private readonly root = defaultRuntimeResourceRoot()) {}

  async load(): Promise<BundledApplicationDocument[]> {
    const manifestPath = resolve(this.root, "manifest.json");
    const catalogPath = resolve(this.root, "catalog.json");
    const packaged = existsSync(manifestPath);
    const metadataPath = packaged ? manifestPath : catalogPath;
    if (!existsSync(metadataPath)) {
      throw new Error(`Required resource metadata does not exist: ${metadataPath}`);
    }

    const catalog = parseCatalog(await readFile(metadataPath, "utf8"), metadataPath);
    const manifest = packaged ? catalog as ResourceManifest : undefined;
    if (packaged && (!manifest?.packageName || !manifest.packageVersion)) {
      throw new Error(`Packaged resource manifest has no package identity: ${manifestPath}`);
    }

    const documents: BundledApplicationDocument[] = [];
    for (const [id, entry] of Object.entries(catalog.entries).sort(([a], [b]) => a.localeCompare(b))) {
      if (!id.startsWith("agent:")) continue;
      const path = safeResourcePath(this.root, packaged ? entry.path : (entry.source ?? entry.path));
      if (!existsSync(path)) {
        if (entry.required) throw new Error(`Required package resource does not exist: ${id}`);
        continue;
      }
      const content = await readFile(path, "utf8");
      if (packaged && (!entry.sha256 || sha256(content) !== entry.sha256)) {
        throw new Error(`Package resource integrity check failed: ${id}`);
      }
      documents.push({
        source: {
          kind: "bundled",
          path: packaged
            ? `pkg:${manifest!.packageName}@${manifest!.packageVersion}/${entry.path}`
            : path,
          packageVersion: manifest?.packageVersion,
        },
        content,
        packageVersion: manifest?.packageVersion,
      });
    }
    if (documents.length === 0) throw new Error("No bundled Agent applications found");
    return documents;
  }
}

export class DirectoryBundledApplicationProvider implements BundledApplicationProvider {
  constructor(private readonly directory: string) {}

  async load(): Promise<BundledApplicationDocument[]> {
    const files = (await readdir(this.directory))
      .filter((name) => name.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b));
    return Promise.all(files.map(async (file) => {
      const path = resolve(this.directory, file);
      return {
        source: { kind: "bundled" as const, path },
        content: await readFile(path, "utf8"),
      };
    }));
  }
}
