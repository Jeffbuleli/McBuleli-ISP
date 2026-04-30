import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "spa-fallback-portal",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const url = req.url || "";
          const base = url.split("?")[0];
          if (
            req.method === "GET" &&
            (base === "/portal" ||
              base === "/signup" ||
              base === "/wifi" ||
              base.startsWith("/wifi/") ||
              base === "/buy/packages" ||
              base.startsWith("/buy/packages/"))
          ) {
            req.url = "/";
          }
          next();
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom")) return "react-dom";
          if (id.includes("node_modules/react/")) return "react";
          if (id.includes("node_modules/qrcode")) return "qrcode";
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true
      }
    }
  }
});
