import { createHash } from "node:crypto";
import { defineConfig } from "vite";
export default defineConfig({
  server: { port: 5173, strictPort: true, proxy: { "/api": "http://127.0.0.1:3001" } },
  plugins: [
    {
      name: "checkpoint-shell",
      apply: "build",
      generateBundle(_options, bundle) {
        const files = [
          "index.html",
          "/manifest.webmanifest",
          "/checkpoint-icon.svg",
          ...Object.keys(bundle).filter((p) => p.endsWith(".js") || p.endsWith(".css")),
        ];
        const version = createHash("sha256")
          .update(JSON.stringify(files))
          .digest("hex")
          .slice(0, 16);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `
const CACHE="checkpoint-${version}";
const ASSETS=${JSON.stringify(files.map((p) => (p.startsWith("/") ? p : "/" + p)))};
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
// No skipWaiting: a new shell must wait until all old clients have closed.
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("fetch",event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
 if(event.request.mode==="navigate"&&url.pathname==="/checkpoint"){
  event.respondWith(caches.open(CACHE).then(cache=>cache.match("/index.html")).then(r=>r||fetch(event.request)));return;
 }
 if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(r=>r||fetch(event.request)));
});
`,
        });
      },
    },
  ],
});
