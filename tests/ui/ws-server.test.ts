import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { WsServer } from "../../src/ui/web/ws-server.js";

function connect(url: string, origin: string): Promise<WebSocket> {
  const socket = new WebSocket(url, { origin });
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      reject(new Error(`HTTP ${response.statusCode}`));
    });
  });
}

describe("WebSocket control-plane authentication", () => {
  it("requires both a capability token and loopback Origin", async () => {
    const httpServer = createServer();
    new WsServer({ token: "test-token" }).attach(httpServer);
    httpServer.listen(0, "127.0.0.1");
    await once(httpServer, "listening");
    const { port } = httpServer.address() as AddressInfo;
    const endpoint = `ws://127.0.0.1:${port}/ws`;
    const origin = `http://127.0.0.1:${port}`;

    try {
      await expect(connect(endpoint, origin)).rejects.toThrow("HTTP 401");
      await expect(connect(
        `${endpoint}?token=test-token`,
        "https://attacker.example",
      )).rejects.toThrow("HTTP 401");

      const socket = await connect(`${endpoint}?token=test-token`, origin);
      expect(socket.readyState).toBe(WebSocket.OPEN);
      socket.close();
      await once(socket, "close");
    } finally {
      httpServer.close();
      await once(httpServer, "close");
    }
  });
});
