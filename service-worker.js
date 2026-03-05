const CACHE = "legion-v3-1";
const FILES = [
    "./","./index.html","./config.json","./legion-core.js","./manifest.json",
    "./styles/main.css","./core/inference-engine.js",
    "./mods/chat.js","./mods/voice.js","./mods/image-gen.js","./mods/code-ide.js",
    "./mods/memory-viewer.js","./mods/mod-generator.js","./mods/settings.js","./mods/about.js"
];
self.addEventListener("install", e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
    e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", e => {
    if (e.request.url.includes("workers.dev") || e.request.url.includes("pollinations") ||
        e.request.url.includes("openrouter") || e.request.url.includes("fonts") ||
        e.request.url.includes("huggingface") || e.request.url.includes("jsdelivr")) return;
    e.respondWith(caches.match(e.request).then(c => c || fetch(e.request)));
});