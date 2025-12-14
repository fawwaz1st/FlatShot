const CACHE_NAME = 'flatshot-v1';
const ASSETS = [
    './',
    './index.html',
    './src/main.js',
    './style.css'
    // Add other core assets here if known, or rely on runtime caching
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS).catch(err => console.warn('SW Install Asset Error', err));
        })
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    e.respondWith(
        caches.match(e.request).then((cached) => {
            const networked = fetch(e.request)
                .then((resp) => {
                    const cacheCopy = resp.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, cacheCopy);
                    });
                    return resp;
                })
                .catch(() => {
                    // You could return a offline.html here if nav request
                    return cached;
                });

            return cached || networked;
        })
    );
});
