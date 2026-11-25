const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { createGateway } = require("../lib/frps/server");

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
}

function closeServer(server) {
  return new Promise(resolve => server.close(resolve));
}

async function pollOnce(port, token, wait = 5000) {
  const response = await fetch(`http://127.0.0.1:${port}/_frpc/poll?wait=${wait}`, {
    headers: { "x-stackfrp-token": token }
  });
  return response.json();
}

async function submit(port, token, requestId, result) {
  const response = await fetch(`http://127.0.0.1:${port}/_frpc/result`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-stackfrp-token": token },
    body: JSON.stringify({ requestId, ...result })
  });
  assert.equal(response.status, 200);
}

test("Vercel gateway relays a request through an authenticated pull worker", async t => {
  const serviceId = "svc_testgateway";
  const token = "test-token";
  const gateway = createGateway({ serviceId, token, application: "demo" });
  const port = await listen(gateway.server);
  t.after(async () => {
    await closeServer(gateway.server);
    await gateway.close();
  });

  const heartbeat = await pollOnce(port, token, 200);
  assert.equal(heartbeat.type, "heartbeat");
  assert.ok(heartbeat.instanceId);

  const health = await fetch(`http://127.0.0.1:${port}/_health`).then(r => r.json());
  assert.equal(health.tunnel, "connected");
  assert.equal(health.mode, "pull");

  const verify = await fetch(`http://127.0.0.1:${port}/_verify`, {
    headers: { "x-stackfrp-token": token }
  }).then(r => r.json());
  assert.equal(verify.status, "verified");

  const pendingRequest = fetch(`http://127.0.0.1:${port}/hello`);
  const request = await pollOnce(port, token);
  assert.equal(request.type, "request");
  assert.equal(request.method, "GET");
  assert.equal(request.path, "/hello");

  await submit(port, token, request.requestId, {
    status: 201,
    headers: { "content-type": "text/plain" },
    body: Buffer.from("hello").toString("base64")
  });

  const response = await pendingRequest;
  assert.equal(response.status, 201);
  assert.equal(await response.text(), "hello");
});

test("Vercel gateway shows the branded error page when the host is down", async t => {
  const gateway = createGateway({ serviceId: "svc_down", token: "token" });
  const port = await listen(gateway.server);
  t.after(async () => {
    await closeServer(gateway.server);
    await gateway.close();
  });

  const response = await fetch(`http://127.0.0.1:${port}/app`);
  assert.equal(response.status, 522);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await response.text();
  assert.match(html, /Error 522/);
  assert.match(html, /stackedge powered by frost-bit-star/);
  assert.match(html, /Frost-bit-star\/stackedge/);
});

test("Vercel gateway rejects invalid pull credentials", async t => {
  const gateway = createGateway({ serviceId: "svc_auth", token: "correct" });
  const port = await listen(gateway.server);
  t.after(async () => {
    await closeServer(gateway.server);
    await gateway.close();
  });

  const response = await fetch(`http://127.0.0.1:${port}/_frpc/poll?wait=200`, {
    headers: { "x-stackfrp-token": "wrong" }
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).status, "unauthorized");
});
