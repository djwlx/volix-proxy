import { defineConfig } from 'vite'
import ssrPlugin from 'vite-ssr-components/plugin'

if (typeof globalThis.File === 'undefined') {
  class NodeFile extends Blob {
    name: string
    lastModified: number

    constructor(bits: BlobPart[], name: string, options: FilePropertyBag = {}) {
      super(bits, options)
      this.name = name
      this.lastModified = options.lastModified ?? Date.now()
    }
  }

  globalThis.File = NodeFile as typeof File
}

const { cloudflare } = await import('@cloudflare/vite-plugin')

export default defineConfig({
  plugins: [cloudflare(), ssrPlugin()]
})
