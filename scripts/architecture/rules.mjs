import { posix } from "node:path";

export const DESIGNATED_COMPOSITION_ROOTS = new Set([
  "src/bootstrap/cli-main.ts",
  "src/bootstrap/create-standard-agent-host.ts",
]);

export const SOURCE_ROOT_LAYERS = new Map([
  ["agents", "feature"],
  ["application", "application"],
  ["bootstrap", "bootstrap"],
  ["checkpoint", "persistence"],
  ["config", "feature"],
  ["context", "feature"],
  ["drivers", "adapter"],
  ["eval", "feature"],
  ["integrations", "adapter"],
  ["kernel", "kernel"],
  ["mcp", "feature"],
  ["memory", "feature"],
  ["models", "feature"],
  ["permissions", "feature"],
  ["project-files", "feature"],
  ["resources", "feature"],
  ["services", "adapter"],
  ["session", "feature"],
  ["skills", "feature"],
  ["slash-commands", "feature"],
  ["ui", "presentation"],
]);

const PERSISTENCE_FILES = new Set([
  "src/agents/process/store.ts",
  "src/session/store.ts",
]);

const PRESENTATION_FEATURE_OWNERS = [
  "src/project-files/",
  "src/slash-commands/",
];

export function normalizeSourcePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function classifySource(path) {
  const normalized = normalizeSourcePath(path);
  if (DESIGNATED_COMPOSITION_ROOTS.has(normalized)) return "bootstrap";
  if (PERSISTENCE_FILES.has(normalized)) return "persistence";
  if (!normalized.startsWith("src/")) return "external";
  const root = normalized.slice("src/".length).split("/", 1)[0];
  return SOURCE_ROOT_LAYERS.get(root) ?? "unknown";
}

export function isOwnerContract(path) {
  const normalized = normalizeSourcePath(path);
  return normalized.endsWith("/types.ts");
}

function violation(rule, from, to, detail) {
  return {
    key: `${rule}:${from}->${to}`,
    rule,
    from,
    to,
    detail,
  };
}

export function evaluateSourcePath(path) {
  const normalized = normalizeSourcePath(path);
  if (
    normalized.startsWith("src/core/")
    || normalized.startsWith("src/utils/")
  ) {
    return [violation(
      "forbidden-catch-all-root",
      normalized,
      normalized,
      "Source files must be owned by a specific Bootstrap, Kernel, Application, feature, adapter, persistence, or Presentation root.",
    )];
  }
  if (classifySource(normalized) === "unknown") {
    return [violation(
      "unknown-source-root",
      normalized,
      normalized,
      "Every top-level source root must have an explicit architecture classification.",
    )];
  }
  return [];
}

export function evaluateDependency(fromPath, toPath, importMetadata = {}) {
  const from = normalizeSourcePath(fromPath);
  const to = normalizeSourcePath(toPath);
  if (from === to || !from.startsWith("src/") || !to.startsWith("src/")) return [];
  if (DESIGNATED_COMPOSITION_ROOTS.has(from)) return [];

  const fromLayer = classifySource(from);
  const toLayer = classifySource(to);
  const usesOwnerContract = importMetadata.typeOnly === true && isOwnerContract(to);
  const usesPresentationFeature = PRESENTATION_FEATURE_OWNERS.some((prefix) =>
    to.startsWith(prefix)
  );
  const violations = [];

  if (fromLayer === "bootstrap" && fromLayer !== toLayer) {
    violations.push(violation(
      "composition-root-exact-files",
      from,
      to,
      "Only explicitly designated composition files may wire concrete layers.",
    ));
  }

  if (toLayer === "presentation" && fromLayer !== "presentation") {
    violations.push(violation(
      "no-presentation-dependency",
      from,
      to,
      "Runtime, domain, persistence, adapters, and Application must not import Presentation.",
    ));
  }

  if (
    fromLayer === "presentation"
    && !["presentation", "application", "kernel"].includes(toLayer)
    && !usesOwnerContract
    && !usesPresentationFeature
  ) {
    violations.push(violation(
      "presentation-uses-application-ports",
      from,
      to,
      "Presentation may consume only Application ports, Kernel contracts, and Presentation models.",
    ));
  }

  if (fromLayer === "kernel" && toLayer !== "kernel") {
    violations.push(violation(
      "kernel-has-no-outward-dependency",
      from,
      to,
      "Kernel facilities must not depend on outer Application, feature, adapter, or Presentation code.",
    ));
  }

  if (
    fromLayer === "application"
    && toLayer === "adapter"
    && !usesOwnerContract
  ) {
    violations.push(violation(
      "application-uses-owner-ports",
      from,
      to,
      "Application coordination must depend on owner-defined ports instead of concrete adapters.",
    ));
  }

  if (
    to === "src/agents/process/context.ts"
    && ["adapter", "persistence"].includes(fromLayer)
  ) {
    violations.push(violation(
      "infrastructure-uses-kernel-context",
      from,
      to,
      "Infrastructure must depend on the Kernel Execution Context ABI.",
    ));
  }

  return violations.sort((a, b) => a.key.localeCompare(b.key));
}

export function relativeImportTarget(fromPath, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  return normalizeSourcePath(posix.normalize(posix.join(posix.dirname(fromPath), specifier)));
}
