const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const WebSocket = require("ws");
const { once } = require("node:events");

process.env.STACKEDGE_FRPS_SERVICE_ID = "svc_vercel_entry";
process.env.STACKEDGE_FRPS_TOKEN = "vercel-entry-token";
process.env.STACKEDGE_FRPS_APP = "demo";

const server = require("../api/gateway");
const { encodeJson, decodeFrame, register } = require("../lib/shared/protocol");

test("Vercel entrypoint exports an HTTP server that accepts FRPC upgrades", async t => {
  assert.ok(server instanceof http.Server);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  t.after(() => new Promise(resolve => server.close(resolve)));

  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/_frpc`);
  await once(ws, "open");

  ws.send(encodeJson(register("svc_vercel_entry", "vercel-entry-token", "demo")));
  const [data] = await once(ws, "message");
  const frame = decodeFrame(data);

  assert.equal(frame.message.type, "registered");
  assert.equal(frame.message.serviceId, "svc_vercel_entry");

  ws.close();
});
