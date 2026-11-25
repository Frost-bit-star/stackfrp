const test = require("node:test");
const assert = require("node:assert/strict");
const {
  encodeJson,
  decodeFrame,
  encodeBody,
  register,
  requestFrame,
  responseFrame,
  heartbeat,
  FRAME_REQUEST_BODY,
  FRAME_RESPONSE_BODY
} = require("../lib/shared/protocol");
const { generateServiceId, generateToken, safeEqual } = require("../lib/shared/auth");

test("protocol frames round-trip", () => {
  const json = register("svc_1", "secret", "app");
  const decoded = decodeFrame(encodeJson(json));
  assert.equal(decoded.kind, "json");
  assert.deepEqual(decoded.message, json);

  const id = "11111111-2222-3333-4444-555555555555";
  const body = Buffer.from("payload");
  const frame = decodeFrame(encodeBody(FRAME_REQUEST_BODY, id, body));
  assert.equal(frame.kind, "body");
  assert.equal(frame.requestId, id);
  assert.equal(frame.body.toString(), "payload");
});

test("protocol builders use version 1", () => {
  assert.equal(register("a", "b", "c").protocol, 1);
  assert.equal(heartbeat(123).timestamp, 123);
  assert.equal(requestFrame("id", "GET", "/", {}, 0).type, "request");
  assert.equal(responseFrame("id", 200, {}, 0).type, "response");
  assert.equal(FRAME_REQUEST_BODY, 2);
  assert.equal(FRAME_RESPONSE_BODY, 3);
});

test("tokens are unique and compared in constant time", () => {
  const a = generateToken();
  const b = generateToken();
  assert.notEqual(a, b);
  assert.equal(safeEqual(a, a), true);
  assert.equal(safeEqual(a, b), false);
  assert.equal(safeEqual(a, a.slice(0, 8)), false);
  assert.match(generateServiceId(), /^svc_[a-f0-9]{24}$/);
});

test("malformed frames are rejected", () => {
  assert.throws(() => decodeFrame(Buffer.alloc(0)));
  assert.throws(() => decodeFrame(Buffer.from([99])));
  assert.throws(() => decodeFrame(Buffer.from([FRAME_REQUEST_BODY])));
});
