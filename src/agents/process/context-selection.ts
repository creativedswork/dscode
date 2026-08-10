import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { isCanonicalPathWithin } from "../../kernel/path-safety.js";
import type {
  AgentProcess,
  ContextSelection,
  ContextSelectionItem,
  ContextSelectionSnapshot,
} from "./types.js";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_BYTES = 64_000;
const MAX_CONTEXT_BYTES = 256_000;

function findByProperty(value: unknown, property: string, expected: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  if ((value as Record<string, unknown>)[property] === expected) return value;
  const values = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  for (const child of values) {
    const found = findByProperty(child, property, expected);
    if (found !== undefined) return found;
  }
  return undefined;
}

function formatSelectedItem(item: ContextSelectionItem, content: string): string {
  const label = item.type === "message"
    ? `message:${item.messageId}`
    : item.type === "tool_result"
    ? `tool_result:${item.toolCallId}`
    : item.type === "file"
    ? `file:${item.path}`
    : `diff:${item.scope}`;
  return [`<selected_context_item source=${JSON.stringify(label)}>`, content, "</selected_context_item>"].join("\n");
}

export class ContextAssembler {
  async assemble(
    selection: ContextSelection,
    parent: AgentProcess,
  ): Promise<ContextSelectionSnapshot> {
    if (!selection.items.length) throw new Error("selected context requires at least one item");
    const maxBytes = selection.maxBytes ?? DEFAULT_MAX_BYTES;
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_CONTEXT_BYTES) {
      throw new Error(`selected context maxBytes must be between 1 and ${MAX_CONTEXT_BYTES}`);
    }

    const messages = parent.runtime.snapshot?.().messages ?? parent.runtimeSnapshot?.messages ?? [];
    const sections: string[] = [];
    for (const item of selection.items) {
      sections.push(formatSelectedItem(
        item,
        await this.resolveItem(item, parent, messages),
      ));
    }

    const complete = [
      "<selected_context>",
      ...sections,
      "</selected_context>",
    ].join("\n\n");
    const encoded = Buffer.from(complete, "utf8");
    let content = complete;
    let truncated = false;
    if (encoded.byteLength > maxBytes) {
      if ((selection.overflow ?? "error") === "error") {
        throw new Error(`selected context exceeds maxBytes (${encoded.byteLength} > ${maxBytes})`);
      }
      content = encoded.subarray(0, maxBytes).toString("utf8");
      truncated = true;
    }
    return Object.freeze({
      items: Object.freeze(selection.items.map((item) => Object.freeze({ ...item }))),
      content,
      digest: createHash("sha256").update(content).digest("hex"),
      bytes: Buffer.byteLength(content),
      truncated,
    }) as ContextSelectionSnapshot;
  }

  private async resolveItem(
    item: ContextSelectionItem,
    parent: AgentProcess,
    messages: unknown[],
  ): Promise<string> {
    if (item.type === "message") {
      const message = findByProperty(messages, "id", item.messageId)
        ?? findByProperty(messages, "messageId", item.messageId);
      if (!message) throw new Error(`Selected message is not visible: ${item.messageId}`);
      return JSON.stringify(message, null, 2);
    }
    if (item.type === "tool_result") {
      const result = findByProperty(messages, "toolCallId", item.toolCallId)
        ?? findByProperty(messages, "tool_call_id", item.toolCallId);
      if (!result) throw new Error(`Selected tool result is not visible: ${item.toolCallId}`);
      return JSON.stringify(result, null, 2);
    }
    if (item.type === "file") {
      const path = resolve(parent.context.cwd, item.path);
      if (!isCanonicalPathWithin(parent.context.cwd, path)) {
        throw new Error(`Selected file is outside parent cwd: ${item.path}`);
      }
      const content = await readFile(path, "utf8");
      if (item.lineStart === undefined && item.lineEnd === undefined) return content;
      const start = item.lineStart ?? 1;
      const end = item.lineEnd ?? Number.MAX_SAFE_INTEGER;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        throw new Error(`Invalid selected file range: ${item.path}`);
      }
      return content.split("\n").slice(start - 1, end).join("\n");
    }

    let commit: string | undefined;
    if (item.scope === "commit") {
      if (!item.ref) throw new Error("commit diff selection requires ref");
      if (item.ref.startsWith("-")) {
        throw new Error("commit diff ref cannot start with '-'");
      }
      const resolved = await execFileAsync(
        "git",
        ["rev-parse", "--verify", "--end-of-options", `${item.ref}^{commit}`],
        {
          cwd: parent.context.cwd,
          maxBuffer: 4096,
        },
      );
      commit = resolved.stdout.trim();
      if (!/^[a-f0-9]{40,64}$/i.test(commit)) {
        throw new Error(`commit diff ref did not resolve to an object ID: ${item.ref}`);
      }
    }

    const args = item.scope === "working-tree"
      ? ["diff", "--"]
      : item.scope === "staged"
      ? ["diff", "--cached", "--"]
      : ["show", "--format=", commit!, "--"];
    args.push(...(item.paths ?? []));
    const { stdout } = await execFileAsync("git", args, {
      cwd: parent.context.cwd,
      maxBuffer: MAX_CONTEXT_BYTES * 4,
    });
    return stdout;
  }
}
