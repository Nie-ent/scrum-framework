// Service worker ของ Pace — ใช้รับและแสดง push notification เท่านั้น (ไม่ cache หน้าเว็บ)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Pace", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "pace-checkin", // แจ้งเตือนใหม่แทนที่อันเก่า ไม่ซ้อนกัน
      data: { url: data.url || "/standup" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/standup", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // ถ้าเปิดแอปอยู่แล้วให้สลับไปหน้านั้น ไม่งั้นเปิดหน้าต่างใหม่
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.navigate(url).then((w) => (w || open).focus());
      return self.clients.openWindow(url);
    }),
  );
});
