import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    crx({ manifest })
  ],
  build: {
    manifest: false 
  },
  server: {
    port: 5173,
    strictPort: true,
    ws: {
      host: 'localhost',
      port: 5173
    }
  }
});