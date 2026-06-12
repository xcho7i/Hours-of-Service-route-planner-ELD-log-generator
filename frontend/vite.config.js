import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// During development the Django API runs on :8000. Proxy /api there so the
// frontend can use same-origin relative URLs and avoid CORS in dev.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: process.env.VITE_API_TARGET || "http://localhost:8000",
                changeOrigin: true,
            },
        },
        host: true
    },
});
