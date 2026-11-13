// @ts-check
import { defineConfig } from 'astro/config';
import wix from "@wix/astro";
import wixPages from "@wix/astro-pages";

import wixHostingAdapter from "@wix/astro-wix-hosting-adapter";

// https://astro.build/config
export default defineConfig({
  integrations: [wix(), wixPages()],
  security: { checkOrigin: false },
  adapter: wixHostingAdapter({ configPath: './wrangler.json' }),

  image: {
    domains: ["static.wixstatic.com"],
  },

  output: "server",
});
