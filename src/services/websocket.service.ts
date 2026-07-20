import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { verifyToken } from "./token.service";
import { tokenTypes } from "../config/token";
import logger from "../utils/logger";

// ── Types ────────────────────────────────────────────────────────────────────

interface AuthMessage {
  type: "auth";
  token: string;
}

interface IncomingMessage {
  type: string;
  token?: string;
}

// ── WebSocket Manager ────────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;

/**
 * Connected clients keyed by userId.  A user may have multiple open sockets
 * (multiple tabs/devices), so each value is a Set.
 */
const clientsByUserId = new Map<string, Set<WebSocket>>();

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Initialize the WebSocket server and attach it to the given HTTP server.
 * The server listens on the "/ws" path.
 *
 * Connection lifecycle:
 *  1. Client connects to ws://host/ws
 *  2. Client must send an auth message { type: "auth", token } within 10s
 *  3. Server verifies the JWT and registers the socket under the user's id
 *  4. Server pushes notifications via broadcast(userId, payload)
 *  5. Heartbeat ping/pong every 30s removes dead connections
 */
export function initializeWebSocket(server: HttpServer): void {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    let authenticatedUserId: string | null = null;
    let authTimedOut = false;

    logger.debug("[WebSocket] New connection pending authentication");

    // ── Auth timeout: disconnect if no auth message within 10s ──
    const authTimer = setTimeout(() => {
      if (!authenticatedUserId) {
        authTimedOut = true;
        logger.warn("[WebSocket] Connection closed — auth timeout");
        try {
          ws.send(JSON.stringify({ type: "error", message: "Authentication timeout" }));
        } catch {
          // socket already closing
        }
        ws.close(4001, "Authentication timeout");
      }
    }, 10_000);

    // ── Incoming message handler ──
    ws.on("message", async (raw: Buffer) => {
      let message: IncomingMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      // Only the auth message is processed; other messages are ignored for now.
      if (message.type !== "auth" || !message.token) {
        if (!authenticatedUserId) {
          ws.send(JSON.stringify({ type: "error", message: "Send auth message first" }));
        }
        return;
      }

      // Verify the JWT
      try {
        const payload = await verifyToken(message.token as string, tokenTypes.ACCESS);
        authenticatedUserId = payload.userId;

        clearTimeout(authTimer);

        // Register the socket under the user's id
        let sockets = clientsByUserId.get(authenticatedUserId);
        if (!sockets) {
          sockets = new Set();
          clientsByUserId.set(authenticatedUserId, sockets);
        }
        sockets.add(ws);

        logger.info(
          { userId: authenticatedUserId, totalSockets: sockets.size },
          "[WebSocket] Client authenticated",
        );

        ws.send(JSON.stringify({ type: "auth_ok" }));
      } catch (err) {
        logger.warn({ err }, "[WebSocket] Authentication failed");
        ws.send(JSON.stringify({ type: "auth_failed", message: "Invalid token" }));
        ws.close(4003, "Authentication failed");
      }
    });

    // ── Pong handler — marks the socket as alive ──
    ws.on("pong", () => {
      (ws as any).__isAlive = true;
    });

    // ── Cleanup on close ──
    ws.on("close", () => {
      clearTimeout(authTimer);
      if (authenticatedUserId) {
        const sockets = clientsByUserId.get(authenticatedUserId);
        if (sockets) {
          sockets.delete(ws);
          if (sockets.size === 0) {
            clientsByUserId.delete(authenticatedUserId);
          }
        }
        logger.debug(
          { userId: authenticatedUserId },
          "[WebSocket] Connection closed",
        );
      }
    });

    ws.on("error", (err) => {
      logger.error({ err }, "[WebSocket] Socket error");
    });
  });

  // ── Heartbeat: ping all clients every 30s, terminate dead ones ──
  const heartbeatInterval = setInterval(() => {
    wss?.clients.forEach((ws) => {
      if ((ws as any).__isAlive === false) {
        ws.terminate();
        return;
      }
      (ws as any).__isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  // Avoid keeping the Node.js process alive solely for the heartbeat timer.
  heartbeatInterval.unref();

  logger.info("[WebSocket] Server initialized on path /ws");
}

/**
 * Broadcast a notification to all connected sockets for a given user.
 * Falls back silently if the user has no active connections (the
 * notification is still persisted in the DB and retrievable via the API).
 */
export function broadcastToUser(userId: string | number, payload: unknown): void {
  const key = String(userId);
  const sockets = clientsByUserId.get(key);

  if (!sockets || sockets.size === 0) {
    return; // user not connected — notification stays in DB for later retrieval
  }

  const message = JSON.stringify({ type: "notification", data: payload });
  let delivered = 0;

  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      delivered++;
    }
  }

  logger.debug(
    { userId: key, delivered, total: sockets.size },
    "[WebSocket] Broadcast notification",
  );
}

/**
 * Gracefully close the WebSocket server and clear all connections.
 */
export function shutdownWebSocket(): Promise<void> {
  return new Promise((resolve) => {
    if (!wss) {
      return resolve();
    }

    // Close all client connections
    wss.clients.forEach((ws) => {
      ws.close(1001, "Server shutting down");
    });

    wss.close(() => {
      clientsByUserId.clear();
      wss = null;
      logger.info("[WebSocket] Server closed");
      resolve();
    });
  });
}

/**
 * Returns the count of currently connected clients (for health checks / metrics).
 */
export function getConnectedClientCount(): number {
  return wss?.clients.size ?? 0;
}
