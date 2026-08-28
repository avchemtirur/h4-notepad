/*
  H4 Note Pad — service worker
  ============================
  What this genuinely adds on top of the plain web app:
    1. Offline app-shell caching — once loaded, the app opens without a
       network connection.
    2. Actionable reminder notifications — Call / Complete / Snooze buttons
       directly on the notification (self.registration.showNotification with
       `actions`), which the plain `new Notification()` API in the page
       cannot reliably render on most platforms.
    3. Tapping an action routes back into the app (via postMessage to an
       open tab, or a one-time URL parameter if no tab is open) so
       Complete/Snooze actually happen — not just a notification that closes.

  What this still does NOT do (and can't, without a push server + native app):
    - Fire a NEW reminder while the browser itself is fully closed / the
      phone is rebooted. A service worker only wakes up for events the
      browser dispatches to it (fetch, notificationclick, push). Without a
      push message arriving from a server, there's nothing to wake it for.
    - Survive the user force-closing the browser app on mobile — OS-level
      background execution for web pages is limited and inconsistent across
      Android browsers.
    - Guarantee delivery the way Android's AlarmManager + a foreground
      service can. That gap is architectural, not something more JS closes.
  The `push` handler below is included as a stub for exactly that future
  upgrade path (a real backend sending Web Push), not as something that
  currently does anything on its own.

  Requirements: service workers only register over HTTPS or http://localhost.
  Opening the HTML file directly as file:// will NOT register this worker —
  serve it from a local dev server or real hosting for any of this to apply.
*/

const CACHE_NAME = 'h4np-cache-v1';
const APP_SHELL = [
  './h4-notepad.html'
];

/* ---------------- install / activate ---------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // don't block install if the shell list is briefly unreachable
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

/* ---------------- fetch: cache-first for the app shell, network-first fallback ---------------- */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached); // offline — fall back to whatever's cached
      return cached || network;
    })
  );
});

/* ---------------- messages from the page ---------------- */
/*
  The page posts: { type:'SHOW_NOTIFICATION', title, options }
  `options` follows the standard Notification options shape, plus `actions`:
    actions: [
      { action:'call',     title:'📞 Call' },
      { action:'complete', title:'✅ Complete' },
      { action:'snooze',   title:'⏰ Snooze 1h' }
    ]
  and options.data should carry { reminderId, customerId } so notificationclick
  knows what the buttons refer to.
*/
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(msg.title, msg.options || {});
  }

  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ---------------- notification action clicks ---------------- */
self.addEventListener('notificationclick', (event) => {
  const action = event.action; // '' for a plain tap, or 'call' / 'complete' / 'snooze'
  const data = event.notification.data || {};
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // App is already open in a tab — hand the action to it directly.
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'NOTIF_ACTION', action, data });
          return client.focus();
        }
      }
      // No open tab — open one with the action encoded in the URL so the
      // app can pick it up once it boots (see the page's boot() handler).
      if (self.clients.openWindow) {
        const params = new URLSearchParams({
          action: action || 'open',
          reminderId: data.reminderId || '',
          customerId: data.customerId || ''
        });
        return self.clients.openWindow('./h4-notepad.html?' + params.toString());
      }
    })
  );
});

/*
  ---------------- push (stub — needs a real backend to do anything) ----------------
  Wiring this up for real would mean:
    1. A server that stores each reminder's fire time and, when it arrives,
       sends a Web Push message to this client's push subscription (VAPID
       keys, a subscribe() call in the page, endpoint storage server-side).
    2. This handler parsing that push payload and calling showNotification()
       the same way the message handler above does.
  Left here so the shape is ready, but with no server this event will never
  actually fire.
*/
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    event.waitUntil(self.registration.showNotification(payload.title || '🔔 Reminder', payload.options || {}));
  } catch (e) { /* no-op without a real push payload shape */ }
});
