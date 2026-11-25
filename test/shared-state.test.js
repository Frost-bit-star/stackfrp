const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSharedTunnelState,
  readUpstashConfig,
  readRedisUrl
} = require("../lib/frps/shared-state");

const env = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-token"
};

function createFakeUpstash() {
  const values = new Map();

  const fetchImpl = async input => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const parts = url.pathname.split("/").filter(Boolean).map(part => decodeURIComponent(part));
    const command = parts.shift().toLowerCase();
    let result = null;

    if (command === "set") {
      values.set(parts[0], parts[1]);
      result = "OK";
    } else if (command === "get") {
      result = values.has(parts[0]) ? values.get(parts[0]) : null;
    } else if (command === "del") {
      result = values.delete(parts[0]) ? 1 : 0;
    } else if (command === "expire") {
      result = values.has(parts[0]) ? 1 : 0;
    } else if (command === "lpush") {
      const list = values.has(parts[0]) ? JSON.parse(values.get(parts[0])) : [];
      list.unshift(parts[1]);
      values.set(parts[0], JSON.stringify(list));
      result = list.length;
    } else if (command === "lpop") {
      const list = values.has(parts[0]) ? JSON.parse(values.get(parts[0])) : [];
      result = list.length ? list.shift() : null;
      if (list.length) values.set(parts[0], JSON.stringify(list));
      else values.delete(parts[0]);
    } else {
      throw new Error(`Unexpected command ${command}`);
    }

    return { ok: true, status: 200, json: async () => ({ result }) };
  };

  return { fetchImpl, values };
}

test("reads Redis URL and Upstash REST credentials", () => {
  assert.deepEqual(readUpstashConfig(env), {
    url: "https://example.upstash.io",
    token: "test-token"
  });
  assert.deepEqual(readUpstashConfig({ KV_REST_API_URL: "https://kv.upstash.io/", KV_REST_API_TOKEN: "kv-token" }), {
    url: "https://kv.upstash.io",
    token: "kv-token"
  });
  assert.equal(readUpstashConfig({}), null);
  assert.equal(readRedisUrl({ REDIS_URL: "redis://localhost:6379" }), "redis://localhost:6379");
  assert.equal(readRedisUrl({ REDIS_CONNECTION_STRING: "rediss://a:b@host:6380" }), "rediss://a:b@host:6380");
  assert.equal(readRedisUrl({ STACKEDGE_REDIS_URL: "redis://stack:6379" }), "redis://stack:6379");
  assert.equal(readRedisUrl({}), null);
});

test("relays a request across two gateway instances through the mailbox", async t => {
  const fake = createFakeUpstash();
  const worker = createSharedTunnelState({ serviceId: "svc-1", env, fetchImpl: fake.fetchImpl });
  const requester = createSharedTunnelState({ serviceId: "svc-1", env, fetchImpl: fake.fetchImpl });

  t.after(async () => {
    await worker.close();
    await requester.close();
  });

  await worker.touch();
  assert.equal(await requester.isOnline(), true);

  const pending = requester.relay({
    requestId: "req-1",
    method: "GET",
    path: "/asset.js",
    headers: { host: "example.test" },
    body: Buffer.alloc(0)
  });

  let request = null;
  for (let i = 0; i < 50 && !request; i++) {
    request = await worker.dequeueRequest();
    if (!request) await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(request);
  assert.equal(request.method, "GET");
  assert.equal(request.path, "/asset.js");

  await worker.setResult("req-1", {
    status: 200,
    headers: { "content-type": "application/javascript" },
    body: Buffer.from("console.log(1)").toString("base64")
  });

  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "application/javascript");
  assert.equal(response.body.toString(), "console.log(1)");
});

test("fails fast when no pull worker is registered", async t => {
  const fake = createFakeUpstash();
  const requester = createSharedTunnelState({ serviceId: "svc-2", env, fetchImpl: fake.fetchImpl });
  t.after(() => requester.close());

  await assert.rejects(
    requester.relay({
      requestId: "req-2",
      method: "GET",
      path: "/",
      headers: {},
      body: Buffer.alloc(0)
    }),
    /No FRPC tunnel connected/
  );
});
