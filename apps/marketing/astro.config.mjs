import { defineConfig } from "astro/config";

// Public site origin, used for canonical URLs, Open Graph tags, and the sitemap.
// Override with MARKETING_SITE_URL when deploying to the real domain.
const site = process.env.MARKETING_SITE_URL ?? "https://codewit.xyz";

export default defineConfig({
  site,
  server: {
    port: Number(process.env.PORT ?? 4173),
  },
});
