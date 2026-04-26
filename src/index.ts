import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { Agent, type AgentTool } from "@mariozechner/pi-agent-core";
import { Type, getModel, streamSimple } from "@mariozechner/pi-ai";

// ---------- load .env (best-effort, no dep) ----------
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(projectRoot, ".env");
if (existsSync(envPath)) {
	for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
		if (!match || line.trim().startsWith("#")) continue;
		const [, key, rawValue] = match;
		if (process.env[key] !== undefined) continue;
		process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
	}
}

if (!process.env.DEEPSEEK_API_KEY) {
	console.error("Missing DEEPSEEK_API_KEY. Copy .env.example to .env and fill it in.");
	process.exit(1);
}

// ---------- sample tool: get_time ----------
const timeParams = Type.Object({
	timezone: Type.Optional(
		Type.String({
			description: "IANA timezone name, e.g. 'Asia/Shanghai'. Defaults to the system timezone.",
		}),
	),
});

const getTimeTool: AgentTool<typeof timeParams> = {
	name: "get_time",
	label: "Current time",
	description: "Return the current date and time. Optionally accepts an IANA timezone.",
	parameters: timeParams,
	execute: async (_id, { timezone }) => {
		const now = new Date();
		const formatted = timezone
			? new Intl.DateTimeFormat("en-CA", {
					dateStyle: "full",
					timeStyle: "long",
					timeZone: timezone,
				}).format(now)
			: now.toString();
		return {
			content: [{ type: "text", text: formatted }],
			details: { iso: now.toISOString(), timezone: timezone ?? null },
		};
	},
};

// ---------- pick DeepSeek model ----------
type DeepSeekModelId = "deepseek-v4-flash" | "deepseek-v4-pro";
const requested = (process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash") as DeepSeekModelId;
if (requested !== "deepseek-v4-flash" && requested !== "deepseek-v4-pro") {
	console.error(`Unknown DEEPSEEK_MODEL='${requested}'. Use 'deepseek-v4-flash' or 'deepseek-v4-pro'.`);
	process.exit(1);
}
const model = getModel("deepseek", requested);

// ---------- agent ----------
const agent = new Agent({
	initialState: {
		systemPrompt:
			"You are a concise, helpful assistant. Call tools when they materially help. Answer in the user's language.",
		model,
		tools: [getTimeTool],
		thinkingLevel: requested === "deepseek-v4-pro" ? "medium" : "off",
	},
	streamFn: streamSimple,
});

// ---------- render stream to stdout ----------
const dim = (s: string) => `\x1b[90m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

agent.subscribe((event) => {
	if (event.type === "message_update") {
		const ev = event.assistantMessageEvent;
		switch (ev.type) {
			case "thinking_start":
				process.stdout.write(dim("\n[thinking] "));
				break;
			case "thinking_delta":
				process.stdout.write(dim(ev.delta));
				break;
			case "thinking_end":
				process.stdout.write("\n");
				break;
			case "text_delta":
				process.stdout.write(ev.delta);
				break;
		}
	} else if (event.type === "tool_execution_start") {
		process.stdout.write(cyan(`\n[tool] ${event.toolName}(${JSON.stringify(event.args)})\n`));
	} else if (event.type === "tool_execution_end") {
		const first = event.result?.content?.[0];
		const preview = first?.type === "text" ? first.text.slice(0, 160) : "(non-text)";
		process.stdout.write(cyan(`[tool result] ${preview}\n`));
	}
});

// ---------- REPL ----------
console.log(bold(`DeepSeek × pi-agent-core demo`) + `  ${dim(`(${model.name})`)}`);
console.log(dim("Type a message. 'exit' / Ctrl+C to quit. '/reset' clears history.\n"));

const rl = createInterface({ input: process.stdin, output: process.stdout });

const shutdown = () => {
	rl.close();
	process.exit(0);
};
process.on("SIGINT", shutdown);

try {
	while (true) {
		const raw = await rl.question(`${green("you ›")} `);
		const line = raw.trim();
		if (!line) continue;
		if (line === "exit" || line === "quit") break;
		if (line === "/reset") {
			agent.reset();
			console.log(dim("(conversation reset)\n"));
			continue;
		}

		process.stdout.write(`${magenta("ds ›")} `);
		try {
			await agent.prompt(line);
		} catch (err) {
			console.error(`\n[error] ${err instanceof Error ? err.message : String(err)}`);
		}
		process.stdout.write("\n\n");
	}
} finally {
	rl.close();
}
