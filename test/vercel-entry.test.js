const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

process.env.STACKEDGE_FRPS_SERVICE_ID = "svc_vercel_entry";
process.env.STACKEDGE_FRPS_TOKEN = "vercel-entry-token";
process.env.STACKEDGE_FRPS_APP = "demo";

const server = require("../api/gateway");

test("Vercel entrypoint exports an HTTP server with pull endpoints", async t => {
  assert.ok(server instanceof http.Server);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  t.after(() => new Promise(resolve => server.close(resolve)));

  const port = server.address().port;
  const health = await fetch(`http://127.0.0.1:${port}/_health`).then(r => r.json());
  assert.equal(health.status, "ok");
  assert.equal(health.mode, "pull");
  assert.equal(health.serviceId, "svc_vercel_entry");

  const verify = await fetch(`http://127.0.0.1:${port}/_verify`, {
    headers: { "x-stackfrp-token": "vercel-entry-token" }
  }).then(r => r.json());
  assert.equal(verify.status, "verified");

  const poll = await fetch(`http://127.0.0.1:${port}/_frpc/poll?wait=200`, {
    headers: { "x-stackfrp-token": "vercel-entry-token" }
  }).then(r => r.json());
  assert.equal(poll.type, "heartbeat");
  assert.ok(poll.instanceId);
});
