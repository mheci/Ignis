/* Userscript boundary for the offline browser suite; never shipped to users. */
(() => {
  const h = (window.fixture = {
    menus: {},
    sent: [],
    saved: [],
    tabs: [],
    notes: [],
    errors: [],
    requests: [],
    failNext: false,
    failCaption: false,
    storageDenied: false,
    get(key, fallback) {
      if (this.storageDenied) throw Error("Storage disabled by fixture");
      return JSON.parse(localStorage.getItem("test:" + key) || "null") ?? fallback;
    },
    put(key, value) {
      if (this.storageDenied) throw Error("Storage disabled by fixture");
      localStorage.setItem("test:" + key, JSON.stringify(value));
    },
  });
  window.addEventListener("unhandledrejection", (e) => h.errors.push(String(e.reason)));
  window.GM_getValue = (k, d) => h.get(k, d);
  window.GM_setValue = (k, v) => h.put(k, v);
  window.GM_deleteValue = (k) => localStorage.removeItem("test:" + k);
  window.GM_registerMenuCommand = (k, fn) => ((h.menus[k] = fn), k);
  window.GM_unregisterMenuCommand = (k) => delete h.menus[k];
  window.GM_addStyle = (css) => {
    const el = document.createElement("style");
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  };
  window.GM_notification = (o) => h.notes.push(o.text);
  window.GM_openInTab = (url) => h.tabs.push(url);
  window.GM_xmlhttpRequest = (o) => {
    h.requests.push({ url: o.url, anonymous: o.anonymous, type: o.responseType });
    fetch(o.url, { method: o.method, headers: o.headers, body: o.data || undefined })
      .then(async (r) => {
        const body =
          o.responseType === "blob"
            ? await r.blob()
            : o.responseType === "arraybuffer"
              ? await r.arrayBuffer()
              : await r.text();
        o.onload({
          status: r.status,
          finalUrl: r.url,
          response: body,
          responseText: typeof body === "string" ? body : undefined,
          responseHeaders: "Content-Type: " + r.headers.get("content-type"),
        });
      })
      .catch(o.onerror);
  };
  window.GM_download = (o) => {
    h.sent.push({ name: o.name, url: o.url });
    if (h.failNext || (h.failCaption && o.name.endsWith(".txt"))) {
      h.failNext = false;
      queueMicrotask(() => o.onerror({ error: "not_succeeded" }));
      return;
    }
    fetch(o.url)
      .then((r) => r.blob())
      .then(async (b) => {
        const bytes = Array.from(new Uint8Array(await b.arrayBuffer()));
        h.saved.push({ name: o.name, bytes, type: b.type, url: o.url });
        o.onload();
      })
      .catch(o.onerror);
  };
})();
