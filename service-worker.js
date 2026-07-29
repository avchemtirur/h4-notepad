// ============================================================
// H4 Smart Notepad - Service Worker
// Version: 1.0.0
// ============================================================

const CACHE_NAME = 'h4-notepad-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png',
    './alarm.mp3',
    'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
    'https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth-compat.js'
];

// ============================================================
// INSTALL EVENT - Cache all assets
// ============================================================
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching assets...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('[Service Worker] Installation complete!');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] Cache failed:', error);
            })
    );
});

// ============================================================
// ACTIVATE EVENT - Clean up old caches
// ============================================================
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[Service Worker] Activation complete!');
            return self.clients.claim();
        })
    );
});

// ============================================================
// FETCH EVENT - Serve from cache, fallback to network
// ============================================================
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Return cached response if available
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Otherwise, fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache if not a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        // Cache the fetched response
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                try {
                                    cache.put(event.request, responseToCache);
                                } catch (e) {
                                    // Ignore caching errors for large files
                                }
                            });

                        return response;
                    })
                    .catch(() => {
                        // Fallback for offline - return a generic offline page
                        return new Response(
                            'You are offline. Please check your internet connection.',
                            {
                                status: 503,
                                statusText: 'Service Unavailable',
                                headers: new Headers({
                                    'Content-Type': 'text/plain'
                                })
                            }
                        );
                    });
            })
    );
});

// ============================================================
// NOTIFICATION CLICK EVENT - Handle notification clicks
// ============================================================
self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification clicked:', event.notification);

    const notification = event.notification;
    notification.close();

    // Open or focus the app
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // If a window client is already open, focus it
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise, open a new window
            if (clients.openWindow) {
                return clients.openWindow('./');
            }
        })
    );
});

// ============================================================
// NOTIFICATION CLOSE EVENT - Clean up when notification is dismissed
// ============================================================
self.addEventListener('notificationclose', (event) => {
    console.log('[Service Worker] Notification closed:', event.notification);
});

// ============================================================
// PUSH EVENT - Handle push notifications (future use)
// ============================================================
self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push received:', event);

    let data = {
        title: '⏰ H4 Reminder',
        body: 'You have a reminder!',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [500, 300, 500],
        requireInteraction: true
    };

    if (event.data) {
        try {
            const parsed = event.data.json();
            data = { ...data, ...parsed };
        } catch (e) {
            data.body = event.data.text() || data.body;
        }
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: data.badge,
            vibrate: data.vibrate,
            requireInteraction: data.requireInteraction,
            data: data.data || {}
        })
    );
});