import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://mazjieo.github.io",
  base: "/monitor-github",
  integrations: [react(), sitemap()],
  output: "static"
});
