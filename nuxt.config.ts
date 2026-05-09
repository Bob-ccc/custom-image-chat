export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: true },
  telemetry: false,
  nitro: {
    preset: process.env.NITRO_PRESET || process.env.VERCEL ? "vercel" : "node-server",
  },
  runtimeConfig: {
    upstreamProxy: process.env.NUXT_UPSTREAM_PROXY || "",
  },
});
