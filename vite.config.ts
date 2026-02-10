import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/admin/sync": {
        target: "https://syncadminclaims-3iojv6xqhq-uc.a.run.app",
        changeOrigin: true,
        secure: true,
      },
      "/api/interpret": {
        target: "https://interpret-3iojv6xqhq-uc.a.run.app",
        changeOrigin: true,
        secure: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
