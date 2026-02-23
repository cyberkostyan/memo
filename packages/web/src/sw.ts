import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

// Precache all build assets (manifest injected by vite-plugin-pwa at build time)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// --- Push notification handlers ---

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Memo", {
      body: data.body ?? "",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.matchAll({ type: "window" }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
