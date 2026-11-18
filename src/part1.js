// ==UserScript==
// @name               IGNIS — Instagram Enhancement Suite
// @version            1.0.1
// @description        IGNIS: high-quality downloads (posts, reels, stories, highlights, HD avatars, DASH video+audio MP4 mux, captions, EXIF), tagged-profile lookup, IndexedDB caches, local statistics, and a rebuilt interface.
// @author             IGNIS
// @match              https://www.instagram.com/*
// @match              https://instagram.com/*
// @downloadURL        https://github.com/mheci/Ignis/releases/latest/download/ignis.user.js
// @updateURL          https://github.com/mheci/Ignis/releases/latest/download/ignis.user.js
// @require            https://code.jquery.com/jquery-4.0.0.min.js#sha256=39a546ea9ad97f8bfaf5d3e0e8f8556adb415e470e59007ada9759dce472adaa
// @require            https://cdn.jsdelivr.net/npm/mediabunny@1.34.5/dist/bundles/mediabunny.min.cjs#sha256=c14151fb1d9b0efa6a80c0151b2d82bc6bd42f28d31af1b2e145009bcada7b95
// @grant              GM_addStyle
// @grant              GM_download
// @grant              GM_deleteValue
// @grant              GM_getValue
// @grant              GM_notification
// @grant              GM_registerMenuCommand
// @grant              GM_setValue
// @grant              GM_unregisterMenuCommand
// @grant              GM_openInTab
// @grant              GM_xmlhttpRequest
// @grant              GM.getValue
// @grant              GM.setValue
// @grant              GM.deleteValue
// @grant              GM.download
// @grant              GM.openInTab
// @grant              GM.notification
// @grant              GM.registerMenuCommand
// @grant              GM.unregisterMenuCommand
// @grant              GM.xmlHttpRequest
// @connect            instagram.com
// @connect            cdninstagram.com
// @connect            fbcdn.net
// @noframes
// @license            GPL-3.0-only
// @compatible         chrome >= 100
// @compatible         edge >= 100
// @compatible         firefox >= 100
// @run-at             document-end
// ==/UserScript==
// Managers may concatenate @requires without semicolons. Mediabunny ends
// with a conditional CommonJS export; do not let it capture our IIFE.
;(function () {
  "use strict";

  const VERSION = "__IGNIS_VERSION__";
  const NAME = "IGNIS";
  const $ = jQuery;

  // Navigation events cover history changes in the page's own realm. On older
  // browsers the DOM observer also compares location.href after site renders.
  var __ignisOnNavigate = null;
  function __ignisHandleNavigate() {
    __ignisOnNavigate?.();
  }
  window.addEventListener("popstate", __ignisHandleNavigate);
  window.addEventListener("hashchange", __ignisHandleNavigate);
  window.navigation?.addEventListener("currententrychange", __ignisHandleNavigate);

  // ─── Settings catalog [key, category, label, description, default] ─────
  const SETTINGS = [
    ["AUTO_RENAME", "download", "Auto Rename Files", "Auto-renames downloaded files. Click the label to edit the template.", true],
    ["RENAME_PUBLISH_DATE", "download", "Use Publish Date in Filename", "Uses the post publish date instead of the download time.", true],
    ["CAPTURE_IMAGE_VIA_MEDIA_CACHE", "download", "Capture Images via Cache", "Keeps recently seen image URLs as fallbacks for missing or expired downloads.", true],
    ["DOWNLOAD_ORIGINAL_QUALITY", "download", "Download Original Quality", "Uses the largest image variant actually offered by the page; signed URLs are not modified.", true],
    ["FORCE_RESOURCE_VIA_MEDIA", "download", "Fetch via Media API", "Allows optional metadata lookups for complete media lists and DASH. Turn off for page-only post extraction.", true],
    ["PREFER_DASH_MANIFEST", "download", "Prefer DASH Manifest", "Merges supported, complete MP4 video and audio tracks; otherwise uses the offered progressive file.", true],
    ["FALLBACK_TO_BLOB_FETCH_IF_MEDIA_API_THROTTLED", "download", "Use Offered Story Link on API Failure", "Uses a link already provided for this story if the optional quality lookup fails or is rate-limited. Does not retry access denials.", true],
    ["MODIFY_RESOURCE_EXIF", "download", "Add EXIF Metadata", "Adds post URL, date and author to image EXIF.", true],
    ["DOWNLOAD_WITH_CAPTION", "download", "Download with Caption (.txt)", "Also saves the post caption as a .txt file alongside the media.", false],
    ["DIRECT_DOWNLOAD_ALL", "download", "Direct Download All", "Downloads every item of a post immediately, without a dialog.", false],
    ["DIRECT_DOWNLOAD_STORY", "download", "Direct Download Story", "Downloading a story saves every item immediately, without a dialog.", false],
    ["DIRECT_DOWNLOAD_VISIBLE_RESOURCE", "download", "Download Visible Resource", "Directly downloads only the currently visible carousel item.", false],
    ["DOWNLOAD_STORY_HIGHLIGHTS", "download", "Download Story Highlights", "Story 'Download All' also includes the user's highlights.", false],
    ["MATCH_VIDEO_FILENAME_TO_THUMBNAIL", "download", "Match Video Name to Thumbnail", "Names video downloads after their thumbnail file instead of the rename template.", false],
    ["NEW_TAB_HIGHEST_VIDEO", "download", "New Tab Uses Highest Video", "Opens the highest-quality video-only DASH stream in a new tab, without audio.", false],
    ["DOWNLOAD_PROFILE_PIC_HD", "download", "Download HD Profile Pic", "Requests the highest-resolution profile picture available.", true],
    ["USE_EXTERNAL_DOWNLOAD_MODE", "download", "Use External Download Mode", "Downloads via the browser download manager (GM_download) instead of in-memory blobs — best for large videos.", false],
    ["SKIP_VIEW_STORY_CONFIRM", "download", "Skip View Story Confirmation", "Clicks the confirmation button when Instagram asks whether to view a story.", false],
    ["SKIP_SHARED_WITH_YOU_DIALOG", "download", "Skip Shared-With-You Dialog", "Closes the 'shared this with you' dialog on ?igsh= links.", false],
    ["KEYBOARD_DOWNLOAD_S", "keyboard", "S Download", "S downloads the focused post.", true],
    ["KEYBOARD_SHORTCUTS_HELP", "keyboard", "Keyboard Shortcuts Help", "Shift+? shows the shortcuts overlay.", true],
    ["COMMAND_PALETTE", "keyboard", "Command Palette", "Ctrl+K (Cmd+K on Mac, Alt+K anywhere) opens the quick command palette.", true],
    ["TRACK_DOWNLOAD_STATS", "stats", "Track Download Statistics", "Counts downloads and data volume locally on this device. Nothing ever leaves the browser.", true],
  ];

  const CATS = [["download", "Downloads"], ["keyboard", "Keyboard"], ["stats", "Statistics"]];

  const USER_SETTING = {};
  const CAT_MAP = {};
  const LABEL = {};
  const DESC = {};
  SETTINGS.forEach(function (s) {
    USER_SETTING[s[0]] = !!s[4];
    CAT_MAP[s[0]] = s[1];
    LABEL[s[0]] = s[2];
    DESC[s[0]] = s[3];
  });

  const PARENT_CHILD_MAPPING = {
    AUTO_RENAME: ["RENAME_PUBLISH_DATE"],
    FORCE_RESOURCE_VIA_MEDIA: [
      "FALLBACK_TO_BLOB_FETCH_IF_MEDIA_API_THROTTLED",
      "PREFER_DASH_MANIFEST",
    ],
    PREFER_DASH_MANIFEST: ["NEW_TAB_HIGHEST_VIDEO"],
  };

  const FALLBACK_APP_ID = "936619743392459";
  const IMAGE_CACHE_KEY = "URLS_OF_IMAGES_TEMPORARILY_STORED";
  const IMAGE_CACHE_MAX_AGE = 12 * 60 * 60 * 1000;
  const IMAGE_MAX_CACHE_ITEMS = 500;
  const checkInterval = 250;

  const USER_ID_CACHE_KEY = "USER_IDS_STORED";
  const USER_ID_MAX_CACHE_ITEMS = 1000;
  const POST_CACHE_MAX_ITEMS = 30;
  const POST_CACHE_MAX_AGE = 10 * 60 * 1000;

  // Persistent caches live in IndexedDB (see part6). Settings stay in GM storage.
  const PERSISTENT_CACHE_DB_NAME = "IGNIS";
  const PERSISTENT_CACHE_DB_VERSION = 1;
  const PERSISTENT_CACHE_STORE_NAME = "DATA_CACHE";
  const PERSISTENT_CACHE_FLUSH_DELAY = 500;
  // Cache key -> `state` field holding its in-memory copy.
  const PERSISTENT_CACHE_BINDINGS = {
    [IMAGE_CACHE_KEY]: "GL_imageCache",
    [USER_ID_CACHE_KEY]: "GL_userIdCache",
  };


  const SVG = {
    DOWNLOAD: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>',
    NEW_TAB: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    THUMBNAIL: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
    DOWNLOAD_ALL: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/></svg>',
    CLOSE: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    TEXT: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>',
    TAGGED_PROFILES: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>',
    LIST: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
    SPARK: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m5.6 5.6 2.1 2.1"/><path d="m16.3 16.3 2.1 2.1"/><path d="m18.4 5.6-2.1 2.1"/><path d="m7.7 16.3-2.1 2.1"/></svg>',
  };

  const resourceCountSelector =
    "*:not([data-pagelet])>*:not([role]):not([data-pagelet])>*>*>*[role]>*>ul[class] li[class]";
  const userIdCache = new Map();
  // Session-only hot cache for media discovered during the current page session.
  const mediaCache = new Map();
  let $body = $("body");

  // Runtime state of the IndexedDB cache manager (see part6).
  const persistentCacheStore = {
    backend: null,
    db: null,
    readyPromise: null,
    values: new Map(),
    pending: new Set(),
    flushTimer: null,
    flushChain: Promise.resolve(true),
  };

  // ─── State ─────────────────────────────────────────────────────────────
  const state = {
    fileRenameFormat:
      "%USERNAME%-%SOURCE_TYPE%-%SHORTCODE%-%YEAR%%MONTH%%DAY%_%HOUR%%MINUTE%%SECOND%_%ORIGINAL_NAME_FIRST%",
    registerMenuIds: [],
    currentURL: location.href,
    firstStarted: false,
    pageLoaded: false,
    route: null,
    GL_logger: [],
    GL_repeat: null,
    postPoll: null,
    homepageObserverDebounce: null,
    GL_storyConfirmSkipped: false,
    GL_dataCache: { stories: Object.create(null), highlights: Object.create(null) },
    GL_payloadCache: Object.create(null),
    GL_imageCache: {},
    GL_userIdCache: {},
    busy: 0,
    _igTab: "download",
    settingsHotkeyKeyCode: 87,
    debugHotkeyKeyCode: 90,
    downloadStoryHotkeyKeyCode: 83,
    bodyEventsRegistered: false,
  };

  // ─── Storage (crash-safe) ──────────────────────────────────────────────
  const modernGM=typeof GM === "undefined" ? {} : GM;
  const manager = {
    xhr: typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : modernGM.xmlHttpRequest?.bind(modernGM),
    download: typeof GM_download === "function" ? GM_download : modernGM.download?.bind(modernGM),
    open: typeof GM_openInTab === "function" ? GM_openInTab : modernGM.openInTab?.bind(modernGM),
    notify: typeof GM_notification === "function" ? GM_notification : modernGM.notification?.bind(modernGM),
    menu:
      typeof GM_registerMenuCommand === "function"
        ? GM_registerMenuCommand
        : modernGM.registerMenuCommand?.bind(modernGM),
    unmenu:
      typeof GM_unregisterMenuCommand === "function"
        ? GM_unregisterMenuCommand
        : modernGM.unregisterMenuCommand?.bind(modernGM)
  };
  const Store = {
    snapshot: new Map(),
    async warm() {
      if (typeof GM_getValue === "function" || !modernGM.getValue) return;
      const keys = [
        ...Object.keys(USER_SETTING),
        STATS_KEY,
        IMAGE_CACHE_KEY,
        USER_ID_CACHE_KEY,
        "G_RENAME_FORMAT",
        "G_HOTKEY_SETTINGS_KEYCODE",
        "G_HOTKEY_DEBUG_KEYCODE",
        "G_HOTKEY_DOWNLOAD_STORY_KEYCODE",
        "G_HOTKEY_DOWNLOADSTORY_KEYCODE"
      ];
      await Promise.all(
        keys.map(async (k) => {
          try {
            const v = await modernGM.getValue(k);
            if (v !== undefined) this.snapshot.set(k, v);
          } catch (_) {
            /* memory-only */
          }
        })
      );
    },
    get(key, fallback) {
      try {
        const v = typeof GM_getValue === "function" ? GM_getValue(key, fallback) : this.snapshot.get(key);
        return v === undefined ? fallback : v;
      } catch (_) {
        return fallback;
      }
    },
    write(key, value) {
      if (typeof GM_setValue === "function") return GM_setValue(key, value);
      this.snapshot.set(key, value);
      if (!modernGM.setValue) throw new Error("Manager storage unavailable");
      return modernGM.setValue(key, value);
    },
    set(key, value) {
      try {
        Promise.resolve(this.write(key, value)).catch(() => {});
      } catch (_) {
        /* session settings still work */
      }
    },
    async remove(key) {
      try {
        if (typeof GM_deleteValue === "function") await GM_deleteValue(key);
        else if (modernGM.deleteValue) await modernGM.deleteValue(key);
        else await this.write(key, {});
        this.snapshot.delete(key);
      } catch (_) {
        /* keep the original until durable migration succeeds */
      }
    },
    loadImageCache() {
      const raw = this.get(IMAGE_CACHE_KEY, {});
      if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
      return {};
    }
  };

  // ─── Download statistics (local-only) ──────────────────────────────────
  const STATS_KEY = "IGNIS_STATS_V1";
  const Stats = {
    _data: null,
    _blank() {
      return { v: 1, firstDay: Date.now(), sessions: 0, items: 0, bytes: 0, byType: {}, byDay: {}, lastAt: 0 };
    },
    _load() {
      if (!this._data) {
        var d = Store.get(STATS_KEY, null);
        const clean = this._blank(),
          count = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : 0);
        if (d?.v === 1) {
          for (const key of ["sessions", "bytes", "items", "lastAt"]) clean[key] = count(d[key]);
          clean.firstDay = count(d.firstDay) || clean.firstDay;
          for (const [k, v] of Object.entries(d.byType || {}))
            if (/^(photo|video|post|reels|stories|highlights|thumbnail|avatar|caption|other)$/.test(k))
              clean.byType[k] = count(v);
          for (const k of Object.keys(d.byDay || {})
            .filter((k) => /^\d{4}-\d\d-\d\d$/.test(k))
            .sort()
            .slice(-90))
            clean.byDay[k] = count(d.byDay[k]);
        }
        this._data = clean;
      }
      return this._data;
    },
    _save() {
      try {
        Store.set(STATS_KEY, this._data);
      } catch (e) {
        /* storage full or disabled */
      }
    },
    session() {
      if (!USER_SETTING.TRACK_DOWNLOAD_STATS) return;
      var d = this._load();
      d.sessions++;
      this._save();
    },
    record(type, bytes) {
      if (!USER_SETTING.TRACK_DOWNLOAD_STATS) return;
      var d = this._load();
      var t = String(type || "other");
      d.items++;
      d.bytes += Number(bytes) || 0;
      d.byType[t] = (d.byType[t] || 0) + 1;
      var day = new Date().toISOString().slice(0, 10);
      d.byDay[day] = (d.byDay[day] || 0) + 1;
      d.lastAt = Date.now();
      var days = Object.keys(d.byDay);
      if (days.length > 90) {
        days.sort();
        days.slice(0, days.length - 90).forEach(function (k) {
          delete d.byDay[k];
        });
      }
      this._save();
    },
    reset() {
      this._data = this._blank();
      this._save();
    }
  };

  // ─── Logging ───────────────────────────────────────────────────────────
  function logger() {
    var msg = Array.prototype.slice.call(arguments);
    if (state.GL_logger.length > 500) {
      state.GL_logger = [{ time: Date.now(), content: ["logger sliced"] }].concat(
        state.GL_logger.slice(-499)
      );
    }
    state.GL_logger.push({ time: Date.now(), content: msg });
    try {
      console.log("[" + new Date().toISOString() + "]", "[" + NAME + "]", msg.join(" "));
    } catch (e) {
      /* console blocked */
    }
  }

  // ─── Small utils ───────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function normTs(ts) {
    if (ts == null || !Number.isFinite(Number(ts)) || Number(ts) <= 0) return Math.floor(Date.now() / 1000);
    ts = Number(ts);
    return ts > 1e11 ? Math.floor(ts / 1000) : Math.floor(ts);
  }

  function sanitizeFilename(name) {
    let stem = String(name == null ? "" : name)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .replace(/[. ]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180)
      .replace(/[\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/[. ]+$/g, "");
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = "_" + stem;
    // Leave space for the extension even on byte-limited filesystems.
    const enc = new TextEncoder();
    while (enc.encode(stem).length > 220) stem = Array.from(stem).slice(0, -1).join("");
    return stem;
  }

  function isMacOS() {
    return /Mac|iPod|iPhone|iPad/i.test(navigator.userAgent);
  }

  function getPlatformModifierKey() {
    return isMacOS() ? "⌥" : "Alt";
  }

  function makeButton(icon, title, cls) {
    return $('<button type="button">').addClass(cls).attr({ "aria-label": title, title: title }).html(icon);
  }

  // Validate the authority but return the original signed URL, not a serialized rewrite.
  function trustedURL(raw, media = true) {
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    try {
      const u = new URL(value);
      const domains = media ? ["instagram.com", "cdninstagram.com", "fbcdn.net"] : ["instagram.com"];
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.port ||
        !domains.some((d) => u.hostname === d || u.hostname.endsWith("." + d))
      )
        return null;
      return value;
    } catch (_) {
      return null;
    }
  }

  function openNewTab(link) {
    const href = trustedURL(link);
    if (!href) {
      Toasts.error("No supported media link is available.");
      return false;
    }
    if (manager.open) {
      try {
        Promise.resolve(manager.open(href, { active: false, insert: true })).catch(() =>
          Toasts.error("Could not open the media tab.")
        );
        return true;
      } catch (_) {
        /* Use the native link below. */
      }
    }
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }

  function postCode(href) {
    try {
      const u = new URL(href || "", location.href);
      if (!href || !trustedURL(u.href, false)) return null;
      return u.pathname.match(/^\/(?:[a-zA-Z0-9_.]+\/)?(?:p|reel|reels)\/([A-Za-z0-9_-]{1,32})\/?$/)?.[1] || null;
    } catch (_) {
      return null;
    }
  }

  function positionHost(el) {
    if (el && getComputedStyle(el).position === "static") el.classList.add("ignis-position-host");
  }

  // ─── Username extraction (multi-strategy) ──────────────────────────────
  function cleanName(t) {
    t = String(t ?? "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();
    return /^[a-zA-Z0-9_.]{1,30}$/.test(t) ? t : null;
  }

  function getStoryUsername() {
    var name = $("body > div section._ac0a header._ac0k ._ac0l a + div a")
      .first()
      .text()
      .trim();
    var u = cleanName(name);
    if (u) return u;

    name = $('body > div section:visible header a[href^="/"]')
      .filter(function () {
        var $a = $(this);
        var href = $a.attr("href") || "";
        var parts = href.split("/").filter(Boolean);
        return (
          parts.length === 1 &&
          $a.text().trim().length > 0 &&
          !href.startsWith("/stories/") &&
          !/^\d+$/.test(parts[0])
        );
      })
      .first()
      .text()
      .trim();
    u = cleanName(name);
    if (u) return u;

    name = $("body > div section:visible header span")
      .filter(function () {
        return cleanName($(this).text()) && $(this).children().length === 0;
      })
      .first()
      .text()
      .trim();
    u = cleanName(name);
    if (u) return u;

    var parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "stories" && parts.length >= 2 && parts[1] !== "highlights" && !/^\d+$/.test(parts[1])) {
      return cleanName(parts[1]);
    }
    return null;
  }

  function getPostUsername($article) {
    if (!$article || !$article.length) return null;
    var name = $article.find("header > div:last-child > div:first-child span a")
      .first()
      .text()
      .trim();
    var u = cleanName(name);
    if (u) return u;

    name = $article
      .find('header a[href^="/"]')
      .filter(function () {
        var href = $(this).attr("href") || "";
        return href.split("/").filter(Boolean).length === 1 && $(this).text().trim();
      })
      .first()
      .text()
      .trim();
    u = cleanName(name);
    if (u) return u;

    name = $article
      .find('a[href^="/"]')
      .filter(function () {
        var href = $(this).attr("href") || "";
        var p = href.split("/").filter(Boolean);
        return p.length === 1 && /^[a-zA-Z0-9_.]{1,30}$/.test(p[0]) && !/^\d+$/.test(p[0]);
      })
      .first()
      .attr("href");
    if (name) return cleanName(name.split("/").filter(Boolean)[0]);

    var alt = $article.find("header img[alt]").first().attr("alt") || "";
    var m = alt.match(/^(.+?)(?:'s?\s+profile\s+picture|のプロフィール)/i);
    if (m) return cleanName(m[1]);
    return null;
  }

  function getHighlightsStoryUsername() {
    var name = $('body > div section:visible a[href^="/"]')
      .filter(function () {
        var href = $(this).attr("href") || "";
        var p = href.split("/").filter(Boolean);
        return p.length === 1 && /^[a-zA-Z0-9_.]{1,30}$/.test(p[0]) && !/^\d+$/.test(p[0]);
      })
      .first()
      .attr("href");
    var u = cleanName((name || "").split("/").filter(Boolean)[0]);
    if (u) return u;

    name = $('body > div section:visible header a[href^="/"]')
      .filter(function () {
        var href = $(this).attr("href") || "";
        return href.split("/").filter(Boolean).length === 1 && $(this).text().trim();
      })
      .first()
      .text()
      .trim();
    u = cleanName(name);
    if (u) return u;

    return getStoryUsername();
  }

  // ─── Story container detection ─────────────────────────────────────────
  function findStoryContainer() {
    // Instagram may keep adjacent stories mounted. Only add controls to the
    // on-screen section nearest the viewport centre, not every matching node.
    const sections = Array.from(document.querySelectorAll("section")).filter((s) => s.querySelector("video, img"));
    const ranked = sections
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          el,
          area:
            Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left)) *
            Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)),
          distance: Math.abs(r.left + r.right - innerWidth)
        };
      })
      .filter((s) => s.area > 0)
      .sort((a, b) => a.distance - b.distance || b.area - a.area);
    return $(ranked[0]?.el || []);
  }

  // ─── Loading bar / progress helpers ────────────────────────────────────
  function updateLoadingBar(isLoading) {
    state.busy = Math.max(0, state.busy + (isLoading ? 1 : -1));
    if (state.busy > 0) Progress.show();
    else if (!state.batchActive) Progress.hide();
  }

  // ─── Toast + notification system ───────────────────────────────────────
  const Toasts = (function () {
    var stack = [];
    var host = null;
    function ensure() {
      if (!host || !document.body.contains(host)) {
        host = document.createElement("div");
        host.className = "ignis-toasts";
        document.body.appendChild(host);
      }
      return host;
    }
    function show(message, type, duration) {
      var el = document.createElement("div");
      el.className = "ignis-toast ignis-toast-" + (type || "info");
      el.textContent = message;
      el.setAttribute("role", "status");
      ensure().appendChild(el);
      requestAnimationFrame(function () {
        el.classList.add("ignis-toast-in");
      });
      stack.push(el);
      while (stack.length > 5) {
        var old = stack.shift();
        if (old.parentNode) old.parentNode.removeChild(old);
      }
      var t = setTimeout(function () {
        el.classList.remove("ignis-toast-in");
        el.classList.add("ignis-toast-out");
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
          var i = stack.indexOf(el);
          if (i > -1) stack.splice(i, 1);
        }, 250);
      }, duration || 4000);
      el.addEventListener("click", function () {
        clearTimeout(t);
        el.classList.remove("ignis-toast-in");
        el.classList.add("ignis-toast-out");
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 250);
      });
    }
    return {
      info: function (m) {
        show(m, "info");
      },
      success: function (m) {
        show(m, "success");
      },
      error: function (m) {
        show(m, "error", 6000);
      },
    };
  })();

  function notify(title, text) {
    try {
      if (!manager.notify) throw Error("No manager notifications");
      Promise.resolve(manager.notify({ title, text: text || "", timeout: 5000 })).catch(() => Toasts.info(text));
    } catch (e) {
      Toasts.info((title || "") + (text ? " — " + text : ""));
    }
  }

  // ─── Progress overlay ───────────────────────────────────────────────────
  const Progress = (function () {
    var el = null;
    var label = null;
    function ensure() {
      if (!el || !document.body.contains(el)) {
        el = document.createElement("div");
        el.className = "ignis-progress";
        label = document.createElement("span");
        var spin = document.createElement("i");
        el.appendChild(spin);
        el.appendChild(label);
        document.body.appendChild(el);
      }
      return el;
    }
    return {
      show: function () {
        ensure().classList.add("ignis-progress-on");
      },
      hide: function () {
        if (el) {el.classList.remove("ignis-progress-on"); label.textContent="";}
      },
      set: function (now, total) {
        ensure();
        label.textContent = now + "/" + total;
        this.show();

      },
    };
  })();

  // ─── Persistent settings boot ───────────────────────────────────────────
  function initSettings() {
    Object.keys(USER_SETTING).forEach(function (name) {
      var v = Store.get(name, null);
      if (typeof v === "boolean") USER_SETTING[name] = v;
    });
    var fmt = Store.get("G_RENAME_FORMAT", null);
    if (typeof fmt === "string" && fmt.length > 0) state.fileRenameFormat = fmt;
    var hotkeys = [
      ["G_HOTKEY_SETTINGS_KEYCODE", "settingsHotkeyKeyCode"],
      ["G_HOTKEY_DEBUG_KEYCODE", "debugHotkeyKeyCode"],
      ["G_HOTKEY_DOWNLOAD_STORY_KEYCODE", "downloadStoryHotkeyKeyCode"]
    ];
    hotkeys.forEach(function (pair) {
      var v = Store.get(
        pair[0],
        pair[1] === "downloadStoryHotkeyKeyCode" ? Store.get("G_HOTKEY_DOWNLOADSTORY_KEYCODE", null) : null
      );
      if (Number.isInteger(v) && v >= 65 && v <= 90) state[pair[1]] = v;
    });
    state.GL_imageCache = mergeCacheEntries(IMAGE_CACHE_KEY, Store.loadImageCache());
    var cachedIds = Store.get(USER_ID_CACHE_KEY, null);
    state.GL_userIdCache = mergeCacheEntries(USER_ID_CACHE_KEY, cachedIds);
  }
