const test = require("node:test");
const assert = require("node:assert/strict");

test("gateway config falls back to environment variables", () => {
  process.env.STACKEDGE_FRPS_SERVICE_ID = "svc_env";
  process.env.STACKEDGE_FRPS_TOKEN = "env-token";
  process.env.STACKEDGE_FRPS_APP = "env-app";
  delete process.env.STACKEDGE_FRPS_MAX_BODY_SIZE;

  const { loadGatewayConfig } = require("../lib/config");
  const config = loadGatewayConfig();
  assert.equal(config.serviceId, "svc_env");
  assert.equal(config.token, "env-token");
  assert.equal(config.application, "env-app");
  assert.equal(config.maxBodySize, 16 * 1024 * 1024);

  delete process.env.STACKEDGE_FRPS_SERVICE_ID;
  delete process.env.STACKEDGE_FRPS_TOKEN;
  delete process.env.STACKEDGE_FRPS_APP;
});
