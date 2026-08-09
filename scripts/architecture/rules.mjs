import { posix } from "node:path";

export const DESIGNATED_COMPOSITION_ROOTS = new Set([
  "src/core/main.ts",
  "src/bootstrap/cli-main.ts",
  "src/bootstrap/create-standard-agent-host.ts",
]);

const PERSISTENCE_FILES = new Set([
  "src/agents/process/store.ts",
  "src/session/store.ts",
]);

export function normalizeSourcePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function classifySource(path) {
  const normalized = normalizeSourcePath(path);
  if (DESIGNATED_COMPOSITION_ROOTS.has(normalized)) return "bootstrap";
  if (normalized.startsWith("src/bootstrap/")) return "bootstrap";
  if (normalized.startsWith("src/kernel/")) return "kernel";
  if (normalized.startsWith("src/ui/")) return "presentation";
  if (PERSISTENCE_FILES.has(normalized) || normalized.startsWith("src/checkpoint/")) {
    return "persistence";
  }
  if (
    normalized.startsWith("src/drivers/")
    || normalized.startsWith("src/integrations/")
    || normalized.startsWith("src/services/")
  ) {
    return "adapter";
  }
  if (
    normalized.startsWith("src/core/")
    || normalized.startsWith("src/application/")
  ) {
    return "application";
  }
  if (normalized.startsWith("src/")) return "feature";
  return "external";
}

export function isOwnerContract(path) {
  const normalized = normalizeSourcePath(path);
  return normalized.endsWith("/types.ts")
    && normalized !== "src/core/types.ts";
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

export function evaluateDependency(fromPath, toPath) {
  const from = normalizeSourcePath(fromPath);
  const to = normalizeSourcePath(toPath);
  if (from === to || !from.startsWith("src/") || !to.startsWith("src/")) return [];
  if (DESIGNATED_COMPOSITION_ROOTS.has(from)) return [];

  const fromLayer = classifySource(from);
  const toLayer = classifySource(to);
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
    && !isOwnerContract(to)
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
    && !isOwnerContract(to)
  ) {
    violations.push(violation(
      "application-uses-owner-ports",
      from,
      to,
      "Application coordination must depend on owner-defined ports instead of concrete adapters.",
    ));
  }

  if (to === "src/core/types.ts" && from !== to) {
    violations.push(violation(
      "no-core-type-bag",
      from,
      to,
      "Production modules must import contracts from their semantic owner.",
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
