const CACHE_NAME = 'drink-tier-list-v1';
const ASSETS = ['/', '/index.html', '/styles.css', '/script.js'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    
    // Игнорируем запросы к расширениям Chrome и другим сторонним ресурсам
    if (url.protocol === 'chrome-extension:' || url.hostname.includes('chrome-extension')) {
        e.respondWith(fetch(e.request));
        return;
    }
    
    e.respondWith(
        caches.match(e.request).then(res => {
            if (res) return res;
            
            return fetch(e.request).then(response => {
                // Кешируем только GET-запросы к нашему сайту
                if (e.request.method === 'GET' && 
                    (url.hostname === 'drink-tier-list.netlify.app' || url.hostname === 'localhost')) {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(e.request, response.clone());
                        return response;
                    });
                }
                return response;
            });
        })
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null)
        ))
    );
});
