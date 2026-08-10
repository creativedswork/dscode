import { useEffect, useRef, useCallback, useState } from "react";
import type { ServerEvent, ClientCommand } from "../types";

export type EventHandler = (event: ServerEvent) => void;

const TOKEN_KEY = "dscode.web.token";

function webSocketUrl(): string {
  const pageUrl = new URL(window.location.href);
  const queryToken = pageUrl.searchParams.get("token");
  if (queryToken) {
    window.sessionStorage.setItem(TOKEN_KEY, queryToken);
    pageUrl.searchParams.delete("token");
    window.history.replaceState(null, "", pageUrl);
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}/ws`);
  const token = queryToken ?? window.sessionStorage.getItem(TOKEN_KEY);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export function useWebSocket(onEvent: EventHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(webSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as ServerEvent;
        onEventRef.current(event);
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Auto-reconnect after 2s
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  const send = useCallback((command: ClientCommand) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(command));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, send };
}
