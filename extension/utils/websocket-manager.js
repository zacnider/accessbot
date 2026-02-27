/**
 * WebSocket Manager for AccessBot Chrome Extension.
 * Handles connection, reconnection, keepalive, and message routing.
 */

class WebSocketManager {
  constructor() {
    this.ws = null;
    this.url = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 3000;
    this.keepaliveInterval = null;
    this.messageHandlers = new Map();
    this.sessionId = null;
  }

  /**
   * Connect to the backend WebSocket server.
   * @param {string} url - WebSocket URL (e.g., ws://localhost:8080/ws)
   */
  connect(url) {
    this.url = url;
    this._createConnection();
  }

  _createConnection() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("[WS] Connected to backend");
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this._startKeepalive();
        this._notifyHandlers("connection", { connected: true });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._routeMessage(msg);
        } catch (e) {
          console.error("[WS] Failed to parse message:", e);
        }
      };

      this.ws.onclose = (event) => {
        console.log("[WS] Disconnected:", event.code, event.reason);
        this.isConnected = false;
        this._stopKeepalive();
        this._notifyHandlers("connection", { connected: false });
        this._scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error("[WS] Error:", error);
      };
    } catch (e) {
      console.error("[WS] Connection failed:", e);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[WS] Max reconnect attempts reached");
      this._notifyHandlers("error", { message: "Connection lost" });
      return;
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this._createConnection(), delay);
  }

  _startKeepalive() {
    this._stopKeepalive();
    this.keepaliveInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "keepalive" }));
      }
    }, 20000); // 20 seconds - must be < 30s service worker timeout
  }

  _stopKeepalive() {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  _routeMessage(msg) {
    const type = msg.type;

    if (type === "session_info") {
      this.sessionId = msg.session_id;
    }

    // Notify registered handlers
    this._notifyHandlers(type, msg);
  }

  _notifyHandlers(type, data) {
    const handlers = this.messageHandlers.get(type) || [];
    handlers.forEach((handler) => {
      try {
        handler(data);
      } catch (e) {
        console.error(`[WS] Handler error for type ${type}:`, e);
      }
    });

    // Also notify wildcard handlers
    const wildcardHandlers = this.messageHandlers.get("*") || [];
    wildcardHandlers.forEach((handler) => {
      try {
        handler(type, data);
      } catch (e) {
        console.error("[WS] Wildcard handler error:", e);
      }
    });
  }

  /**
   * Register a handler for a specific message type.
   * @param {string} type - Message type (e.g., "audio", "action", "transcript")
   * @param {Function} handler - Handler function
   */
  on(type, handler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(handler);
  }

  /**
   * Send a JSON message to the backend.
   * @param {object} data - Message data
   */
  sendJSON(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Send binary data (raw audio PCM) to the backend.
   * @param {ArrayBuffer|Uint8Array} data - Binary audio data
   */
  sendBinary(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  /**
   * Send a screenshot to the backend.
   * @param {string} base64Data - Base64-encoded JPEG screenshot
   */
  sendScreenshot(base64Data) {
    this.sendJSON({
      type: "screenshot",
      data: base64Data,
    });
  }

  /**
   * Send an action result back to the backend.
   * @param {string} id - Tool call ID
   * @param {object} result - Action result data
   */
  sendActionResult(id, result) {
    this.sendJSON({
      type: "action_result",
      id: id,
      result: result,
    });
  }

  /**
   * Disconnect from the backend.
   */
  disconnect() {
    this._stopKeepalive();
    this.maxReconnectAttempts = 0; // Prevent auto-reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

// Export for service worker
if (typeof globalThis !== "undefined") {
  globalThis.WebSocketManager = WebSocketManager;
}
