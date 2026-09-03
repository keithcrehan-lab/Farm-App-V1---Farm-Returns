// Farm Return Mobile Spike — real local static bundling, proving §5's own
// question ("can the production mobile application package its UI
// locally?") with an actual build, not an assumption. esbuild bundles
// this spike's own entry point (which imports real code straight from
// the main repo's `src/domain`/`src/lib/location`) into one static
// `www/bundle.js` Capacitor's `webDir` config points at — no Next.js
// server, no live network fetch, involved at build OR run time for this
// shell's own UI.
import { build } from "esbuild";

await build({
  entryPoints: ["src/app/main.ts"],
  bundle: true,
  outfile: "www/bundle.js",
  format: "esm",
  target: "es2022",
  platform: "browser",
  sourcemap: true,
  logLevel: "info",
});

console.log("[build] www/bundle.js written — this is the exact static bundle Capacitor's webDir will ship, no server involved.");
