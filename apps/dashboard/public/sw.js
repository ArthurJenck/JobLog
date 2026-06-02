self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'JobLog', body: event.data.text(), url: '/' };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'JobLog', {
      body: payload.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-72.png',
      data: { url: payload.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
