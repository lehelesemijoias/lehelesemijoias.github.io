/* Le Helê — recebe as notificações do painel (Web Push) */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { corpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Le Helê", {
    body: d.corpo || "",
    icon: "assets/icone-192.png",
    badge: "assets/icone-192.png",
    tag: d.tag || undefined,
    data: { url: d.url || "painel.html" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || "painel.html", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(lista => {
    for (const c of lista) { if (c.url.split("#")[0] === alvo.split("#")[0] && "focus" in c) { c.navigate(alvo).catch(() => { }); return c.focus(); } }
    return self.clients.openWindow(alvo);
  }));
});
