const test = require("node:test");
const assert = require("node:assert/strict");
const { renderErrorPage } = require("../lib/error-page");

test("error page keeps the requested design and branding", () => {
  const html = renderErrorPage({
    code: 522,
    title: "Connection timed out",
    message: "Host <offline> now",
    requestId: "abc-123",
    host: "demo.vercel.app",
    ip: "127.0.0.1"
  });

  assert.match(html, /stackedge powered by frost-bit-star/);
  assert.match(html, /Error 522/);
  assert.match(html, /Connection timed out/);
  assert.match(html, /demo\.vercel\.app/);
  assert.match(html, /abc-123/);
  assert.match(html, /https:\/\/github\.com\/Frost-bit-star\/stackedge/);
  assert.match(html, /Host &lt;offline&gt; now/);
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
  assert.match(html, /border-b-\[#dcdcdc\]/);
  assert.match(html, /bg-\[#bd2426\]/);
});
