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
  it('accepts the root route as a proxy entry when url is present', async () => {
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
    const response = await app.request(`http://local.test/?url=${upstreamUrl}&cache=0`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('image/jpeg')
    expect(await response.text()).toBe('image-body')
  })

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

  it('forwards the incoming user-agent to upstream requests', async () => {
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
    const request = new Request(`http://local.test/proxy?url=${upstreamUrl}&cache=0`, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      },
    })

    await app.request(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('user-agent')).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
    )
  })

  it('prefers the explicit ua query parameter for upstream requests', async () => {
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
    const forwardedUserAgent = encodeURIComponent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Volix/Proxy'
    )
    const request = new Request(`http://local.test/proxy?url=${upstreamUrl}&cache=0&ua=${forwardedUserAgent}`, {
      headers: {
        'user-agent': 'DifferentBrowser/1.0',
      },
    })

    await app.request(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('user-agent')).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Volix/Proxy'
    )
  })

  it('logs request and result details without upstream query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('image-body', {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
        },
      })
    )
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchMock)

    const upstreamUrl = encodeURIComponent(
      'https://cdnfhnfile.115cdn.net/path/to/file.jpg?t=1780456685&u=100284233&k=secret'
    )
    const request = new Request(`http://local.test/proxy?url=${upstreamUrl}&cache=0`, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      },
    })

    await app.request(request)

    expect(logSpy).toHaveBeenCalledTimes(2)
    const logMessages = logSpy.mock.calls.map(([message]) => String(message))

    expect(logMessages[0]).toContain('"event":"proxy_request"')
    expect(logMessages[0]).toContain('"targetHost":"cdnfhnfile.115cdn.net"')
    expect(logMessages[0]).toContain('"targetPath":"/path/to/file.jpg"')
    expect(logMessages[0]).not.toContain('1780456685')
    expect(logMessages[0]).not.toContain('secret')

    expect(logMessages[1]).toContain('"event":"proxy_response"')
    expect(logMessages[1]).toContain('"status":200')
    expect(logMessages[1]).toContain('"contentType":"image/jpeg"')
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
