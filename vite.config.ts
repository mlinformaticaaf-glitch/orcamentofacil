import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "placeholder.svg"],
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      manifest: {
        name: "Orçamento Fácil",
        short_name: "Orçamento Fácil",
        description: "Gerencie suas finanças pessoais de forma fácil e inteligente",
        theme_color: "#0f1319",
        background_color: "#0f1319",
        display: "standalone",
        display_override: ["fullscreen", "minimal-ui"],
        orientation: "any",
        scope: "/",
        start_url: "/",
        shortcuts: [
          {
            name: "Lançar Despesa",
            short_name: "Despesa",
            url: "/?tab=expenses&open=true",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }]
          },
          {
            name: "Lançar Receita",
            short_name: "Receita",
            url: "/?tab=incomes&open=true",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }]
          },
          {
            name: "Categorias",
            short_name: "Categorias",
            url: "/?tab=categories",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }]
          },
          {
            name: "Configurações",
            short_name: "Ajustes",
            url: "/?tab=settings",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }]
          }
        ],
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
