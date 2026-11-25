const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const WebSocket = require("ws");
const { createGateway } = require("../lib/frps/server");
const {
  FRAME_REQUEST_BODY,
  FRAME_RESPONSE_BODY,
  decodeFrame,
  encodeBody,
  encodeJson,
  register
} = require("../lib/shared/protocol");

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
}

function waitFor(emitter, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    emitter.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

function nextFrame(socket, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for frame"));
    }, timeoutMs);
    function onMessage(data) {
      const frame = decodeFrame(data);
      if (!predicate(frame)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(frame);
    }
    socket.on("message", onMessage);
  });
}

test("Vercel gateway relays a request over an authenticated tunnel", async t => {
  const serviceId = "svc_testgateway";
  const token = "test-token";
  const gateway = createGateway({ serviceId, token, application: "demo" });
  const port = await listen(gateway.server);
  t.after(() => gateway.close());

  const socket = new WebSocket(`ws://127.0.0.1:${port}/_frpc`);
  await waitFor(socket, "open");
  socket.send(encodeJson(register(serviceId, token, "demo")));

  const registration = await nextFrame(socket, frame => frame.kind === "json");
  assert.equal(registration.message.type, "registered");

  const health = await fetch(`http://127.0.0.1:${port}/_health`).then(r => r.json());
  assert.equal(health.tunnel, "connected");

  const verify = await fetch(`http://127.0.0.1:${port}/_verify`, {
    headers: { "x-stackfrp-token": token }
  }).then(r => r.json());
  assert.equal(verify.status, "verified");

  const requestFramePromise = nextFrame(
    socket,
    frame => frame.kind === "json" && frame.message.type === "request"
  );
  const requestBodyPromise = nextFrame(
    socket,
    frame => frame.kind === "body" && frame.type === FRAME_REQUEST_BODY
  );
  const pendingRequest = fetch(`http://127.0.0.1:${port}/hello`);
  const request = await requestFramePromise;
  const requestBody = await requestBodyPromise;
  assert.equal(request.message.method, "GET");
  assert.equal(request.message.path, "/hello");
  assert.equal(requestBody.body.length, 0);

  socket.send(encodeJson({
    type: "response",
    requestId: request.message.requestId,
    status: 201,
    headers: { "content-type": "text/plain" },
    bodyLength: 5
  }));
  socket.send(encodeBody(FRAME_RESPONSE_BODY, request.message.requestId, Buffer.from("hello")));

  const response = await pendingRequest;
  assert.equal(response.status, 201);
  assert.equal(await response.text(), "hello");

  socket.terminate();
});

test("Vercel gateway shows the branded error page when the host is down", async t => {
  const gateway = createGateway({ serviceId: "svc_down", token: "token" });
  const port = await listen(gateway.server);
  t.after(() => gateway.close());

  const response = await fetch(`http://127.0.0.1:${port}/app`);
  assert.equal(response.status, 522);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await response.text();
  assert.match(html, /Error 522/);
  assert.match(html, /stackedge powered by frost-bit-star/);
  assert.match(html, /Frost-bit-star\/stackedge/);
});

test("Vercel gateway rejects invalid registration credentials", async t => {
  const gateway = createGateway({ serviceId: "svc_auth", token: "correct" });
  const port = await listen(gateway.server);
  t.after(() => gateway.close());

  const socket = new WebSocket(`ws://127.0.0.1:${port}/_frpc`);
  await waitFor(socket, "open");
  socket.send(encodeJson(register("svc_auth", "wrong", "demo")));

  const reply = await nextFrame(socket, frame => frame.kind === "json");
  assert.equal(reply.message.type, "error");
  assert.equal(reply.message.code, "unauthorized");
  socket.terminate();
});
