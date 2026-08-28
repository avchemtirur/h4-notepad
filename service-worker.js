// ============================================================
// H4 Smart Notepad - Service Worker
// Version: 3.0.0
// ============================================================

const CACHE_NAME = 'h4-notepad-v3';

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
    console.log('[H4 SW] Installing v3...');

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
    console.log('[H4 SW] Activating v3...');

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                        return Promise.resolve();
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

    if (event.request.method !== 'GET') {
        return;
    }

    // --------------------------------------------------------
    // IMPORTANT:
    // Always get the latest index.html from the server first.
    // This prevents old UI from being stuck in cache.
    // --------------------------------------------------------
    if (
        event.request.mode === 'navigate' ||
        event.request.url.endsWith('/index.html')
    ) {
        event.respondWith(
            fetch(event.request)
                .then(response => {

                    if (response && response.ok) {
                        const responseClone = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put('./index.html', responseClone);
                            })
                            .catch(() => {});
                    }

                    return response;
                })
                .catch(() => {
                    return caches.match('./index.html');
                })
        );

        return;
    }

    // --------------------------------------------------------
    // Other files: cache first, network fallback
    // --------------------------------------------------------
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {

                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request)
                    .then(response => {

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

            let targetUrl = './';

            if (data.noteId) {
                targetUrl =
                    './index.html?reminderNote=' +
                    encodeURIComponent(data.noteId);
            }

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