# Cloudflare Image Proxy Design

**Date:** 2026-06-03

## Goal

Build a Cloudflare Worker-based proxy that accepts remote resource URLs, fetches them from upstream, and returns the result to callers. The first version is intentionally scoped to image resources so `volix` random-image traffic can be switched to this proxy safely.

## Scope

### In scope

- A `GET /proxy?url=...` endpoint for proxying remote image resources
- A `GET /healthz` endpoint for health checks
- HTTP/HTTPS upstream URL validation
- Upstream fetch with a configurable `User-Agent`
- Special handling for 115 upstream requests that require a browser-like `User-Agent`
- Safe request-header forwarding for cache validation
- Cloudflare edge caching via Worker cache APIs
- Clear JSON error responses for invalid requests and upstream failures

### Out of scope

- Arbitrary non-image proxying
- Persistent storage in KV, R2, or D1
- Signed URLs or authentication
- Multi-method proxying such as POST or PUT

## API Design

### `GET /proxy`

Query parameters:

- `url`: required, encoded upstream resource URL
- `cache`: optional, `1` enables edge cache lookup/write, `0` bypasses cache. Default is `1`.

Behavior:

- Reject missing or malformed `url`
- Reject non-HTTP(S) protocols
- Reject self-referencing requests back to this Worker host
- Fetch upstream using `GET`
- Forward safe cache-related headers only:
  - `accept`
  - `if-none-match`
  - `if-modified-since`
  - `range`
- Apply a browser-like `User-Agent` when the upstream hostname indicates 115 traffic
- Require upstream `content-type` to start with `image/` for successful 2xx responses
- Return upstream status/body/selected headers to the caller

### `GET /healthz`

Returns JSON:

- `ok: true`
- `service: "cloudflare-proxy"`

## Upstream `User-Agent` Rules

Some `volix` image requests resolve to 115-backed URLs that reject requests without a browser-like `User-Agent`. The proxy must therefore support deterministic `User-Agent` injection.

Rules:

- Define a default browser-like `User-Agent` constant in code
- Use it for 115-related hosts
- Allow a generic default `User-Agent` for all other upstream requests
- Keep this logic centralized so later changes do not require touching route handlers

The first version will detect 115 traffic by hostname patterns and apply the 115 browser UA automatically.

## Caching Design

The first version uses Cloudflare edge cache only.

Strategy:

- Cache key is derived from the full normalized upstream URL plus cache mode
- For `cache=1`, check `caches.default` before fetching upstream
- On cacheable successful image responses, write a cloned response into `caches.default`
- Add a conservative `Cache-Control` header if upstream does not provide one
- Never cache invalid requests or non-image responses

This keeps the proxy stateless while still giving `volix` a unified proxy entrypoint and a first layer of caching.

## Error Handling

Return JSON errors with a stable shape:

- `error`: machine-readable code
- `message`: human-readable message

Cases:

- `400` for missing or invalid `url`
- `400` for unsupported upstream protocol
- `400` for self-proxying
- `415` for non-image upstream payloads on successful upstream fetches
- Upstream status passthrough for upstream HTTP failures where possible
- `502` for network or fetch failures

## File Structure

- `src/index.tsx`: Hono app bootstrap and routes
- `src/proxy.ts`: proxy core logic, validation, fetch, caching, header handling
- `src/constants.ts`: default `User-Agent` strings and cache defaults
- `src/proxy.test.ts`: behavior tests for proxy core and route-level responses

## Testing Strategy

Use Vitest.

Cover:

- Rejecting bad URLs
- Rejecting self-referential URLs
- Applying the 115 browser `User-Agent`
- Passing through image responses
- Rejecting non-image upstream payloads
- Cache hit behavior
- Cache bypass behavior

## Notes

- This workspace is not currently a git repository, so the design doc cannot be committed here.
- I am treating the in-chat design approval plus the added 115 `User-Agent` requirement as approval for this written spec.
