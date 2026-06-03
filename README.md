# cloudflare-proxy

Cloudflare Worker image proxy for `volix` random-image traffic.

## Features

- `GET /proxy?url=<encoded-url>` proxies remote image resources
- `GET /healthz` returns a basic health payload
- Only `http` and `https` upstream URLs are allowed
- Successful `image/*` responses can be cached at the Cloudflare edge
- 115-related upstream hosts automatically receive a browser-like `User-Agent`

## Local development

```txt
pnpm install
pnpm run dev
```

## Deploy

```txt
pnpm run deploy
```

## Test

```txt
pnpm test
```

## Proxy usage

```txt
GET /proxy?url=https%3A%2F%2Fexample.com%2Fimage.jpg
GET /proxy?url=https%3A%2F%2Fexample.com%2Fimage.jpg&cache=0
GET /healthz
```

Query parameters:

- `url`: required, upstream image URL
- `cache`: optional, `1` uses edge cache and `0` bypasses it

## `volix` integration

When `volix` resolves a random image URL, wrap it with this Worker:

```txt
https://your-worker-domain/proxy?url=${encodeURIComponent(remoteImageUrl)}
```

That lets random image responses and cacheable image fetches go through the same proxy entrypoint.

## 115 upstream note

Some 115-backed image URLs reject requests unless they receive a browser-like `User-Agent`. This proxy automatically applies a Chrome-style `User-Agent` to upstream hosts whose hostname contains `115`.

## Cloudflare types

[For generating or synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
pnpm run cf-typegen
```
