const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

delete process.env.STACKEDGE_FRPS_SERVICE_ID;
delete process.env.STACKEDGE_FRPS_TOKEN;
delete process.env.STACKEDGE_FRPS_APP;

const server = require("../api/gateway");

function get(port, path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path }, res => {
        const chunks = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      })
      .on("error", reject);
  });
}

test("missing config renders the branded error page", async t => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await get(server.address().port, "/");
  assert.equal(response.status, 500);
  assert.match(response.body, /Configuration missing/);
  assert.match(response.body, /stackedge powered by frost-bit-star/);
});
