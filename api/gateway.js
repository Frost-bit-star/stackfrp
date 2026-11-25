const { createRequestHandler, createWebSocketServer } = require("../lib/frps/server");
const { TunnelConnection } = require("../lib/frps/connection-manager");

const serviceId = process.env.STACKEDGE_FRPS_SERVICE_ID;
const token = process.env.STACKEDGE_FRPS_TOKEN;
const maxBodySize = 16 * 1024 * 1024;

if (!serviceId || !token) {
  module.exports = (req, res) => {
    res.statusCode = 500;
    res.end("FRPS environment variables are missing");
  };
} else {
  const tunnel = new TunnelConnection({ serviceId, maxBodySize });
  const wss = createWebSocketServer({ serviceId, token, tunnel, maxBodySize });
  const handle = createRequestHandler({
    serviceId,
    token,
    application: process.env.STACKEDGE_FRPS_APP || "app",
    maxBodySize,
    tunnel
  });

  module.exports = (req, res) => {
    if (req.headers.upgrade && String(req.url).startsWith("/_frpc")) {
      if (!req.socket || typeof wss.handleUpgrade !== "function") {
        res.statusCode = 501;
        res.end("WebSocket upgrade is not supported by this runtime");
        return;
      }
      try {
        wss.handleUpgrade(req, req.socket, Buffer.alloc(0), socket => {
          wss.emit("connection", socket, req);
        });
        return;
      } catch (err) {
        res.statusCode = 501;
        res.end(`WebSocket upgrade failed: ${err.message}`);
        return;
      }
    }
    return handle(req, res);
  };
}
