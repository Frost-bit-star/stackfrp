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

stackfrp gives a local Stackedge app a public URL without opening a port on the device. The app runs on the user's machine. The Stackedge CLI starts FRPC workers that pull requests from the gateway, then POST responses back. Requests and responses pass through a short-lived Redis mailbox, so Vercel can route public requests to any Function instance.

The CLI and tunnel client live in [stackedge](https://github.com/Frost-bit-star/stackedge). This repo is the gateway that runs on Vercel or any long-lived Node host.

The Vercel button imports this repo as a starter. It deploys the gateway code, but it is not a usable tunnel by itself: `config.json` is private and is not committed. Vercel uses `server.js` as the root entrypoint; with no config it stays up and returns the branded error page listing the missing service ID and token. Use the generated project from `stackedge vercel init`, or set the `STACKEDGE_FRPS_*` environment variables in your Vercel project.

## How it works

```text
Visitor
  ↓ HTTPS
Vercel gateway (stackfrp)
  ↓ Redis request/result mailbox
Stackedge FRPC workers on the device
  ↓ local HTTP through the security proxy
User app
```

The device always starts the workers. No public IP or incoming port is needed. Redis is needed for reliable Vercel routing because public requests and worker polls can land on different Function instances. A free user-owned Redis database is enough.

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
<your-project>/stackedge-vercel
```

Finish the setup:

```sh
stackedge vercel deploy myapp https://myapp.vercel.app
stackedge vercel probe myapp
stackedge vercel connect myapp
```

`stackedge vercel init` generates a fresh service ID, token, and `config.json` for that app. The deploy button above imports this repo into Vercel, but per-app deployments should use the generated project so the config matches the CLI.

## HTTP endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /_health` | Deployment status, app name, service ID, tunnel state, relay backend, and mode |
| `GET /_verify` | Checks the bearer token from `x-stackfrp-token` |
| `GET /_frpc/hello` | Authenticated worker handshake that registers presence |
| `GET /_frpc/poll` | Authenticated long poll for FRPC workers |
| `POST /_frpc/result` | Authenticated result submission from FRPC workers |
| `/*` | Relay to the connected Stackedge app |

Example health response:

```json
{
  "status": "ok",
  "serviceId": "svc_...",
  "application": "myapp",
  "tunnel": "connected",
  "relay": "redis",
  "shared": "enabled",
  "mode": "pull"
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

## Redis mailbox

Set one of these standard Redis URLs on the Vercel project:

- `REDIS_URL`
- `REDIS_CONNECTION_STRING`
- `STACKEDGE_REDIS_URL`

Upstash REST credentials are also supported:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

`KV_REST_API_URL` and `KV_REST_API_TOKEN` are accepted as aliases. `REDIS_URL` takes priority over Upstash REST. If neither is set, the gateway falls back to an in-memory mailbox for local development only.

The gateway uses these short-lived keys:

```text
stackedge:frp:tunnel:<serviceId>
stackedge:frp:queue:<serviceId>
stackedge:frp:result:<serviceId>:<requestId>
```

`stackedge vercel probe myapp` reports `routing: pull-redis` when Redis is active, `routing: pull-memory` for local-only in-memory mode, and `routing: legacy` for an outdated deployment that must be redeployed.

## Vercel behavior

`api/gateway.js` exports a Node HTTP server. Fluid compute is recommended so `/_frpc/poll` can stay open for up to 20 seconds. `vercel.json` sets `maxDuration: 300`, which is the Hobby limit.

FRPC starts six HTTP poll workers by default. A poll returns either a queued request or a heartbeat. Workers touch the presence key on every poll. Public requests fail fast with `522` when no worker has touched presence recently.

Redis keys expire automatically. Requests wait up to 30 seconds for a result. Shared bodies are capped at 6 MiB; the local gateway body limit is 16 MiB by default.

## Trade-offs

- **No Redis configured:** the gateway uses `memory`. This is fine locally and keeps setup free, but it is not reliable on Vercel because public requests and worker polls can land on different instances. Probe reports `pull-memory`.
- **Redis configured:** requests work across Vercel instances. The trade-off is one user-owned free Redis database, an extra network hop for each request, 6 MiB shared bodies, and up to a 20 second poll window before a worker receives work.
- **WebSocket tunnel:** rejected for Vercel because the socket is pinned to one Function instance and cookies do not control Vercel instance affinity. It can still work on a long-lived Node host.
- **Vercel Blob mailbox:** rejected for this default setup because Blob has per-month operation limits and higher latency than Redis. It remains a possible Redis-free fallback for very low traffic.
- **Fluid compute:** recommended but not a routing guarantee. Long polls need time to stay open; the mailbox is what makes cross-instance routing work.

## Error page

Offline hosts, timeouts, bad config, and relay failures return the branded Stackedge error page. It shows **stackedge powered by frost-bit-star** and directs owners to report issues or open pull requests at [Frost-bit-star/stackedge](https://github.com/Frost-bit-star/stackedge).

Error codes used by the gateway:

| Code | Meaning |
| --- | --- |
| `522` | No FRPC worker connected |
| `504` | Tunnel request timed out |
| `503` | Payload too large |
| `502` | Relay failed |
| `413` | Request body too large |
| `500` | Config missing |

## Protocol

Vercel mode uses JSON over HTTP:

1. FRPC workers call `GET /_frpc/poll` with the bearer token.
2. The gateway queues a public request and one worker receives it.
3. FRPC forwards the request to the local Stackedge security proxy.
4. FRPC calls `POST /_frpc/result` with status, headers, and base64 body.
5. The gateway returns that result to the visitor.

The older binary frame protocol remains in `lib/shared/protocol.js` and `lib/frps/connection-manager.js` for long-lived WebSocket gateways. Vercel deployments no longer use WebSocket registration.

Limits:

- Request timeout: 30 seconds.
- Poll wait: 100 to 20000 milliseconds.
- Shared body size: 6 MiB.
- Presence TTL: 60 seconds.

## Project layout

```text
api/gateway.js              Vercel entry point
server.js                   Long-lived Node entry point
lib/config.js               Reads config.json and env overrides
lib/error-page.js           Branded error page renderer
lib/frps/server.js          HTTP handler, pull endpoints, and public relay
lib/frps/shared-state.js    Redis/REST/memory mailbox
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
