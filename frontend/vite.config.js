import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Vite + React setup. No special config needed — the app reads its
// API base URL from VITE_API_URL (see .env.example), which Vite exposes via
// import.meta.env automatically for any variable prefixed with VITE_.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
