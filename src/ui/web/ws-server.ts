import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import type { ClientCommand, ServerEvent } from "./protocol.js";

export type MessageHandler = (client: WebSocketClient, command: ClientCommand) => void;
export type ConnectionHandler = (client: WebSocketClient) => void;

export interface WebSocketClient {
  socket: WebSocket;
  send(event: ServerEvent): void;
  close(): void;
}

/**
 * Lightweight WebSocket server wrapper.
 * Handles connections, disconnections, and message routing.
 */
export class WsServer {
  private wss!: WebSocketServer;
  private onMessage: MessageHandler = () => {};
  private onConnect: ConnectionHandler = () => {};
  private onDisconnect: ConnectionHandler = () => {};

  get onMessageHandler(): MessageHandler {
    return this.onMessage;
  }

  set onMessageHandler(handler: MessageHandler) {
    this.onMessage = handler;
  }

  set onConnectHandler(handler: ConnectionHandler) {
    this.onConnect = handler;
  }

  set onDisconnectHandler(handler: ConnectionHandler) {
    this.onDisconnect = handler;
  }

  /**
   * Attach WebSocket handling to an existing HTTP server.
   */
  attach(httpServer: Server): void {
    this.wss = new WebSocketServer({ server: httpServer, path: "/ws" });

    this.wss.on("connection", (socket: WebSocket, _req: IncomingMessage) => {
      const client = this.createClient(socket);

      // Notify connection
      try {
        this.onConnect(client);
      } catch {
        // ignore handler errors
      }

      socket.on("message", (raw) => {
        try {
          const data = JSON.parse(raw.toString()) as ClientCommand;
          this.onMessage(client, data);
        } catch {
          client.send({ type: "error", text: "Invalid message format" });
        }
      });

      socket.on("close", () => {
        try {
          this.onDisconnect(client);
        } catch {
          // ignore
        }
      });

      socket.on("error", () => {
        // Errors are handled via close event
      });
    });
  }

  /**
   * Broadcast an event to all connected clients.
   */
  broadcast(event: ServerEvent, exclude?: WebSocketClient): void {
    const data = JSON.stringify(event);
    this.wss?.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN && (!exclude || (exclude as any).socket !== ws)) {
        ws.send(data);
      }
    });
  }

  /**
   * Get the number of connected clients.
   */
  get clientCount(): number {
    return this.wss?.clients.size ?? 0;
  }

  private createClient(socket: WebSocket): WebSocketClient {
    return {
      socket,
      send: (event: ServerEvent) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(event));
        }
      },
      close: () => {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      },
    };
  }
}
