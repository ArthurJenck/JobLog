import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import path from 'path';
import { apiDevPlugin } from './dev-api-plugin';
export default defineConfig({
  plugins: [
    apiDevPlugin(),
    TanStackRouterVite({ routesDirectory: './src/routes' }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['better-auth'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('pdfjs-dist')) return 'vendor-pdf';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('@tanstack/react-table')) return 'vendor-table';
          if (id.includes('@tanstack/react-router') || id.includes('@tanstack/router')) return 'vendor-router';
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'vendor-react';
        },
      },
    },
  },
});
