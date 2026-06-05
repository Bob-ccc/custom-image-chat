export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: true },
  telemetry: false,
  routeRules: {
    "/hidream": { redirect: "/" },
  },
  nitro: {
    preset: process.env.NITRO_PRESET || (process.env.VERCEL ? "vercel" : "node-server"),
  },
  runtimeConfig: {
    upstreamProxy: process.env.NUXT_UPSTREAM_PROXY || "",
  },
  vite: {
    server: {
      watch: {
        ignored: ["**/node_modules/**", "**/.nuxt/**", "**/.output/**", "**/.vercel/**"],
      },
    },
  },
});
