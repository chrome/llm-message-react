import { copyFileSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/highlighters/shiki.tsx",
    "src/highlighters/shikiWeb.tsx",
  ],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "shiki",
    "shiki/bundle/web",
  ],
  onSuccess: async () => {
    copyFileSync("src/styles.css", "dist/styles.css");
  },
});
