// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Public configuration values are intentionally kept as placeholders rather than committed secrets.
// Production deployments should provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY via env.
const SUPABASE_URL =
  process.env["VITE_SUPABASE_URL"] || "https://sbqxpvhfhajueiwtndrw.supabase.co";
const SUPABASE_ANON_KEY =
  process.env["VITE_SUPABASE_ANON_KEY"] ||
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNicXhwdmhmaGFqdWVpd3RuZHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MDE3NDgsImV4cCI6MjEwNjA3Nzc0OH0.5bVrWU33Vh8iZ1R-1qtOOooRC9fVH7Ztkuy0FrCZi_s";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(SUPABASE_ANON_KEY),
    },
  },
});
