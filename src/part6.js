  /* ============================================================
     Ignis Boot — cache, keyboard, menu, startup
     ============================================================ */

  // ─── Persistent cache (IndexedDB, GM-storage fallback) ─────────────────
  function idbRequest(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function idbTransactionDone(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () {
        resolve();
      };
      transaction.onerror = function () {
        reject(transaction.error);
      };
      transaction.onabort = function () {
        reject(transaction.error || new Error("Transaction aborted"));
      };
    });
  }

  function openDB() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(PERSISTENT_CACHE_DB_NAME, PERSISTENT_CACHE_DB_VERSION);
      let expired = false;
      const timer = setTimeout(() => {
        expired = true;
        reject(new Error("Cache open timed out"));
      }, 2000);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(PERSISTENT_CACHE_STORE_NAME)) {
          db.createObjectStore(PERSISTENT_CACHE_STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = function () {
        clearTimeout(timer);
        var db = request.result;
        if (expired) {
          db.close();
          return;
        }
        var forget = function () {
          if (persistentCacheStore.db === db) persistentCacheStore.db = null;
        };
        db.onversionchange = function () {
          db.close();
          forget();
        };
        db.onclose = forget;
        resolve(db);
      };
      request.onerror = function () {
        clearTimeout(timer);
        reject(request.error);
      };
      request.onblocked = function () {
        clearTimeout(timer);
        expired = true;
        reject(new Error("IndexedDB open blocked by another tab"));
      };
    });
  }

  function getPersistentCacheDB() {
    if (!persistentCacheStore.db) {
      return openDB().then(function (db) {
        persistentCacheStore.db = db;
        return db;
      });
    }
    return Promise.resolve(persistentCacheStore.db);
  }

  function mergeCacheEntries(key, ...sources) {
    const result = Object.create(null),
      now = Date.now();
    for (const src of sources) {
      if (!src || typeof src !== "object" || Array.isArray(src)) continue;
      for (const [k, v] of Object.entries(src)) {
        if (
          key === IMAGE_CACHE_KEY &&
          /^\d{1,30}$/.test(k) &&
          trustedURL(v?.url) &&
          Number.isFinite(v.ts) &&
          v.ts <= now &&
          now - v.ts < IMAGE_CACHE_MAX_AGE
        )
          result[k] = { url: v.url, ts: v.ts };
        if (key === USER_ID_CACHE_KEY && cleanName(k) === k && /^\d{1,30}$/.test(String(v))) result[k] = String(v);
      }
    }
    const keys = Object.keys(result),
      limit = key === IMAGE_CACHE_KEY ? IMAGE_MAX_CACHE_ITEMS : USER_ID_MAX_CACHE_ITEMS;
    if (key === IMAGE_CACHE_KEY) keys.sort((a, b) => result[a].ts - result[b].ts);
    for (const k of keys.slice(0, Math.max(0, keys.length - limit))) delete result[k];
    return result;
  }

  function initPersistentCache() {
    if (persistentCacheStore.readyPromise) return persistentCacheStore.readyPromise;

    persistentCacheStore.readyPromise = (function () {
      var keys = Object.keys(PERSISTENT_CACHE_BINDINGS);
      var stored = {};
      var migrated = [];

      return Promise.resolve()
        .then(function () {
          if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not available");
          return getPersistentCacheDB();
        })
        .then(function (db) {
          var readStore = db
            .transaction(PERSISTENT_CACHE_STORE_NAME, "readonly")
            .objectStore(PERSISTENT_CACHE_STORE_NAME);
          return Promise.all(
            keys.map(function (key) {
              return idbRequest(readStore.get(key));
            })
          ).then(function (records) {
            keys.forEach(function (key, i) {
              const legacy = Store.get(key, undefined);
              stored[key] = mergeCacheEntries(key, records[i]?.value, legacy);
              if (legacy !== undefined) migrated.push(key);
            });
            if (!migrated.length) return null;
            var transaction = db.transaction(PERSISTENT_CACHE_STORE_NAME, "readwrite");
            var writeStore = transaction.objectStore(PERSISTENT_CACHE_STORE_NAME);
            var now = Date.now();
            migrated.forEach(function (key) {
              writeStore.put({ id: key, value: stored[key], updatedAt: now });
            });
            return idbTransactionDone(transaction).then(async function () {
              await Promise.all(migrated.map((key) => Store.remove(key)));
              logger("initPersistentCache()", "moved " + migrated.join(", ") + " from GM storage to IndexedDB");
            });
          });
        })
        .catch(function (err) {
          logger("initPersistentCache()", "IndexedDB unavailable, falling back to GM storage", err);
          persistentCacheStore.backend = "gm";
          stored = {};
          keys.forEach(function (key) {
            stored[key] = Store.get(key, undefined);
          });
        })
        .then(function () {
          if (!persistentCacheStore.backend) persistentCacheStore.backend = "indexeddb";
          keys.forEach(function (key) {
            var field = PERSISTENT_CACHE_BINDINGS[key];
            var session = state[field];
            var hasSessionEntries = !!session && Object.keys(session).length > 0;
            var merged = mergeCacheEntries(key, stored[key], session);
            state[field] = merged || {};
            persistentCacheStore.values.set(key, state[field]);
            if (hasSessionEntries) persistentCacheStore.pending.add(key);
          });

          window.addEventListener("pagehide", function () {
            flushPersistentCache();
          });
          document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "hidden") flushPersistentCache();
          });
          if (persistentCacheStore.pending.size > 0) schedulePersistentCacheFlush();
          return persistentCacheStore.backend;
        });
    })();

    return persistentCacheStore.readyPromise;
  }

  function setPersistentCache(key, value) {
    persistentCacheStore.values.set(key, value);
    persistentCacheStore.pending.add(key);
    schedulePersistentCacheFlush();
  }

  function schedulePersistentCacheFlush() {
    if (persistentCacheStore.flushTimer) return;
    persistentCacheStore.flushTimer = setTimeout(function () {
      persistentCacheStore.flushTimer = null;
      flushPersistentCache();
    }, PERSISTENT_CACHE_FLUSH_DELAY);
  }

  function flushPersistentCache() {
    if (persistentCacheStore.flushTimer) {
      clearTimeout(persistentCacheStore.flushTimer);
      persistentCacheStore.flushTimer = null;
    }
    persistentCacheStore.flushChain = persistentCacheStore.flushChain
      .catch(() => false)
      .then(writePendingPersistentCache)
      .catch(() => false);
    return persistentCacheStore.flushChain;
  }

  function writePendingPersistentCache() {
    return initPersistentCache().then(function () {
      if (persistentCacheStore.pending.size === 0) return true;
      var batch = Array.from(persistentCacheStore.pending);
      persistentCacheStore.pending.clear();
      var write = Promise.resolve();
      if (persistentCacheStore.backend === "indexeddb") {
        write = getPersistentCacheDB().then(function (db) {
          var transaction = db.transaction(PERSISTENT_CACHE_STORE_NAME, "readwrite");
          var store = transaction.objectStore(PERSISTENT_CACHE_STORE_NAME);
          var now = Date.now();
          batch.forEach(function (key) {
            store.put({ id: key, value: persistentCacheStore.values.get(key), updatedAt: now });
          });
          return idbTransactionDone(transaction);
        });
      } else {
        write = Promise.resolve().then(() =>
          Promise.all(batch.map((key) => Store.write(key, persistentCacheStore.values.get(key))))
        );
      }
      return write
        .then(function () {
          return true;
        })
        .catch(async function (err) {
          persistentCacheStore.db?.close();
          persistentCacheStore.db = null;
          if (persistentCacheStore.backend === "indexeddb") {
            persistentCacheStore.backend = "gm";
            try {
              await Promise.all(batch.map((key) => Store.write(key, persistentCacheStore.values.get(key))));
              return true;
            } catch (_) {
              /* If both stores are denied, retain entries in memory until the next flush. */
            }
          }
          batch.forEach(function (key) {
            persistentCacheStore.pending.add(key);
          });
          logger("flushPersistentCache()", "write failed, key(s) queued again", err);
          return false;
        });
    });
  }

  // ─── Cache subsystem ───────────────────────────────────────────────────
  function purgeCache() {
    var now = Date.now();
    var changed = false;
    Object.keys(state.GL_imageCache).forEach(function (k) {
      var e = state.GL_imageCache[k];
      if (!e || !e.ts || now - e.ts >= IMAGE_CACHE_MAX_AGE) {
        delete state.GL_imageCache[k];
        changed = true;
      }
    });
    mediaCache.forEach(function (entry, id) {
      if (now - entry.ts > IMAGE_CACHE_MAX_AGE) mediaCache.delete(id);
    });
    if (changed) setPersistentCache(IMAGE_CACHE_KEY, state.GL_imageCache);
  }

  function putInCache(mediaId, url) {
    if (!/^\d{1,30}$/.test(String(mediaId || "")) || !trustedURL(url)) return;
    var entry = { url: url, ts: Date.now() };
    var isNewPersistentEntry = !state.GL_imageCache[mediaId];

    mediaCache.set(mediaId, entry);
    if (mediaCache.size > IMAGE_MAX_CACHE_ITEMS) {
      mediaCache.delete(mediaCache.keys().next().value);
    }

    var keys = Object.keys(state.GL_imageCache);
    if (isNewPersistentEntry && keys.length >= IMAGE_MAX_CACHE_ITEMS) {
      var oldestId = keys[0];
      var oldestTs = (state.GL_imageCache[oldestId] && state.GL_imageCache[oldestId].ts) || 0;
      for (var i = 1; i < keys.length; i++) {
        var ts = (state.GL_imageCache[keys[i]] && state.GL_imageCache[keys[i]].ts) || 0;
        if (ts < oldestTs) {
          oldestTs = ts;
          oldestId = keys[i];
        }
      }
      delete state.GL_imageCache[oldestId];
      mediaCache.delete(oldestId);
    }

    state.GL_imageCache[mediaId] = entry;
    setPersistentCache(IMAGE_CACHE_KEY, state.GL_imageCache);
  }

  function getImageFromCache(mediaId) {
    if (!mediaId) return null;
    var entry = mediaCache.get(mediaId) || state.GL_imageCache[mediaId];
    if (!entry) return null;
    if (Date.now() - (entry.ts || 0) > IMAGE_CACHE_MAX_AGE) {
      mediaCache.delete(mediaId);
      if (state.GL_imageCache[mediaId]) {
        delete state.GL_imageCache[mediaId];
        setPersistentCache(IMAGE_CACHE_KEY, state.GL_imageCache);
      }
      return null;
    }
    return trustedURL(entry.url);
  }

  function registerPerformanceObserver() {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      var perfObs = new PerformanceObserver(function (list) {
        if (!USER_SETTING.CAPTURE_IMAGE_VIA_MEDIA_CACHE) return;
        list.getEntries().forEach(function (entry) {
          if (entry.initiatorType !== "img") return;
          var u = entry.name || "";
          if (!trustedURL(u)) return;
          if (!(u.indexOf("_e35") > -1 || u.indexOf("_e15") > -1 || u.indexOf(".webp?") > -1)) return;
          if (u.indexOf("_e35_s") > -1) return;
          if (/_[sp](\d+)x\1(?!\d)/.test(u)) return;
          var id = decodeMediaIdFromUrl(u);
          if (id && !mediaCache.has(id)) putInCache(id, u);
        });
      });
      perfObs.observe({ type: "resource", buffered: true });
    } catch (e) {
      logger("PerformanceObserver unavailable:", e && e.message ? e.message : e);
    }
  }

  // ─── Keyboard ──────────────────────────────────────────────────────────
  function quickDownloadFocusedPost() {
    if (!state.pageLoaded) return;
    const active = document.activeElement?.closest('[data-snig="canDownload"]');
    const visible = Array.from(document.querySelectorAll('[data-snig="canDownload"]'))
      .map((post) => {
        const r = post.getBoundingClientRect();
        return {
          post,
          height: Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)),
          dist: Math.abs((r.top + r.bottom - innerHeight) / 2)
        };
      })
      .filter((x) => x.height > 0)
      .sort((a, b) => b.height - a.height || a.dist - b.dist);
    const art = active || visible[0]?.post;
    const sc = art && getPostContextFromButton(art).postPath;
    if (!sc) {
      Toasts.info("No visible post is available.");
      return;
    }
    resolvePostShortcode(sc, { post: art, complete: true }).then((loaded) => {
      if (!loaded) return;
      const index = getVisibleNodeIndex($(art));
      const item = selectedPostItem(loaded, index);
      if (item) downloadResource(item, loaded.meta);
    });
  }

  function ignoreShortcut(e) {
    const t = (e.originalEvent || e).composedPath?.()[0] || e.target;
    return (
      e.defaultPrevented ||
      e.isDefaultPrevented?.() ||
      e.repeat ||
      e.originalEvent?.repeat ||
      e.isComposing ||
      e.originalEvent?.isComposing ||
      t?.isContentEditable ||
      !!t?.closest?.('input,textarea,select,[role="textbox"],[contenteditable]:not([contenteditable="false"])')
    );
  }

  function toggleShortcutsHelp() {
    var existing = document.querySelector(".ignis-ksh");
    if (existing) {
      existing.remove();
      return;
    }
    var rows = [
      ["S", "Download focused post"],
      [getPlatformModifierKey() + " + K", "Command palette"],
      [(isMacOS() ? "\u2318" : "Ctrl") + " + K", "Command palette (browser-safe)"],
      ["Shift + ?", "Show / hide this overlay"],
      [getPlatformModifierKey() + " + " + String.fromCharCode(state.settingsHotkeyKeyCode), "Settings"],
      [getPlatformModifierKey() + " + " + String.fromCharCode(state.downloadStoryHotkeyKeyCode), "Download story"],
      [getPlatformModifierKey() + " + T", "Show tagged profiles"],
      [getPlatformModifierKey() + " + " + String.fromCharCode(state.debugHotkeyKeyCode), "Debug window"],
      [getPlatformModifierKey() + " + R", "Reload " + NAME],
      [getPlatformModifierKey() + " + Q", "Close dialogs"]
    ];
    var wrap = $('<div class="ignis-ksh">');
    var card = $('<div class="ignis-ksh-card">');
    card.append(
      "<h3>" +
        NAME +
        " — Keyboard Shortcuts</h3><table>" +
        rows
          .map(function (r) {
            return (
              "<tr><td>" +
              esc(r[1]) +
              "</td><td><kbd style='background:var(--ig-surface-2);border:1px solid var(--ig-line);border-bottom-width:2px;border-radius:6px;padding:2px 8px;font:600 11px ui-monospace,Menlo,monospace'>" +
              esc(r[0]) +
              "</kbd></td></tr>"
            );
          })
          .join("") +
        "</table><div class='ignis-hint'>Shortcuts are disabled while typing.</div>"
    );
    wrap.append(card);
    $body.append(wrap);
    wrap.on("mousedown", function (e) {
      if (e.target === wrap[0]) wrap.remove();
    });
  }

  function installKeyboardShortcuts() {
    document.addEventListener("keydown", function (e) {
      if (ignoreShortcut(e)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || ModalStack.modals.length || document.querySelector(".ignis-palette"))
        return;
      var k = e.key;
      if (e.shiftKey && k === "?" && USER_SETTING.KEYBOARD_SHORTCUTS_HELP) {
        e.preventDefault();
        toggleShortcutsHelp();
        return;
      }
      if (
        state.pageLoaded &&
        k === "s" &&
        !e.shiftKey &&
        !document.querySelector(".ignis-ksh") &&
        USER_SETTING.KEYBOARD_DOWNLOAD_S
      ) {
        e.preventDefault();
        quickDownloadFocusedPost();
      }
    });
  }

  // ─── Command palette ───────────────────────────────────────────────────
  function toggleCommandPalette() {
    var existing = document.querySelector(".ignis-palette");
    if (existing) {
      $(document).off("keydown.igpal");
      existing.remove();
      return;
    }
    const opener = document.activeElement;
    var actions = [
      {
        label: "Open Settings",
        kw: "settings preferences options",
        fn: function () {
          showSetting();
        }
      },
      {
        label: "Download Statistics",
        kw: "stats usage numbers",
        fn: function () {
          showSetting("stats");
        }
      },
      { label: "Filename Template", kw: "rename file name format template", fn: openRenameEditor },
      { label: "About " + NAME, kw: "about version info", fn: showAbout },
      { label: "Debug Window", kw: "debug logs console", fn: showDebugDOM },
      { label: "Download Focused Post", kw: "save post quick download", fn: quickDownloadFocusedPost },
      {
        label: "Download Current Story",
        kw: "save story download",
        fn: function () {
          if (state.route === "story") $(".ignis-sd").first().trigger("click");
          else Toasts.info("Open a story first.");
        }
      },
      {
        label: "Download All Stories",
        kw: "save story all batch",
        fn: function () {
          if (state.route === "story") downloadStoriesAll("stories");
          else Toasts.info("Open a story first.");
        }
      },
      {
        label: "Show Tagged Profiles",
        kw: "story highlight mentions tagged profiles",
        fn: function () {
          if (state.route === "story") showTaggedProfiles("stories");
          else if (state.route === "highlights") showTaggedProfiles("highlights");
          else Toasts.info("Open a story or highlight first.");
        }
      },
      { label: "Keyboard Shortcuts", kw: "shortcuts help keys overlay", fn: toggleShortcutsHelp },
      {
        label: "Close Dialogs",
        kw: "close modals dismiss",
        fn: function () {
          ModalStack.closeTop();
        }
      },
      { label: "Reload " + NAME, kw: "reload restart refresh", fn: reloadScript }
    ];
    var wrap = $('<div class="ignis-palette">');
    var card = $('<div class="ignis-pal-card">');
    var inp = $('<input class="ignis-pal-inp" type="text" placeholder="Type a command…" spellcheck="false">');
    var listBox = $('<div class="ignis-pal-list">');
    var shown = actions.slice();
    var active = 0;
    function paint() {
      listBox.children(".ignis-pal-it").each(function (i) {
        $(this).toggleClass("ignis-pal-on", i === active);
      });
      var el = listBox.children(".ignis-pal-on")[0];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    }
    function render(q) {
      q = (q || "").trim().toLowerCase();
      shown = actions.filter(function (a) {
        return !q || a.label.toLowerCase().indexOf(q) > -1 || a.kw.indexOf(q) > -1;
      });
      active = 0;
      listBox.empty();
      if (!shown.length) {
        listBox.append('<div class="ignis-empty" style="padding:18px">No matching commands.</div>');
        return;
      }
      shown.forEach(function (a, i) {
        var it = $('<div class="ignis-pal-it" role="button" tabindex="-1">').text(a.label);
        it.on("mouseenter", function () {
          active = i;
          paint();
        });
        it.on("click", function () {
          close();
          a.fn();
        });
        listBox.append(it);
      });
      paint();
    }
    function close() {
      wrap.remove();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      $(document).off("keydown.igpal");
    }
    inp.on("input", function () {
      render(inp.val());
    });
    wrap.on("mousedown", function (e) {
      if (e.target === wrap[0]) close();
    });
    card.append(inp, listBox);
    wrap.append(card);
    $body.append(wrap);
    $(document).on("keydown.igpal", function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (shown.length) {
          active = (active + 1) % shown.length;
          paint();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (shown.length) {
          active = (active - 1 + shown.length) % shown.length;
          paint();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        var a = shown[active];
        close();
        if (a) a.fn();
      }
    });
    render("");
    setTimeout(function () {
      inp.trigger("focus");
    }, 0);
  }

  function installCommandPalette() {
    document.addEventListener("keydown", function (e) {
      if (!USER_SETTING.COMMAND_PALETTE) return;
      if (ignoreShortcut(e)) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        toggleCommandPalette();
      }
    });
  }

  // ─── Alt hotkeys ───────────────────────────────────────────────────────
  function installAltHotkeys() {
    $(window).on("keydown.igAlt", function (e) {
      if (ignoreShortcut(e)) return;
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var code = e.keyCode || e.which;
      if (code === 81) {
        e.preventDefault();
        ModalStack.closeTop();
      } else if (code === state.settingsHotkeyKeyCode) {
        e.preventDefault();
        showSetting();
      } else if (code === state.debugHotkeyKeyCode) {
        e.preventDefault();
        showDebugDOM();
      } else if (code === 75 && USER_SETTING.COMMAND_PALETTE) {
        e.preventDefault();
        toggleCommandPalette();
      } else if (code === 84) {
        e.preventDefault();
        if (state.route === "story") showTaggedProfiles("stories");
        else if (state.route === "highlights") showTaggedProfiles("highlights");
        else Toasts.info("Open a story or highlight first.");
      } else if (code === 82) {
        e.preventDefault();
        reloadScript();
      } else if (code === state.downloadStoryHotkeyKeyCode) {
        e.preventDefault();
        if (state.route === "story") $(".ignis-sd").first().trigger("click");
        else if (state.route === "highlights") $(".ignis-hd").first().trigger("click");
        else
          Toasts.info(
            "Open a story first, then press " + getPlatformModifierKey() + "+" + String.fromCharCode(code) + "."
          );
      }
    });
  }

  // ─── Reload & menu ─────────────────────────────────────────────────────
  function reloadScript() {
    $(document).off(".ignisEvents");
    state.bodyEventsRegistered = false;
    registerBodyHandlers();
    installDomObserver();
    Router.enter();
    Toasts.info(NAME + " reloaded.");
  }

  function showAbout() {
    showSetting("about");
  }

  function registerMenuCommand() {
    state.registerMenuIds.forEach(function (id) {
      try {
        Promise.resolve(manager.unmenu?.(id)).catch(() => {});
      } catch (e) {
        /* ignore */
      }
    });
    state.registerMenuIds = [];
    function add(label, accessKey, fn) {
      try {
        if (manager.menu)
          Promise.resolve(manager.menu(label, fn, accessKey)).then(
            (id) => state.registerMenuIds.push(id),
            () => {}
          );
      } catch (e) {
        logger("menu registration failed:", label);
      }
    }
    add("Settings", "w", showSetting);
    add("Filename Template", "t", openRenameEditor);
    add("Hotkey Settings", "q", showHotkeySetting);
    add("Command Palette", "k", toggleCommandPalette);
    add("About " + NAME, "i", showAbout);
    add("Debug Window", "z", showDebugDOM);
    add("Reload Script", "r", reloadScript);
  }

  // ─── Boot ──────────────────────────────────────────────────────────────
  async function ignisBoot() {
    if (state.booted) return;
    state.booted = true;
    $body = $("body");
    installStyle();
    await Store.warm();
    initSettings();
    initPersistentCache().then(purgeCache);
    Stats.session();
    registerMenuCommand();
    registerBodyHandlers();
    registerPerformanceObserver();
    installKeyboardShortcuts();
    installAltHotkeys();
    installCommandPalette();

    Router.start();
    Router.enter();
    installDomObserver();
    setTimeout(function () {
      scanAll();
    }, 250);

    logger(NAME, "v" + VERSION, "ready \u2192 route:", state.route || location.pathname);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ignisBoot);
  } else {
    ignisBoot();
  }
})();
