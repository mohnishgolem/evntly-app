// Evntly service worker: instant app launch + push notifications.
//
// Launch: the installed app opens on "/". Waiting for the server (a cold
// start after idle, on mobile data) meant seconds of blank screen, so the
// home page is served from a cached copy straight away and refreshed in the
// background. The cached copy is marked (data-cached-shell on <html>) and
// the page re-fetches its data as soon as it loads, so signed-in state,
// counts and prompts are corrected within a moment. Only the bare "/"
// navigation is cached; every other page always comes from the network.
// The copy is deleted on sign-out (see app-shell-cache.tsx).

const SHELL_CACHE = "evntly-shell-v1";
const STATIC_CACHE = "evntly-static-v1";
const STATIC_LIMIT = 300;
// Older copies go to the network instead (they'd mostly be a different deploy).
const SHELL_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL_CACHE, STATIC_CACHE];
      for (const key of await caches.keys()) {
        if (!keep.includes(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-shell") event.waitUntil(caches.delete(SHELL_CACHE));
});

let revalidating = null;

async function refreshShell(request) {
  const res = await fetch(request);
  // Only a normal, complete page is worth keeping (not redirects or errors).
  if (res.ok && res.status === 200 && !res.redirected && res.type === "basic") {
    const html = await res.clone().text();
    const headers = new Headers();
    for (const name of ["content-type", "content-security-policy", "content-language"]) {
      const v = res.headers.get(name);
      if (v) headers.set(name, v);
    }
    headers.set("x-sw-cached-at", String(Date.now()));
    const marked = html.replace("<html", "<html data-cached-shell=\"\"");
    const cache = await caches.open(SHELL_CACHE);
    await cache.put("/", new Response(marked, { status: 200, headers }));
  }
  return res;
}

async function launch(event) {
  const cached = await (await caches.open(SHELL_CACHE)).match("/");
  const age = cached ? Date.now() - Number(cached.headers.get("x-sw-cached-at") || 0) : Infinity;
  // A refresh already in flight (e.g. the page reloading itself after a
  // deploy) waits for it rather than getting the old copy again.
  if (!cached || age > SHELL_MAX_AGE_MS || revalidating) {
    return revalidating ? revalidating.then((r) => r.clone()) : refreshShell(event.request);
  }
  revalidating = refreshShell(event.request).finally(() => {
    revalidating = null;
  });
  event.waitUntil(revalidating.catch(() => {}));
  return cached;
}

// Build files have content hashes in their names, so a cached one never goes
// stale. Keeping them lets the cached home page run after a new deploy has
// replaced them on the server.
async function staticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") {
    await cache.put(request, res.clone());
    const keys = await cache.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT))) await cache.delete(old);
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname === "/" && url.search === "") {
    event.respondWith(launch(event).catch(() => fetch(request)));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticAsset(request).catch(() => fetch(request)));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Evntly", body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  event.waitUntil(
    self.registration.showNotification(data.title || "Evntly", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url === target && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
