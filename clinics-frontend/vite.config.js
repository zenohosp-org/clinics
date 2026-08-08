import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import autoprefixer from 'autoprefixer'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve('./src'),
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.js'],
        css: false,
        include: ['src/**/*.{test,spec}.{js,jsx}'],
    },
    css: {
        postcss: {
            plugins: [
                autoprefixer(),
            ],
        },
    },
    server: {
        // 5177 — 5173 pharmacy, 5174 HMS/finance, 5175 labs, 5176 people.
        port: 5177,
        proxy: {
            '/api': {
                target: 'http://localhost:9003',
                changeOrigin: true,
            },
            // Labs service (radiology + health-checkups). Same-origin proxy
            // so the SSO cookie is sent without an extra CORS handshake in
            // dev. Production uses the absolute https://api-labs.zenohosp.com.
            '/labs-api': {
                target: 'http://localhost:8086',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/labs-api/, '/api'),
            },
            // Finance service (day book, expenses, GST registers). Same
            // same-origin reasoning as /labs-api: proxying here means the
            // browser never makes a cross-origin call, so no CORS preflight
            // and no need to add clinics to the finance allowed-origins list.
            '/finance-api': {
                target: 'http://localhost:8083',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/finance-api/, '/api'),
            },
            '/oauth2': {
                target: 'http://localhost:9003',
                changeOrigin: true,
            },
            '/login/oauth2': {
                target: 'http://localhost:9003',
                changeOrigin: true,
            },
        },
    },
})
