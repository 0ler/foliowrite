import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const basePath = process.env.GITHUB_PAGES === 'true' ? '/foliowrite/' : '/';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['foliowrite-icon.svg'],
      manifest: {
        name: 'FolioWrite — เอกสารครบเครื่อง ใช้ได้ทุกอุปกรณ์',
        short_name: 'FolioWrite',
        description: 'โปรแกรมพิมพ์และจัดการเอกสารแบบ Local-first รองรับ .docx และ PDF บนทุกอุปกรณ์',
        theme_color: '#0d6b5e',
        background_color: '#f4f5f4',
        display: 'standalone',
        start_url: basePath,
        scope: basePath,
        icons: [
          {
            src: `${basePath}foliowrite-icon.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
