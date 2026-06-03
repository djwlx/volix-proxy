import { afterEach, describe, expect, it, vi } from 'vitest'
import app from './index'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GET /healthz', () => {
  it('returns service health', async () => {
    const response = await app.request('http://local.test/healthz')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: 'cloudflare-proxy',
    })
  })
})

describe('GET /proxy', () => {
  it('rejects missing url', async () => {
    const response = await app.request('http://local.test/proxy')

    expect(response.status).toBe(400)
  })

  it('rejects invalid upstream urls', async () => {
    const response = await app.request('http://local.test/proxy?url=not-a-url')

    expect(response.status).toBe(400)
  })

  it('rejects self proxying', async () => {
    const upstreamUrl = encodeURIComponent('http://local.test/anything')
    const response = await app.request(`http://local.test/proxy?url=${upstreamUrl}`)

    expect(response.status).toBe(400)
  })

  it('passes through image responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('image-body', {
          status: 200,
          headers: {
            'content-type': 'image/jpeg',
          },
        })
      )
    )

    const upstreamUrl = encodeURIComponent('https://img.example.com/a.jpg')
    const response = await app.request(`http://local.test/proxy?url=${upstreamUrl}&cache=0`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('image/jpeg')
    expect(await response.text()).toBe('image-body')
  })

  it('uses a browser user-agent for 115 upstream requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('image-body', {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const upstreamUrl = encodeURIComponent('https://cdnfhnfile.115.com/file.jpg')
    await app.request(`http://local.test/proxy?url=${upstreamUrl}&cache=0`)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('user-agent')).toContain('Mozilla/5.0')
  })

  it('rejects non-image upstream responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not-an-image', {
          status: 200,
          headers: {
            'content-type': 'text/plain',
          },
        })
      )
    )

    const upstreamUrl = encodeURIComponent('https://example.com/a.txt')
    const response = await app.request(`http://local.test/proxy?url=${upstreamUrl}&cache=0`)

    expect(response.status).toBe(415)
  })

  it('serves a cached response when cache is enabled', async () => {
    const match = vi.fn().mockResolvedValue(
      new Response('cached-image', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    )
    const put = vi.fn().mockResolvedValue(undefined)
    const fetchMock = vi.fn()

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('caches', {
      default: { match, put },
    })

    const upstreamUrl = encodeURIComponent('https://img.example.com/cached.png')
    const response = await app.request(`http://local.test/proxy?url=${upstreamUrl}&cache=1`)

    expect(match).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await response.text()).toBe('cached-image')
  })

  it('writes successful image responses into cache when enabled', async () => {
    const match = vi.fn().mockResolvedValue(undefined)
    const put = vi.fn().mockResolvedValue(undefined)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('fresh-image', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    )

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('caches', {
      default: { match, put },
    })

    const upstreamUrl = encodeURIComponent('https://img.example.com/fresh.png')
    const response = await app.request(`http://local.test/proxy?url=${upstreamUrl}&cache=1`)

    expect(response.status).toBe(200)
    expect(match).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('bypasses cache lookup when cache is disabled', async () => {
    const match = vi.fn().mockResolvedValue(undefined)
    const put = vi.fn().mockResolvedValue(undefined)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('fresh-image', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    )

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('caches', {
      default: { match, put },
    })

    const upstreamUrl = encodeURIComponent('https://img.example.com/no-cache.png')
    const response = await app.request(`http://local.test/proxy?url=${upstreamUrl}&cache=0`)

    expect(response.status).toBe(200)
    expect(match).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
