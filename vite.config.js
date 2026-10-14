import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import offlineBuild from "./offlineBuild.js";

export default defineConfig({
  plugins: [react(), offlineBuild()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/")) return "react-vendor";
          if (id.includes("/node_modules/@supabase/")) return "supabase";
          if (id.includes("/node_modules/lucide-react/")) return "icons";
        },
      },
    },
  },
});
