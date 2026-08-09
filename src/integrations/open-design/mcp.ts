import { join } from "node:path";

import type { MCPServerConfig } from "../../mcp/types.js";
import { DEFAULT_MCP_PROTOCOL_VERSION } from "../../mcp/types.js";
import { expandOpenDesignPath } from "./config.js";
import type { ReadyOpenDesignConfig } from "./service.js";

export function createOpenDesignMcpConfig(config: ReadyOpenDesignConfig): MCPServerConfig {
  const root = expandOpenDesignPath(config.path);
  const daemonCliPath = join(root, "apps", "daemon", "src", "cli.ts");

  return {
    name: "open-design",
    description: "Open Design virtual design device",
    transport: "stdio",
    command: "npx",
    args: [
      "tsx",
      daemonCliPath,
      "mcp",
      "--daemon-url",
      `http://127.0.0.1:${config.port}`,
    ],
    preferredProtocolVersion: DEFAULT_MCP_PROTOCOL_VERSION,
    allowLegacySseFallback: true,
  };
}
