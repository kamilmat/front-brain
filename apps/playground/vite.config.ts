import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/front-brain/").
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  worker: { format: 'es' },
  // Workers inside @front-brain/* are referenced with `new URL('./worker.js', import.meta.url)` –
  // keep those packages (and heavy wasm libs) out of dependency pre-bundling so the URLs resolve.
  optimizeDeps: {
    exclude: ['@huggingface/transformers', 'onnxruntime-web', '@front-brain/transformers', '@front-brain/webllm', '@front-brain/inpaint'],
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 8000, sourcemap: true },
});
