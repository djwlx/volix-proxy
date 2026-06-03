# Image Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Worker image proxy that `volix` can call for random-image traffic, with edge caching and special `User-Agent` handling for 115 upstream requests.

**Architecture:** Keep the Hono app thin and move proxy behavior into focused helper functions. Route handlers validate inputs, the proxy module normalizes upstream requests, injects the correct `User-Agent`, performs upstream fetches, and optionally reads/writes Cloudflare edge cache.

**Tech Stack:** Hono, Cloudflare Workers runtime APIs, Vitest, TypeScript

---

## File Structure

- Create: `src/constants.ts`
- Create: `src/proxy.ts`
- Create: `src/proxy.test.ts`
- Modify: `src/index.tsx`
- Modify: `package.json`
- Modify: `README.md`

### Task 1: Add test tooling and define proxy contracts

**Files:**
- Modify: `package.json`
- Create: `src/proxy.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import app from './index'

describe('GET /healthz', () => {
  it('returns service health', async () => {
    const res = await app.request('http://local.test/healthz')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      ok: true,
      service: 'cloudflare-proxy',
    })
  })
})

describe('GET /proxy', () => {
  it('rejects missing url', async () => {
    const res = await app.request('http://local.test/proxy')
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/proxy.test.ts`
Expected: FAIL because no `test` script exists and proxy routes are not implemented

- [ ] **Step 3: Add minimal test tooling**

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 4: Run test to verify it still fails for missing behavior**

Run: `pnpm test src/proxy.test.ts`
Expected: FAIL with route assertion failures

### Task 2: Implement validation and route basics

**Files:**
- Create: `src/constants.ts`
- Create: `src/proxy.ts`
- Modify: `src/index.tsx`
- Test: `src/proxy.test.ts`

- [ ] **Step 1: Extend the failing tests**

```ts
it('rejects invalid upstream urls', async () => {
  const res = await app.request('http://local.test/proxy?url=not-a-url')
  expect(res.status).toBe(400)
})

it('rejects self proxying', async () => {
  const url = encodeURIComponent('http://local.test/anything')
  const res = await app.request(`http://local.test/proxy?url=${url}`)
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/proxy.test.ts`
Expected: FAIL because `/proxy` does not validate inputs yet

- [ ] **Step 3: Write minimal implementation**

```ts
export const jsonError = (code: string, message: string, status: number) =>
  new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
```

```ts
app.get('/healthz', c => c.json({ ok: true, service: 'cloudflare-proxy' }))
app.get('/proxy', async c => {
  return handleProxyRequest(c.req.raw)
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/proxy.test.ts`
Expected: PASS for health and validation cases

### Task 3: Implement upstream image proxying and 115 `User-Agent`

**Files:**
- Create: `src/constants.ts`
- Create: `src/proxy.ts`
- Test: `src/proxy.test.ts`

- [ ] **Step 1: Add failing tests for upstream fetch behavior**

```ts
it('passes through image responses', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response('image-body', {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })
  )
  vi.stubGlobal('fetch', fetchMock)

  const url = encodeURIComponent('https://img.example.com/a.jpg')
  const res = await app.request(`http://local.test/proxy?url=${url}&cache=0`)

  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('image/jpeg')
  expect(await res.text()).toBe('image-body')
})

it('uses a browser user-agent for 115 upstream requests', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response('image-body', {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })
  )
  vi.stubGlobal('fetch', fetchMock)

  const url = encodeURIComponent('https://115.example.com/file.jpg')
  await app.request(`http://local.test/proxy?url=${url}&cache=0`)

  const [, init] = fetchMock.mock.calls[0]
  const headers = new Headers(init?.headers)
  expect(headers.get('user-agent')).toContain('Mozilla/5.0')
})

it('rejects non-image upstream responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response('hello', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    )
  )

  const url = encodeURIComponent('https://example.com/a.txt')
  const res = await app.request(`http://local.test/proxy?url=${url}&cache=0`)
  expect(res.status).toBe(415)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/proxy.test.ts`
Expected: FAIL because proxy fetch logic and `User-Agent` injection are not implemented

- [ ] **Step 3: Write minimal implementation**

```ts
export const DEFAULT_UPSTREAM_USER_AGENT = 'Mozilla/5.0 ...'
export const DEFAULT_115_USER_AGENT = 'Mozilla/5.0 ... Chrome/136.0.0.0 Safari/537.36'
```

```ts
const is115Host = (hostname: string) => hostname.includes('115')
const userAgent = is115Host(target.hostname) ? DEFAULT_115_USER_AGENT : DEFAULT_UPSTREAM_USER_AGENT
```

```ts
const upstream = await fetch(target, {
  method: 'GET',
  headers: buildUpstreamHeaders(request.headers, userAgent),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/proxy.test.ts`
Expected: PASS for successful image proxying, 115 `User-Agent`, and non-image rejection

### Task 4: Implement edge cache behavior

**Files:**
- Create: `src/proxy.ts`
- Test: `src/proxy.test.ts`

- [ ] **Step 1: Add failing cache tests**

```ts
it('serves a cached response when cache is enabled', async () => {
  const match = vi.fn().mockResolvedValue(
    new Response('cached-image', {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })
  )
  const put = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('caches', { default: { match, put } })

  const url = encodeURIComponent('https://img.example.com/cached.png')
  const res = await app.request(`http://local.test/proxy?url=${url}&cache=1`)

  expect(match).toHaveBeenCalled()
  expect(await res.text()).toBe('cached-image')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/proxy.test.ts`
Expected: FAIL because cache lookup/write is not implemented

- [ ] **Step 3: Write minimal implementation**

```ts
if (useCache) {
  const cached = await caches.default.match(cacheKeyRequest)
  if (cached) return cached
}
```

```ts
if (useCache && response.ok && isImageResponse(response)) {
  await caches.default.put(cacheKeyRequest, response.clone())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/proxy.test.ts`
Expected: PASS for cache hit behavior

### Task 5: Final polish and docs

**Files:**
- Modify: `README.md`
- Test: `src/proxy.test.ts`

- [ ] **Step 1: Add README usage docs**

```md
GET /proxy?url=https%3A%2F%2Fexample.com%2Fa.jpg&cache=1
GET /healthz
```

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 3: Note git limitation**

```txt
Workspace is not a git repository, so commit steps are skipped here.
```

## Self-Review

- Spec coverage checked: proxy route, health route, image-only enforcement, 115 `User-Agent`, edge cache, JSON errors, and docs are all covered.
- Placeholder scan checked: no `TODO` or deferred implementation markers remain.
- Type consistency checked: `handleProxyRequest`, `buildUpstreamHeaders`, and cache behavior are referenced consistently.
