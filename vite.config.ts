import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'esri-satellite-tiles',
                expiration: {
                  maxEntries: 1000,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: /^https:\/\/[a-d]?\.basemaps\.cartocdn\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'carto-vector-tiles',
                expiration: {
                  maxEntries: 1000,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'mapzen-terrain-tiles',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
