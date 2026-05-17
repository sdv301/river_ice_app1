import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const tileCacheHosts = (env.VITE_TILE_CACHE_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  const appBuildId = String(Date.now());

  const externalRuntimeCaching = tileCacheHosts.map((host) => ({
    urlPattern: new RegExp(`^https:\\/\\/${host.replace(/\./g, '\\.')}\\/.*`, 'i'),
    handler: 'CacheFirst' as const,
    options: {
      cacheName: `tiles-${host.replace(/[^a-z0-9]+/gi, '-')}`,
      expiration: {
        maxEntries: 1000,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      },
      cacheableResponse: { statuses: [0, 200] },
    },
  }));

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
              urlPattern: /^https?:\/\/[^/]+\/(tiles|terrain|fonts)\//i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'local-map-assets',
                expiration: {
                  maxEntries: 1000,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              // Не кэшировать прокси карт — иначе после смены сети/VPN отдаются устаревшие ответы
              urlPattern: /^https?:\/\/[^/]+\/api\/(?!map\/fetch).*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'internal-api-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 30
                },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            ...externalRuntimeCaching,
          ]
        }
      })
    ],
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          database: path.resolve(__dirname, 'database.html'),
        },
      },
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      __APP_BUILD_ID__: JSON.stringify(appBuildId),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: env.VITE_INTERNAL_DATA_API_PROXY_TARGET
        ? {
            '/api': {
              target: env.VITE_INTERNAL_DATA_API_PROXY_TARGET,
              changeOrigin: true,
            },
          }
        : undefined,
    },
  };
});
