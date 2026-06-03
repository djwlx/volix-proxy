import { Hono } from 'hono'
import { handleProxyRequest } from './proxy'
import { renderer } from './renderer'

const app = new Hono()

app.use(renderer)

app.get('/', (c) => {
  return c.render(<h1>Hello!</h1>)
})

app.get('/healthz', (c) => {
  return c.json({
    ok: true,
    service: 'cloudflare-proxy',
  })
})

app.get('/proxy', async (c) => {
  return handleProxyRequest(c.req.raw)
})

export default app
