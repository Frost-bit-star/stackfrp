# stackfrp

The Vercel gateway for Stackedge apps.

<div align="center">

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FFrost-bit-star%2Fstackfrp)

[![Vercel gateway](https://img.shields.io/badge/Vercel-gateway-000000?logo=vercel&logoColor=white)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FFrost-bit-star%2Fstackfrp)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Protocol](https://img.shields.io/badge/protocol-v1-6f42c1)](https://github.com/Frost-bit-star/stackfrp/blob/main/lib/shared/protocol.js)
[![Issues](https://img.shields.io/badge/issues-stackedge-blue?logo=github)](https://github.com/Frost-bit-star/stackedge/issues)
[![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/Frost-bit-star/stackedge/pulls)
[![License](https://img.shields.io/badge/license-MIT-green)](https://github.com/Frost-bit-star/stackfrp/blob/main/package.json)

</div>

stackfrp gives a local Stackedge app a public URL without opening a port on the device. The app runs on the user's machine. Stackedge connects out to Vercel over WebSocket. Requests from visitors travel back through that connection.

The CLI and tunnel client live in [stackedge](https://github.com/Frost-bit-star/stackedge). This repo is the gateway that runs on Vercel or any long-lived Node host.

## How it works

```text
Visitor
  ↓ HTTPS
Vercel gateway (stackfrp)
  ↓ authenticated WebSocket tunnel
Stackedge on the device
  ↓ local HTTP through the security proxy
User app
```

The device always starts the connection. No public IP, incoming port, Redis, database, or central server is needed.

## Quick start

For a real app, use the Stackedge CLI:

```sh
stackedge start myapp --port 3000 --vercel -- npm start
```

Or add Vercel to an app that is already running locally:

```sh
stackedge start myapp --port 3000 --local -- npm start
stackedge vercel init myapp
```

Deploy this folder to Vercel:

```text
~/.stackedge/vercel/myapp/project
```

Then finish the setup:

```sh
stackedge vercel deploy myapp https://myapp.vercel.app
stackedge vercel probe myapp
stackedge vercel connect myapp
```

`stackedge vercel init` generates a fresh service ID, token, and `config.json` for that app. The deploy button above imports this repo into Vercel, but per-app deployments should use the generated project so the config matches the CLI.

## HTTP endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /_health` | Deployment status, app name, service ID, and tunnel state |
| `GET /_verify` | Checks the bearer token from `x-stackfrp-token` |
| `WS /_frpc` | FRPC registration endpoint |
| `/*` | Relay to the connected Stackedge app |

Example health response:

```json
{
  "status": "ok",
  "serviceId": "svc_...",
  "application": "myapp",
  "tunnel": "connected"
}
```

## Config

Generated deployments include `config.json`:

```json
{
  "serviceId": "svc_...",
  "token": "...",
  "application": "myapp",
  "protocol": 1,
  "maxBodySize": 16777216
}
```

Keep this file private. It contains the gateway bearer token.

Environment variables override `config.json`:

```text
STACKEDGE_FRPS_SERVICE_ID
STACKEDGE_FRPS_TOKEN
STACKEDGE_FRPS_APP
STACKEDGE_FRPS_MAX_BODY_SIZE
```

For local use, start from `config.example.json`:

```sh
cp config.example.json config.json
```

## Vercel behavior

Vercel Functions are isolated. The tunnel lives in memory on the function instance that registered it. `stackedge vercel probe myapp` checks whether the next HTTP request reaches that same instance.

- `same-instance`: routing works.
- `cross-instance`: public requests cannot reach the tunnel on Vercel.

For a permanent setup, run `server.js` on a long-lived Node host. It uses the same gateway code as Vercel.

## Error page

Offline hosts, timeouts, bad config, and relay failures return the branded Stackedge error page. It shows **stackedge powered by frost-bit-star** and directs owners to report issues or open pull requests at [Frost-bit-star/stackedge](https://github.com/Frost-bit-star/stackedge).

Error codes used by the gateway:

| Code | Meaning |
| --- | --- |
| `522` | No FRPC tunnel connected |
| `504` | Tunnel request timed out |
| `503` | Payload too large or tunnel backpressure |
| `502` | Relay failed |
| `413` | Request body too large |
| `501` | WebSocket upgrade not supported by the runtime |
| `500` | Config missing |

## Protocol

The tunnel uses three frame types:

| Byte | Frame |
| --- | --- |
| `1` | JSON control message |
| `2` | Request body |
| `3` | Response body |

JSON messages handle `register`, `registered`, `heartbeat`, `request`, `response`, `cancel`, and `error`. Body frames contain the type byte, a 16-byte request ID, then the body.

Limits:

- Request timeout: 30 seconds.
- Max body size: 16 MiB by default.
- Duplicate request IDs are rejected.

## Project layout

```text
api/gateway.js              Vercel entry point
server.js                   Long-lived Node entry point
lib/config.js               Reads config.json and env overrides
lib/error-page.js           Branded error page renderer
lib/frps/server.js          HTTP handler and WebSocket registration
lib/frps/connection-manager.js  Request/response relay
lib/shared/protocol.js      Frame encoding and decoding
lib/shared/auth.js          Token comparison
```

## Run locally

```sh
npm install
cp config.example.json config.json
npm start
```

Set `PORT` to change the listen port.

## Tests

```sh
npm test
```
