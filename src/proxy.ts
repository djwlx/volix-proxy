import {
  DEFAULT_115_USER_AGENT,
  DEFAULT_CACHE_CONTROL,
  DEFAULT_IMAGE_ACCEPT_HEADER,
  DEFAULT_UPSTREAM_USER_AGENT,
} from './constants'

const jsonError = (status: number, error: string, message: string) => {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

const FORWARDED_REQUEST_HEADERS = ['accept', 'if-none-match', 'if-modified-since', 'range']

const normalizeHttpUrl = (value: string) => {
  const raw = String(value || '').trim()
  if (!raw) {
    return null
  }

  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return url
  } catch {
    return null
  }
}

const is115Hostname = (hostname: string) => {
  return hostname.includes('115')
}

const buildUpstreamHeaders = (requestHeaders: Headers, targetUrl: URL) => {
  const headers = new Headers()

  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = requestHeaders.get(headerName)
    if (value) {
      headers.set(headerName, value)
    }
  }

  if (!headers.has('accept')) {
    headers.set('accept', DEFAULT_IMAGE_ACCEPT_HEADER)
  }

  headers.set('user-agent', is115Hostname(targetUrl.hostname) ? DEFAULT_115_USER_AGENT : DEFAULT_UPSTREAM_USER_AGENT)
  return headers
}

const buildResponseHeaders = (upstreamHeaders: Headers) => {
  const headers = new Headers()
  const forwardedHeaderNames = ['content-type', 'content-length', 'etag', 'last-modified', 'cache-control']

  for (const headerName of forwardedHeaderNames) {
    const value = upstreamHeaders.get(headerName)
    if (value) {
      headers.set(headerName, value)
    }
  }

  if (!headers.has('cache-control')) {
    headers.set('cache-control', DEFAULT_CACHE_CONTROL)
  }

  return headers
}

const isImageResponse = (response: Response) => {
  const contentType = response.headers.get('content-type') || ''
  return contentType.toLowerCase().startsWith('image/')
}

const resolveCache = () => {
  if (typeof caches === 'undefined' || !caches.default) {
    return null
  }
  return caches.default
}

export const handleProxyRequest = async (request: Request) => {
  const currentUrl = new URL(request.url)
  const targetUrl = normalizeHttpUrl(currentUrl.searchParams.get('url') || '')
  const useCache = currentUrl.searchParams.get('cache') !== '0'

  if (!targetUrl) {
    return jsonError(400, 'invalid_url', 'A valid http/https url query parameter is required.')
  }

  if (targetUrl.host === currentUrl.host) {
    return jsonError(400, 'self_proxy_forbidden', 'Proxying this worker from itself is not allowed.')
  }

  const cache = resolveCache()
  const cacheKey = new Request(targetUrl.toString(), {
    method: 'GET',
    headers: buildUpstreamHeaders(request.headers, targetUrl),
  })

  if (useCache && cache) {
    const cachedResponse = await cache.match(cacheKey)
    if (cachedResponse) {
      return cachedResponse
    }
  }

  let upstreamResponse: Response

  try {
    upstreamResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: buildUpstreamHeaders(request.headers, targetUrl),
    })
  } catch {
    return jsonError(502, 'upstream_fetch_failed', 'Failed to fetch the upstream resource.')
  }

  if (upstreamResponse.ok && !isImageResponse(upstreamResponse)) {
    return jsonError(415, 'unsupported_media_type', 'Only image upstream responses are supported right now.')
  }

  const proxiedResponse = new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: buildResponseHeaders(upstreamResponse.headers),
  })

  if (useCache && cache && upstreamResponse.ok && isImageResponse(upstreamResponse)) {
    await cache.put(cacheKey, proxiedResponse.clone())
  }

  return proxiedResponse
}
