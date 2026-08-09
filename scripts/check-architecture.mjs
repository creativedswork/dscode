import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import {
  evaluateDependency,
  normalizeSourcePath,
  relativeImportTarget,
} from "./architecture/rules.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(root, "src");
const baselinePath = resolve(root, "scripts", "architecture", "baseline.json");

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (entry.isFile() && [".ts", ".tsx", ".mts"].includes(extname(path))) {
      files.push(path);
    }
  }
  return files.sort();
}

function moduleSpecifiers(path) {
  const text = readFileSync(path, "utf8");
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    } else if (
      ts.isImportTypeNode(node)
      && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteralLike(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return [...new Set(specifiers)].sort();
}

function resolveSourceTarget(from, specifier) {
  const fromRelative = normalizeSourcePath(relative(root, from));
  const unresolved = relativeImportTarget(fromRelative, specifier);
  if (!unresolved) return undefined;

  const extension = extname(unresolved);
  const withoutRuntimeExtension = [".js", ".mjs", ".cjs"].includes(extension)
    ? unresolved.slice(0, -extension.length)
    : unresolved;
  const candidates = [
    unresolved,
    withoutRuntimeExtension,
    `${withoutRuntimeExtension}.ts`,
    `${withoutRuntimeExtension}.tsx`,
    `${withoutRuntimeExtension}.mts`,
    `${withoutRuntimeExtension}/index.ts`,
    `${withoutRuntimeExtension}/index.tsx`,
    `${withoutRuntimeExtension}/index.mts`,
  ];

  for (const candidate of candidates) {
    const absolute = resolve(root, candidate);
    if (absolute.startsWith(`${sourceRoot}/`) && existsSync(absolute)) {
      return normalizeSourcePath(relative(root, absolute));
    }
  }
  return undefined;
}

export function collectArchitectureViolations() {
  const violations = new Map();
  for (const absoluteFrom of sourceFiles(sourceRoot)) {
    const from = normalizeSourcePath(relative(root, absoluteFrom));
    for (const specifier of moduleSpecifiers(absoluteFrom)) {
      const to = resolveSourceTarget(absoluteFrom, specifier);
      if (!to) continue;
      for (const item of evaluateDependency(from, to)) violations.set(item.key, item);
    }
  }
  return [...violations.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function readBaseline() {
  if (!existsSync(baselinePath)) {
    throw new Error(
      `Architecture baseline is missing: ${relative(root, baselinePath)}. `
      + "Run npm run architecture:baseline once after reviewing current violations.",
    );
  }
  const parsed = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (parsed.version !== 1 || !Array.isArray(parsed.violations)) {
    throw new Error(`Invalid architecture baseline: ${relative(root, baselinePath)}`);
  }
  return parsed.violations;
}

function writeBaseline(violations) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ version: 1, violations }, null, 2)}\n`,
    "utf8",
  );
}

function printViolation(prefix, item) {
  process.stderr.write(
    `${prefix} [${item.rule}] ${item.from} -> ${item.to}\n  ${item.detail}\n`,
  );
}

function main() {
  const violations = collectArchitectureViolations();
  const command = process.argv[2];
  if (command === "--write-baseline") {
    writeBaseline(violations);
    process.stdout.write(`Wrote ${violations.length} architecture baseline entries.\n`);
    return;
  }

  const baseline = readBaseline();
  const currentByKey = new Map(violations.map((item) => [item.key, item]));
  const baselineByKey = new Map(baseline.map((item) => [item.key, item]));
  const added = violations.filter((item) => !baselineByKey.has(item.key));
  const stale = baseline.filter((item) => !currentByKey.has(item.key));

  if (command === "--prune-baseline") {
    if (added.length > 0) {
      for (const item of added) printViolation("NEW", item);
      throw new Error("Refusing to prune while new architecture violations exist.");
    }
    writeBaseline(violations);
    process.stdout.write(`Pruned ${stale.length} resolved architecture baseline entries.\n`);
    return;
  }

  if (added.length === 0 && stale.length === 0) {
    process.stdout.write(
      `Architecture check passed (${violations.length} migration baseline entries).\n`,
    );
    return;
  }

  for (const item of added) printViolation("NEW", item);
  for (const item of stale) printViolation("STALE", item);
  if (stale.length > 0) {
    process.stderr.write(
      "Resolved violations must be removed with npm run architecture:baseline:prune.\n",
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
