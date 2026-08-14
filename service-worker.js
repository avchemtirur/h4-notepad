// ============================================================
// H4 Smart Notepad - Service Worker
// Version: 2.0.0
// ============================================================

const CACHE_NAME = 'h4-notepad-v2';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png'
];

// ============================================================
// INSTALL
// ============================================================
self.addEventListener('install', event => {
    console.log('[H4 SW] Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
            .catch(error => {
                console.error('[H4 SW] Cache error:', error);
            })
    );
});

// ============================================================
// ACTIVATE
// ============================================================
self.addEventListener('activate', event => {
    console.log('[H4 SW] Activating...');

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

// ============================================================
// FETCH
// ============================================================
self.addEventListener('fetch', event => {

    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {

                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request)
                    .then(response => {

                        // Only cache successful basic responses
                        if (
                            !response ||
                            response.status !== 200 ||
                            response.type !== 'basic'
                        ) {
                            return response;
                        }

                        const responseClone = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseClone);
                            })
                            .catch(() => {});

                        return response;
                    })
                    .catch(() => {

                        // Offline fallback for navigation requests
                        if (event.request.mode === 'navigate') {
                            return caches.match('./index.html');
                        }

                        return new Response('', {
                            status: 503,
                            statusText: 'Offline'
                        });
                    });
            })
    );
});

// ============================================================
// NOTIFICATION CLICK
// ============================================================
self.addEventListener('notificationclick', event => {

    console.log('[H4 SW] Notification clicked');

    const notification = event.notification;
    const data = notification.data || {};

    notification.close();

    event.waitUntil(

        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        })
        .then(clientList => {

            // Preferred URL
            let targetUrl = './';

            if (data.noteId) {
                targetUrl =
                    './index.html?reminderNote=' +
                    encodeURIComponent(data.noteId);
            }

            // Find existing H4 window
            for (const client of clientList) {

                if (
                    client.url &&
                    'focus' in client
                ) {

                    if (
                        'navigate' in client &&
                        data.noteId
                    ) {
                        return client
                            .navigate(targetUrl)
                            .then(() => client.focus());
                    }

                    return client.focus();
                }
            }

            // Open new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }

        })
    );
});

// ============================================================
// NOTIFICATION CLOSE
// ============================================================
self.addEventListener('notificationclose', event => {
    console.log('[H4 SW] Notification closed');
});

// ============================================================
// PUSH NOTIFICATION
// ============================================================
self.addEventListener('push', event => {

    let data = {
        title: '⏰ H4 Reminder',
        body: 'You have a customer follow-up reminder.',
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [500, 300, 500, 300, 800],
        requireInteraction: true,
        data: {}
    };

    if (event.data) {

        try {
            const incoming = event.data.json();

            data = {
                ...data,
                ...incoming
            };

        } catch (error) {

            try {
                data.body = event.data.text();
            } catch (e) {}

        }
    }

    event.waitUntil(

        self.registration.showNotification(
            data.title,
            {
                body: data.body,
                icon: data.icon,
                badge: data.badge,
                vibrate: data.vibrate,
                requireInteraction: true,
                tag: data.tag || 'h4-reminder',
                renotify: true,
                data: data.data || {}
            }
        )

    );
});