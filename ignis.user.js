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

  const VERSION = "1.0.1";
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

  /* ============================================================
     Ignis Lens — media detection & extraction
     ============================================================ */

  function decodeMediaIdFromUrl(url) {
    try {
      var u = new URL(url);
      var key = u.searchParams.get("ig_cache_key");
      if (key) {
        var raw = atob(key.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"));
        const match = /^(\d{1,30})(?:_\d+)?$/.exec(raw);
        if (match) return match[1];
      }
      var filename = u.pathname.split("/").filter(Boolean).pop() || "";
      var parts = filename.split(".")[0].split("_");
      for (var i = parts.length - 1; i >= 0; i--) {
        if (/^3\d{18}$/.test(parts[i])) return parts[i];
      }
      for (var j = parts.length - 1; j >= 0; j--) {
        if (/^\d{17,20}$/.test(parts[j])) return parts[j];
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  function parseSrcset(srcset) {
    const result = [];
    for (const m of String(srcset || "").matchAll(/(?:^|,\s*)(\S+?)\s+(\d+(?:\.\d+)?)([wx])(?=\s*(?:,|$))/g)) {
      if (trustedURL(m[1])) result.push({ url: m[1], width: Number(m[2]) });
    }
    return result.sort((a, b) => a.width - b.width);
  }

  function candidates(list) {
    return (Array.isArray(list) ? list : [])
      .filter(Boolean)
      .map((c) => ({
        url: trustedURL(c.url || c.src),
        width: Number(c.width || c.config_width) || 0,
        height: Number(c.height || c.config_height) || 0
      }))
      .filter((c) => c.url);
  }
  function bestImage(list) {
    const valid = candidates(list);
    return (USER_SETTING.DOWNLOAD_ORIGINAL_QUALITY ? valid.sort((a, b) => b.width - a.width) : valid)[0] || null;
  }
  function domImage(img) {
    if (!img) return null;
    const set = parseSrcset(img.getAttribute("srcset"));
    return (
      (USER_SETTING.DOWNLOAD_ORIGINAL_QUALITY && set.at(-1)?.url) ||
      trustedURL(img.currentSrc || img.src) ||
      set.at(-1)?.url ||
      null
    );
  }
  function mediaExtension(url, fallback) {
    try {
      return (
        new URL(url).pathname
          .match(/\.(jpe?g|webp|png|avif|gif|mp4|webm)$/i)?.[1]
          .toLowerCase()
          .replace("jpeg", "jpg") || fallback
      );
    } catch (_) {
      return fallback;
    }
  }
  function captionOf(item) {
    const text = item?.caption?.text ?? item?.caption ?? item?.edge_media_to_caption?.edges?.[0]?.node?.text;
    return typeof text === "string" ? text : null;
  }
  function normalizeItem(node, index) {
    if (!node || typeof node !== "object") return null;
    const isVideo = isReelsMediaVideo(node);
    const image = bestImage([
      ...(Array.isArray(node.display_resources) ? node.display_resources : []),
      ...(Array.isArray(node.image_versions2?.candidates) ? node.image_versions2.candidates : [])
    ]) || { url: trustedURL(node.display_url || node.display_src), width: 0, height: 0 };
    const videos = [...candidates(node.video_versions), ...candidates(node.video_resources)].sort(
      (a, b) => b.width * b.height - a.width * a.height || b.width - a.width
    );
    const best = isVideo ? videos[0] || { url: trustedURL(node.video_url), width: 0, height: 0 } : image;
    const dash = isVideo && typeof node.video_dash_manifest === "string" ? node : null;
    if (!best.url) {
      const tracks = dash && parseDashManifest(dash.video_dash_manifest);
      if (!tracks?.video) return null;
      // With no progressive alternative and no audio adaptation, this full video
      // is the only offered file. Never treat a single segment as that file.
      if (!tracks.audio) best.url = tracks.video.url;
    }
    return {
      id: String(node.pk ?? node.id ?? node.media_id ?? ""),
      isVideo,
      url: best.url,
      thumb: image.url,
      width: best.width || Number(node.dimensions?.width) || 0,
      height: best.height || Number(node.dimensions?.height) || 0,
      takenAt: node.taken_at_timestamp || node.taken_at || null,
      caption: captionOf(node),
      dash,
      ext: mediaExtension(best.url, isVideo ? "mp4" : "jpg"),
      _igSourceIndex: index + 1
    };
  }
  function normalizePostResource(resource) {
    const out = { username: null, uid: null, shortcode: null, takenAt: null, caption: null, items: [] };
    if (!resource) return out;
    const author = resource.owner || resource.user;
    out.username = author?.username || null;
    out.uid = author?.pk || author?.id || null;
    out.shortcode = resource.shortcode || resource.code || null;
    out.takenAt = resource.taken_at_timestamp || resource.taken_at || null;
    out.caption = captionOf(resource);
    const edges = resource.edge_sidecar_to_children?.edges;
    const children = Array.isArray(edges)
      ? edges.map((e) => e?.node)
      : Array.isArray(resource.carousel_media)
        ? resource.carousel_media
        : [resource];
    out.items = children.map(normalizeItem).filter(Boolean);
    return out;
  }
  function normalizeReelItems(items) {
    return Array.isArray(items) ? items.map(normalizeItem).filter(Boolean) : [];
  }

  /* ============================================================
     Ignis Fetch — API layer (timeouts, retries, safe parsing)
     ============================================================ */

  let cachedAppId = null;

  function getAppId(force) {
    if (cachedAppId && !force) return cachedAppId;
    var result = null;
    try {
      $('script[type="application/json"]').each(function () {
        var text = this.textContent || "";
        var m = text.match(/"APP_ID":"([0-9]+)"/g);
        if (m && m.length) {
          result = (m[0].match(/"APP_ID":"([0-9]+)"/) || [])[1];
          return false;
        }
      });
      if (!result) {
        $("script:not([src])").each(function () {
          var m = (this.textContent || "").match(/"APP_ID":"([0-9]+)"/);
          if (m) {
            result = m[1];
            return false;
          }
        });
      }
    } catch (e) {
      /* ignore */
    }
    cachedAppId = result || FALLBACK_APP_ID;
    return cachedAppId;
  }

  function getCookie(name) {
    try {
      var m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
      return m ? decodeURIComponent(m[1]) : "";
    } catch (e) {
      return "";
    }
  }

  function getLSD() {
    var result = null;
    $('script[type="application/json"][data-sjs]').each(function () {
      var m = (this.textContent || "").match(/\["LSD",\[\],\{"token":"([0-9a-z_-]+)"\}/i);
      if (m && !result) {
        result = m[1];
        return false;
      }
    });
    return result;
  }

  // Read-only metadata requests are ordinary same-origin browser requests.
  // No manufactured session IDs, forged client hints, cookie forwarding or
  // alternate account is needed. Session tokens are never sent to media CDNs.
  function graphQLRequest(docId, variables, friendlyName, rootName) {
    const body = new URLSearchParams({
      doc_id: docId,
      variables: JSON.stringify(variables),
      fb_api_req_friendly_name: friendlyName
    });
    const lsd = getLSD(),
      headers = { "X-IG-App-ID": getAppId(), "X-Fb-Friendly-Name": friendlyName };
    const csrf = getCookie("csrftoken");
    if (csrf) headers["X-CSRFToken"] = csrf;
    if (lsd) {
      body.set("lsd", lsd);
      headers["X-Fb-Lsd"] = lsd;
    }
    if (rootName) headers["X-Root-Field-Name"] = rootName;
    return request(new URL("/graphql/query", location.origin).href, { method: "POST", data: body, headers });
  }

  function accessError(message, status) {
    const e = new Error(message);
    e.status = status;
    e.stopLookup = true;
    return e;
  }
  function fallbackUnlessDenied(fn) {
    return (err) => {
      if (err?.stopLookup) throw err;
      return fn();
    };
  }
  function checkResponse(status, finalUrl, expected) {
    if (status === 429) throw accessError("Instagram rate limit reached. Please try again later.", 429);
    if (status === 401 || status === 403) throw accessError("Instagram did not grant access to this item.");
    if (
      finalUrl &&
      (!trustedURL(finalUrl, false) ||
        new URL(finalUrl).origin !== new URL(expected).origin ||
        /^\/(accounts\/login|challenge|checkpoint|consent)(\/|$)/i.test(new URL(finalUrl).pathname))
    )
      throw accessError("Instagram requires a login or confirmation.");
    if (status < 200 || status >= 300) throw new Error("Instagram returned HTTP " + status);
  }
  async function request(url, opts = {}) {
    if (!trustedURL(url, false) || new URL(url).origin !== location.origin) throw new Error("Unsupported API origin");
    const method = opts.method || "GET";
    let remaining = method === "GET" ? Math.min(2, Math.max(0, Math.floor(Number(opts.retries) || 0))) : 0;
    for (;;) {
      let received = false;
      try {
        return await fetchWithTimeout(
          url,
          {
            method,
            credentials: "same-origin",
            redirect: "manual",
            headers: { Accept: "application/json", ...opts.headers },
            body: opts.data
          },
          opts.timeout || 12000,
          async (response) => {
            received = true;
            if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400))
              throw accessError("Instagram requires a login or confirmation.");
            checkResponse(response.status, response.url, url);
            if (/text\/html/i.test(response.headers.get("content-type") || ""))
              throw accessError("Instagram did not return media metadata.");
            const value = await response.json();
            if (!value || value.status === "fail" || value.errors?.length || value.checkpoint_url || value.challenge)
              throw accessError("Instagram could not provide this item.");
            return value;
          }
        );
      } catch (e) {
        if (received || remaining-- <= 0) throw e;
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  // ─── User ID resolution ────────────────────────────────────────────────
  function getUserIdViaSearch(username) {
    return request(location.origin + "/web/search/topsearch/?query=" + encodeURIComponent(username), {
      retries: 0,
      timeout: 12000
    }).then(function (obj) {
      var users = (obj && obj.users) || [];
      for (var i = 0; i < users.length; i++) {
        if (users[i].user && (users[i].user.username || "").toLowerCase() === username.toLowerCase()) {
          return { user: users[i].user };
        }
      }
      throw new Error("Username not found in search results");
    });
  }

  function getUserIdFromProfileInfo(username) {
    return request(location.origin + "/api/v1/users/web_profile_info/?username=" + encodeURIComponent(username), {
      headers: { "X-IG-App-ID": getAppId() },
      retries: 1,
      timeout: 10000
    }).then(function (obj) {
      var user = null;
      var hdUrl = null;
      if (obj && obj.data && obj.data.user) {
        user = obj.data.user;
        hdUrl = obj.data.user.hd_profile_pic_url_info && obj.data.user.hd_profile_pic_url_info.url;
      } else if (obj && obj.user && (obj.user.pk || obj.user.id)) {
        user = obj.user;
        hdUrl = obj.user.hd_profile_pic_url_info && obj.user.hd_profile_pic_url_info.url;
      } else if (obj && obj.status === "ok" && obj.graphql && obj.graphql.user) {
        user = obj.graphql.user;
        hdUrl = obj.graphql.user.hd_profile_pic_url_info && obj.graphql.user.hd_profile_pic_url_info.url;
      }
      if (!user) throw new Error("No user data returned");
      if (cleanName(user.username) !== cleanName(username)) throw accessError("Profile owner did not match");
      if (!user.pk && user.id) user.pk = user.id;
      if (!user.id && user.pk) user.id = user.pk;
      user._hdUrl = hdUrl || user.profile_pic_url_hd || null;
      return { user: user };
    });
  }

  function fetchWithTimeout(url, options, timeoutMs, read) {
    if (typeof AbortController === "undefined") return fetch(url, options).then(read);
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs);
    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .then(read)
      .finally(function () {
        clearTimeout(timer);
      });
  }

  function getUserIdViaProfileHtml(username) {
    var normalized = String(username || "")
      .replace(/^@+/, "")
      .trim()
      .toLowerCase();
    if (!normalized) return Promise.reject(new Error("No username provided"));
    var profileUrl = new URL("/" + encodeURIComponent(normalized) + "/", location.origin).href;
    return fetchWithTimeout(
      profileUrl,
      {
        method: "GET",
        credentials: "same-origin",
        redirect: "manual",
        headers: { Accept: "text/html" }
      },
      10000,
      function (response) {
        if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400))
          throw accessError("Instagram redirected the profile request.");
        checkResponse(response.status, response.url, profileUrl);
        return response.text().then(function (html) {
          var finalUrl = new URL(response.url || profileUrl);
          var finalUsername = finalUrl.pathname.split("/").filter(Boolean)[0] || "";
          if (!/(^|\.)instagram\.com$/i.test(finalUrl.hostname) || finalUsername.toLowerCase() !== normalized) {
            throw new Error("Profile HTML redirected away from the requested profile");
          }
          var patterns = [
            /"profile_id"\s*:\s*"?(\d+)"?/,
            /"(?:logging_page_id|page_id)"\s*:\s*"profilePage_(\d+)"/,
            /"profilePage_(\d+)"/
          ];
          var id = null;
          for (var i = 0; i < patterns.length; i++) {
            var m = html.match(patterns[i]);
            if (m) {
              id = m[1];
              break;
            }
          }
          var doc = new DOMParser().parseFromString(html, "text/html");
          if (!id) {
            var metaId = doc.querySelector('meta[property="instapp:owner_user_id"]');
            var content = metaId && metaId.getAttribute("content");
            if (/^\d+$/.test(content || "")) id = content;
          }
          if (!id) throw new Error("Profile HTML did not contain a user ID");
          var pic = doc.querySelector('meta[property="og:image"]');
          return {
            user: {
              id: id,
              pk: id,
              username: normalized,
              profile_pic_url: (pic && pic.getAttribute("content")) || null,
              _hdUrl: (pic && pic.getAttribute("content")) || null
            }
          };
        });
      }
    );
  }

  function getUserIdFromPolarisSearch(username) {
    var normalized = String(username || "")
      .replace(/^@+/, "")
      .trim()
      .toLowerCase();
    if (!normalized) return Promise.reject(new Error("No username provided"));
    return graphQLRequest(
      "27706427925724183",
      {
        data: {
          context: "blended",
          include_reel: "true",
          query: normalized,
          rank_token: "",
          search_surface: "web_top_search"
        },
        hasQuery: true
      },
      "PolarisSearchBoxRefetchableQuery",
      "xdt_api__v1__fbsearch__topsearch_connection"
    ).then(function (obj) {
      var users =
        obj &&
        obj.data &&
        obj.data.xdt_api__v1__fbsearch__topsearch_connection &&
        obj.data.xdt_api__v1__fbsearch__topsearch_connection.users;
      if (!Array.isArray(users) || !users.length) throw new Error("Polaris search returned no users");
      var result = users.find(function (item) {
        return item.user && (item.user.username || "").toLowerCase() === normalized;
      });
      if (!result || !result.user) throw new Error("Polaris search returned no exact user match");
      var rawId = result.user.pk || result.user.id;
      if (!rawId) throw new Error("Polaris search result has no user ID");
      return {
        user: Object.assign({}, result.user, {
          id: String(rawId),
          pk: String(rawId),
          username: result.user.username || normalized
        })
      };
    });
  }

  function resolveUserIdLive(username) {
    return getUserIdViaProfileHtml(username).catch(fallbackUnlessDenied(() => getUserIdFromPolarisSearch(username)));
  }

  function getUserIdFromPersistentCache(username) {
    const key = String(username || "").toLowerCase();
    const id = Object.hasOwn(state.GL_userIdCache, key) && state.GL_userIdCache[key];
    if (!/^\d+$/.test(id)) return null;
    return id ? { user: { id: String(id), pk: String(id), username: username } } : null;
  }

  function putUserIdInCache(username, id) {
    if (!cleanName(username) || !/^\d{1,30}$/.test(String(id))) return false;
    var key = String(username).toLowerCase();
    var keys = Object.keys(state.GL_userIdCache);
    if (!state.GL_userIdCache[key] && keys.length >= USER_ID_MAX_CACHE_ITEMS) {
      delete state.GL_userIdCache[keys[0]];
    }
    state.GL_userIdCache[key] = String(id);
    setPersistentCache(USER_ID_CACHE_KEY, state.GL_userIdCache);
    return true;
  }

  function getUserId(username) {
    var key = String(username || "").toLowerCase();
    if (!cleanName(key)) return Promise.reject(new Error("Invalid username"));
    if (state.booted && !persistentCacheStore.backend) return initPersistentCache().then(() => getUserId(key));
    if (userIdCache.size >= USER_ID_MAX_CACHE_ITEMS && !userIdCache.has(key))
      userIdCache.delete(userIdCache.keys().next().value);
    if (userIdCache.has(key)) return userIdCache.get(key);

    var persisted = getUserIdFromPersistentCache(key);
    if (persisted) {
      userIdCache.set(key, Promise.resolve(persisted));
      return userIdCache.get(key);
    }

    var p = resolveUserIdLive(key)
      .catch(fallbackUnlessDenied(() => getUserIdFromProfileInfo(key)))
      .catch(fallbackUnlessDenied(() => getUserIdViaSearch(key)))
      .then(function (info) {
        var id = info && info.user && (info.user.pk || info.user.id);
        if (id) putUserIdInCache(key, id);
        return info;
      })
      .catch(function (err) {
        userIdCache.delete(key);
        if (err?.stopLookup) throw err;
        throw new Error("Cannot resolve user ID for: " + key);
      });
    userIdCache.set(key, p);
    return p;
  }

  // ─── Reels (stories / highlights) ──────────────────────────────────────
  function normalizeReelPayload(obj, isHighlight) {
    if (!obj || !obj.data) return obj;
    var data = obj.data;
    var direct = data.xdt_api__v1__feed__reels_media;
    if (direct && Array.isArray(direct.reels_media) && !data.reels_media) {
      data.reels_media = direct.reels_media;
    }
    var connection = data.xdt_api__v1__feed__reels_media__connection;
    if (connection && Array.isArray(connection.edges) && connection.edges.length) {
      var nodes = connection.edges
        .map(function (edge) {
          return edge && edge.node;
        })
        .filter(Boolean);
      if (nodes.length) {
        if (isHighlight && nodes[0] && Array.isArray(nodes[0].items)) nodes[0].items.reverse();
        data.reels_media = nodes;
      }
    }
    return obj;
  }

  function getStories(userId, expectedUsername, _retried) {
    return graphQLRequest(
      "29170422829314651",
      {
        reel_ids_arr: [String(userId)],
        __relay_internal__pv__PolarisCommunityNoteStoriesLabelEnabledrelayprovider: true
      },
      "PolarisStoriesV3ReelPageStandaloneQuery",
      "xdt_api__v1__feed__reels_media"
    ).then(function (obj) {
      normalizeReelPayload(obj, false);
      var reel = obj && obj.data && obj.data.reels_media && obj.data.reels_media[0];
      var owner = reel && (reel.owner || reel.user);
      if (
        expectedUsername &&
        owner &&
        owner.username &&
        owner.username.toLowerCase() !== expectedUsername.toLowerCase()
      ) {
        if (_retried) throw new Error("Story owner mismatch");
        var key = expectedUsername.toLowerCase();
        delete state.GL_userIdCache[key];
        setPersistentCache(USER_ID_CACHE_KEY, state.GL_userIdCache);
        userIdCache.delete(key);
        return resolveUserIdLive(key).then(function (info) {
          var fresh = info && info.user && (info.user.pk || info.user.id);
          if (fresh && String(fresh) !== String(userId)) {
            putUserIdInCache(key, fresh);
            userIdCache.set(key, Promise.resolve(info));
            return getStories(String(fresh), expectedUsername, true);
          }
          throw new Error("Story owner mismatch");
        });
      }
      return obj;
    });
  }

  function getHighlightStories(highlightId) {
    highlightId = String(highlightId || "").replace(/^highlight:/, "");
    if (!/^\d+$/.test(highlightId)) return Promise.reject(new Error("Invalid highlight link"));
    return graphQLRequest(
      "29299425373007309",
      {
        initial_reel_id: "highlight:" + highlightId,
        reel_ids: ["highlight:" + highlightId],
        first: 999,
        last: 0,
        __relay_internal__pv__PolarisCommunityNoteStoriesLabelEnabledrelayprovider: true
      },
      "PolarisStoriesV3HighlightsPageQuery",
      "xdt_api__v1__feed__reels_media__connection"
    ).then(function (obj) {
      return normalizeReelPayload(obj, true);
    });
  }

  function getUserHighlights(userId) {
    return request(location.origin + "/api/v1/highlights/" + encodeURIComponent(userId) + "/highlights_tray/", {
      headers: { "X-IG-App-ID": getAppId() },
      retries: 0,
      timeout: 12000
    }).then(function (obj) {
      if (obj && obj.status === "ok" && Array.isArray(obj.tray)) return obj.tray;
      throw new Error("Highlights tray unavailable");
    });
  }

  function shortcodeToMediaId(code) {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    var id = 0n;
    for (var i = 0; i < code.length; i++) {
      id = id * 64n + BigInt(alphabet.indexOf(code[i]));
    }
    return id.toString();
  }

  function matchesPost(item, code) {
    if (!item || !/^[A-Za-z0-9_-]{1,32}$/.test(code)) return false;
    if (item.code || item.shortcode) return (item.code || item.shortcode) === code;
    return String(item.pk || item.id || "").split("_")[0] === shortcodeToMediaId(code);
  }

  function extractPostFromPageJson(postPath) {
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      const text = script.textContent || "";
      if (!/xdt_api__v1__media__shortcode__web_info|xig_polaris_media|shortcode_media/.test(text)) continue;
      let root;
      try {
        root = JSON.parse(text);
      } catch (_) {
        continue;
      }
      const stack = [root];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        const pol = node.xig_polaris_media;
        const available = [
          ...(Array.isArray(node.xdt_api__v1__media__shortcode__web_info?.items)
            ? node.xdt_api__v1__media__shortcode__web_info.items
            : []),
          pol?.if_not_gated_logged_out,
          pol?.if_not_gated,
          pol?.media,
          node.shortcode_media,
          node.xdt_shortcode_media
        ];
        const item = available.find((it) => matchesPost(it, postPath) && normalizePostResource(it).items.length);
        if (item) return { type: "page", resource: item };
        for (const value of Object.values(node)) if (value && typeof value === "object") stack.push(value);
      }
    }
    return null;
  }

  function getPostPayload(shortcode, pageChecked = false) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(shortcode || "")) return Promise.reject(new Error("Invalid post link"));
    var cached = state.GL_payloadCache[shortcode];
    if (cached && Date.now() - cached.ts < POST_CACHE_MAX_AGE) {
      return Promise.resolve(cached.value);
    }
    function cache(res) {
      var keys = Object.keys(state.GL_payloadCache);
      if (keys.length >= POST_CACHE_MAX_ITEMS && !state.GL_payloadCache[shortcode]) {
        delete state.GL_payloadCache[keys[0]];
      }
      state.GL_payloadCache[shortcode] = { ts: Date.now(), value: res };
      return res;
    }
    var page = !pageChecked && extractPostFromPageJson(shortcode);
    if (page) return Promise.resolve(cache(page));

    if (!USER_SETTING.FORCE_RESOURCE_VIA_MEDIA)
      return Promise.reject(new Error("No downloadable media on this page"));
    return graphQLRequest(
      "39422285384081769",
      {
        shortcode: shortcode,
        __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: true,
        __relay_internal__pv__PolarisThreadsStyleCommentsEnabledrelayprovider: false,
        __relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider: true
      },
      "PolarisPostRootQuery",
      "xdt_api__v1__media__shortcode__web_info"
    )
      .then(function (obj) {
        var items =
          obj &&
          obj.data &&
          obj.data.xdt_api__v1__media__shortcode__web_info &&
          obj.data.xdt_api__v1__media__shortcode__web_info.items;
        if (Array.isArray(items) && matchesPost(items[0], shortcode)) {
          var item = items[0];
          if (item.user && !item.owner) item.owner = item.user;
          return cache({ type: "query_id", resource: item });
        }
        throw new Error("Post payload unavailable");
      })
      .catch(
        fallbackUnlessDenied(function () {
          var pk = shortcodeToMediaId(shortcode);
          return request(location.origin + "/api/v1/media/" + encodeURIComponent(pk) + "/info/", {
            headers: { "X-IG-App-ID": getAppId() },
            retries: 0,
            timeout: 10000
          }).then(function (obj) {
            if (obj && obj.status === "ok" && matchesPost(obj.items?.[0], shortcode)) {
              var item = obj.items[0];
              if (item.user && !item.owner) item.owner = item.user;
              return cache({ type: "query_id", resource: item });
            }
            throw new Error("Post payload unavailable");
          });
        })
      );
  }

  function getMediaInfo(mediaId) {
    if (!/^\d+(?:_\d+)?$/.test(String(mediaId))) return Promise.reject(new Error("Invalid media id"));
    return request(location.origin + "/api/v1/media/" + encodeURIComponent(mediaId) + "/info/", {
      headers: { "X-IG-App-ID": getAppId() },
      timeout: 8000
    });
  }

  function getUserHdAvatar(userId, expectedUsername) {
    return graphQLRequest(
      "40158838120366999",
      {
        enable_integrity_filters: true,
        id: String(userId),
        __relay_internal__pv__PolarisCannesGuardianExperienceEnabledrelayprovider: true,
        __relay_internal__pv__PolarisCASB976ProfileEnabledrelayprovider: false,
        __relay_internal__pv__PolarisProfileInformTreatmentBannerEnabledrelayprovider: false,
        __relay_internal__pv__PolarisWebSchoolsEnabledrelayprovider: false,
        __relay_internal__pv__PolarisProfileRingsGradientEnabledrelayprovider: true,
        __relay_internal__pv__PolarisRepostsConsumptionEnabledrelayprovider: true,
        __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: true
      },
      "PolarisProfilePageContentQuery",
      null
    ).then(function (obj) {
      var user = obj && obj.data && obj.data.user;
      if (
        expectedUsername &&
        user &&
        user.username &&
        user.username.toLowerCase() !== expectedUsername.toLowerCase()
      ) {
        throw new Error("Avatar owner mismatch");
      }
      var url = user && user.hd_profile_pic_url_info && user.hd_profile_pic_url_info.url;
      if (url) return url;
      if (user && user.profile_pic_url_hd) return user.profile_pic_url_hd;
      throw new Error("HD profile picture unavailable");
    });
  }

  function isReelsMediaVideo(item) {
    if (!item) return false;
    if (item.is_video === true) return true;
    if (item.is_video === false) return false;
    if (item.video_versions && item.video_versions.length) return true;
    if (item.video_resources && item.video_resources.length) return true;
    if (item.video_dash_manifest) return true;
    if (item.video_url || item.__typename === "GraphVideo") return true;
    if (item.media_type != null) return Number(item.media_type) === 2;
    return false;
  }

  /* ============================================================
     Ignis Forge — download engine
     ============================================================ */

  const MAX_TRACK_BYTES = 128 * 1024 * 1024;
  const CDN_IDLE_MS = 45000;
  function mediaStatusError(status) {
    return Object.assign(new Error("Media returned HTTP " + status), {
      stopLookup: [401, 403, 429, 451].includes(status),
      canTryAlternate: status === 404 || status === 410
    });
  }
  function validateMediaType(type) {
    if (type && !/^(image\/(?:jpe?g|webp|avif|png|gif)|(?:video|audio)\/[\w.+-]+|application\/(?:octet-stream|mp4|binary))$/i.test(type.split(";")[0].trim()))
      throw Object.assign(new Error("Server did not return media"), { stopLookup: true });
  }
  function gmFetch(raw, responseType) {
    const url = trustedURL(raw);
    if (!url) return Promise.reject(new Error("Unsupported media link"));
    if (!manager.xhr) return Promise.reject(new Error("This userscript manager cannot fetch media"));
    return new Promise((resolve, reject) => {
      let handle, timer, done = false, received = 0;
      const finish = (err, value) => {
        if (done) return;
        done = true; clearTimeout(timer);
        if (err) reject(err); else resolve(value);
      };
      const stop = err => { finish(err); try { handle?.abort?.(); } catch (_) {} };
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => stop(new Error("Media transfer stopped making progress")), CDN_IDLE_MS);
      };
      const options = {
        method: "GET", url, responseType, anonymous: true, redirect: "error", timeout: 60000,
        onprogress(ev) {
          if (done) return;
          if (responseType === "arraybuffer" && Math.max(ev.total || 0, ev.loaded || 0) > MAX_TRACK_BYTES)
            return stop(new Error("DASH track is too large for in-memory merging"));
          if (ev.loaded > received) { received = ev.loaded; arm(); }
        },
        onload(res) {
          if (done) return;
          try {
            if (res.status < 200 || res.status >= 300) throw mediaStatusError(res.status);
            if (!trustedURL(res.finalUrl || url)) throw new Error("Unsupported media redirect");
            validateMediaType(/^content-type:\s*([^;\r\n]+)/im.exec(res.responseHeaders || "")?.[1] || res.response?.type);
            const size = res.response?.size || res.response?.byteLength || 0;
            if (!size) throw new Error("Empty media response");
            if (responseType === "arraybuffer" && size > MAX_TRACK_BYTES) throw new Error("DASH track too large");
            logger("Media transfer complete", responseType, size);
            finish(null, res.response);
          } catch (err) { finish(err); }
        },
        onerror: () => finish(Object.assign(new Error("Media request failed"), {canTryAlternate: true})),
        ontimeout: () => stop(new Error("Media request timed out")),
        onabort: () => finish(new Error("Media request cancelled"))
      };
      arm();
      try {
        handle = manager.xhr(options);
        if (handle?.then) handle.then(r => { if (r) options.onload(r); }, e => finish(e));
      } catch (err) { finish(err); }
    });
  }

  // Read a complete public DASH track in the browser when its CDN permits
  // CORS. This keeps large binary messages out of extension-worker IPC.
  async function fetchArrayBuffer(raw) {
    const url = trustedURL(raw);
    if (!url) throw new Error("Unsupported track URL");
    if (typeof fetch !== "function" || typeof AbortController !== "function") return gmFetch(url, "arraybuffer");
    const ctl = new AbortController();
    let timer;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => ctl.abort(), CDN_IDLE_MS); };
    arm();
    try {
      logger("Reading offered DASH track", new URL(url).hostname);
      const res = await fetch(url, {mode:"cors", credentials:"omit", redirect:"manual", signal:ctl.signal});
      if (res.type === "opaqueredirect") throw Object.assign(new Error("Refused a media redirect"), {stopLookup:true});
      if (!res.ok) throw mediaStatusError(res.status);
      validateMediaType(res.headers.get("content-type"));
      const limit = MAX_TRACK_BYTES;
      if (+res.headers.get("content-length") > limit) throw new Error("DASH track too large");
      if (res.status === 206) {
        const range = /^bytes 0-(\d+)\/(\d+)$/.exec(res.headers.get("content-range") || "");
        if (!range || Number(range[1])+1 !== Number(range[2])) throw new Error("Incomplete DASH track");
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No readable track data");
      let total = 0;
      const chunks = [];
      for (;;) {
        const {done,value} = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        arm(); total += value.byteLength;
        if (total > limit) throw new Error("DASH track too large");
        chunks.push(value);
      }
      if (!total) throw new Error("Empty DASH track");
      logger("Read complete DASH track", total);
      return new Blob(chunks).arrayBuffer();
    } finally { clearTimeout(timer); ctl.abort(); }
  }

  function managerDownload(url, name) {
    return new Promise((resolve, reject) => {
      let handle,
        done = false;
      const finish = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        err ? reject(err) : resolve();
      };
      const timer = setTimeout(() => {
        finish(new Error("Download manager timed out"));
        try {
          handle?.abort?.();
        } catch (_) {}
      }, 120000);
      try {
        handle = manager.download({
          url,
          name,
          timeout: 120000,
          onload: () => finish(),
          onerror: () => finish(new Error("Download manager rejected the file")),
          onabort: () => finish(new Error("Download cancelled")),
          ontimeout: () => finish(new Error("Download manager timed out"))
        });
        if (handle?.then)
          handle.then(
            () => finish(),
            (e) => finish(e || new Error("Download failed"))
          );
      } catch (e) {
        finish(e);
      }
    });
  }

  function needsUID(meta) {
    return (
      meta.uid == null &&
      USER_SETTING.AUTO_RENAME &&
      /%UID%/i.test(state.fileRenameFormat) &&
      cleanName(meta.username) &&
      meta.username !== "NONE"
    );
  }
  async function resolveFilenameUID(meta) {
    if (!needsUID(meta)) return meta;
    try {
      const info = await getUserId(meta.username);
      return { ...meta, uid: info.user?.id || info.user?.pk };
    } catch (_) {
      return meta;
    } // An optional filename token must not block an offered file.
  }
  async function saveFiles(raw, metadata, alternate) {
    updateLoadingBar(true);
    try {
      let url = trustedURL(raw);
      if (!url) throw new Error("Unsupported media link");
      const meta = { ...(await resolveFilenameUID(metadata)) };
      const ext = mediaExtension(url, meta.filetype || "jpg");
      meta.filetype = ext;
      const exif =
        USER_SETTING.MODIFY_RESOURCE_EXIF &&
        meta.sourceType === "photo" &&
        meta.shortcode &&
        /^(jpg|webp)$/.test(ext);
      if (
        USER_SETTING.USE_EXTERNAL_DOWNLOAD_MODE &&
        manager.download &&
        !exif &&
        !(USER_SETTING.DOWNLOAD_WITH_CAPTION && meta.caption)
      ) {
        await managerDownload(url, getSaveFileName(url, meta));
        Stats.record(meta.sourceType, 0);
      } else {
        let blob;
        try {
          blob = await gmFetch(url, "blob");
        } catch (e) {
          // Retry only an asset retrieval, never a cancelled or rejected handoff.
          if (!e.canTryAlternate || !trustedURL(alternate) || alternate === url) throw e;
          url = alternate;
          blob = await gmFetch(url, "blob");
        }
        await createSaveFileElement(url, blob, meta);
      }
      return true;
    } catch (err) {
      logger("Save failed", err.message);
      Toasts.error("Download failed: " + err.message);
      return false;
    } finally {
      updateLoadingBar(false);
    }
  }

  async function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    if (USER_SETTING.USE_EXTERNAL_DOWNLOAD_MODE && manager.download) {
      try {
        await managerDownload(url, filename);
      } finally {
        URL.revokeObjectURL(url);
      }
      return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.hidden = true;
    try {
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
  }

  function getSaveFileName(downloadLink, metadata) {
    var timestamp = normTs(USER_SETTING.RENAME_PUBLISH_DATE ? metadata.timestamp : Date.now());
    var index = metadata.index != null ? metadata.index : 1;
    var date = new Date(timestamp * 1000);
    var filetype = metadata.filetype || "jpg";

    // Optional: name a video after its thumbnail file, matching the two
    // files when they sit side by side in a download folder.
    if (
      USER_SETTING.MATCH_VIDEO_FILENAME_TO_THUMBNAIL &&
      (filetype === "mp4" || filetype === "m4a") &&
      metadata.thumbnailURL
    ) {
      try {
        var thumbBase = new URL(metadata.thumbnailURL).pathname.split("/").pop().split(".").slice(0, -1).join(".");
        if (thumbBase) return sanitizeFilename((metadata.username || "instagram") + "_" + thumbBase) + "." + filetype;
      } catch (e) {
        /* fall through to the template */
      }
    }

    var original_name = "";
    try {
      original_name = decodeURIComponent(
        String(new URL(downloadLink).pathname.split("/").filter(Boolean).pop() || "")
      );
    } catch (e) {
      /* ignore */
    }
    var base = original_name.split(".").slice(0, -1).join(".");
    original_name = base || original_name;
    var tokens = {
      USERNAME: metadata.username || "NONE",
      SOURCE_TYPE: metadata.sourceType || "post",
      SHORTCODE: metadata.shortcode || "",
      YEAR: String(date.getFullYear()),
      "2-YEAR": String(date.getFullYear()).substr(-2),
      MONTH: pad2(date.getMonth() + 1),
      DAY: pad2(date.getDate()),
      HOUR: pad2(date.getHours()),
      MINUTE: pad2(date.getMinutes()),
      SECOND: pad2(date.getSeconds()),
      ORIGINAL_NAME: original_name,
      ORIGINAL_NAME_FIRST: original_name.split("_")[0] || original_name,
      INDEX: String(index),
      UID: metadata.uid != null ? String(metadata.uid) : ""
    };
    var filename = (state.fileRenameFormat || "").replace(/%([\w\-]+)%/g, function (m, t) {
      var up = t.toUpperCase();
      return tokens[up] != null ? tokens[up] : m;
    });
    filename = sanitizeFilename(filename);
    if (!USER_SETTING.AUTO_RENAME || !filename) {
      filename = sanitizeFilename(
        (metadata.username || "instagram") + "_" + (original_name || "media") + "_" + (metadata.shortcode || "")
      );
    }
    return filename + "." + filetype;
  }

  async function createSaveFileElement(downloadLink, object, metadata) {
    const mimeExt = {
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/png": "png",
      "image/gif": "gif",
      "image/avif": "avif",
      "video/mp4": "mp4",
      "video/webm": "webm"
    };
    metadata = {
      ...metadata,
      filetype: mimeExt[object.type?.split(";")[0].toLowerCase()] || metadata.filetype || "jpg"
    };
    const name = getSaveFileName(downloadLink, metadata);
    let blob = object;
    if (
      USER_SETTING.MODIFY_RESOURCE_EXIF &&
      /^(jpg|webp)$/.test(metadata.filetype) &&
      metadata.shortcode &&
      metadata.sourceType === "photo"
    ) {
      try {
        blob = await changeExifData(object, metadata);
      } catch (_) {
        logger("Unsupported image metadata layout; keeping original bytes");
      }
    }
    await triggerDownload(blob, name);
    Stats.record(metadata.sourceType, blob.size);
    if (USER_SETTING.DOWNLOAD_WITH_CAPTION && metadata.caption) {
      const caption = new Blob([metadata.caption], { type: "text/plain;charset=utf-8" });
      try {
        await triggerDownload(caption, name.replace(/\.[^.]+$/, ".txt"));
        Stats.record("caption", caption.size);
      } catch (_) {
        Toasts.error("Media saved, but the caption could not be saved.");
      }
    }
  }

  // ─── EXIF writer (JPEG APP1 + WebP EXIF chunk) ─────────────────────────
  function concatBytes(...pieces) {
    const bytes = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const piece of pieces) {
      bytes.set(piece, offset);
      offset += piece.length;
    }
    return bytes;
  }
  function u32le(v) {
    return new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255]);
  }
  function u16le(v) {
    return new Uint8Array([v & 255, (v >> 8) & 255]);
  }
  function enc(s) {
    return new TextEncoder().encode(s);
  }
  function encUtf16le(s) {
    var out = new Uint8Array(s.length * 2);
    for (var i = 0; i < s.length; i++) {
      out[i * 2] = s.charCodeAt(i) & 255;
      out[i * 2 + 1] = (s.charCodeAt(i) >> 8) & 255;
    }
    return out;
  }
  function formatExifDate(timestamp) {
    var d = new Date(normTs(timestamp) * 1000);
    if (isNaN(d.getTime())) return "1970:01:01 00:00:00";
    return (
      d.getFullYear() +
      ":" +
      pad2(d.getMonth() + 1) +
      ":" +
      pad2(d.getDate()) +
      " " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes()) +
      ":" +
      pad2(d.getSeconds())
    );
  }
  function makeIFDEntry(tag, type, count, valueOrOffset) {
    var b = new Uint8Array(12);
    var dv = new DataView(b.buffer);
    dv.setUint16(0, tag, true);
    dv.setUint16(2, type, true);
    dv.setUint32(4, count, true);
    dv.setUint32(8, valueOrOffset, true);
    return b;
  }
  function fourCC(s) {
    var b = new Uint8Array(4);
    for (var i = 0; i < 4; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  function buildExifPayload(metadata) {
    const index = Math.max(1, Number(metadata.index) || 1);
    const user = cleanName(metadata.username),
      artist = enc((user || "") + "\0");
    const url = encUtf16le(`https://www.instagram.com/p/${metadata.shortcode}/?img_index=${index}\0`);
    const profile = encUtf16le((user ? `https://www.instagram.com/${user}/` : "Instagram") + "\0");
    const date = enc(formatExifDate(metadata.timestamp) + "\0");
    const header = new Uint8Array([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);
    const dirLength = (entries) => 2 + 12 * entries + 4;
    const exifDir = header.length + dirLength(4),
      dataStart = exifDir + dirLength(1),
      blocks = [];
    let next = dataStart;
    function entry(tag, type, value) {
      if (value.length <= 4)
        return makeIFDEntry(
          tag,
          type,
          value.length,
          value.reduce((v, b, i) => v + b * 256 ** i, 0)
        );
      const pos = next;
      blocks.push(value);
      next += value.length;
      if (next % 2) {
        blocks.push(new Uint8Array(1));
        next++;
      }
      return makeIFDEntry(tag, type, value.length, pos);
    }
    return concatBytes(
      enc("Exif\0\0"),
      header,
      u16le(4),
      entry(0x013b, 2, artist),
      makeIFDEntry(0x8769, 4, 1, exifDir),
      entry(0x9c9c, 1, profile),
      entry(0x9c9e, 1, url),
      u32le(0),
      u16le(1),
      entry(0x9003, 2, date),
      u32le(0),
      ...blocks
    );
  }

  function changeExifData(blob, metadata) {
    return blob.arrayBuffer().then(function (buffer) {
      var buf = new Uint8Array(buffer);
      if (buf.length < 12) throw new Error("Not a JPEG or WEBP");
      var isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
      var isWebp =
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50;
      if (!isJpeg && !isWebp) throw new Error("Not a JPEG or WEBP");

      var data = buildExifPayload(metadata);
      if (data.length + 2 > 65535) throw new Error("Metadata too large");

      if (isJpeg) {
        function app1() {
          var len = data.length + 2;
          var seg = new Uint8Array(4 + data.length);
          seg[0] = 0xff;
          seg[1] = 0xe1;
          seg[2] = (len >> 8) & 255;
          seg[3] = len & 255;
          seg.set(data, 4);
          return seg;
        }
        var out = [];
        out.push(new Uint8Array([0xff, 0xd8]));
        var i = 2;
        var inserted = false;
        var ok = true;
        while (i < buf.length) {
          if (buf[i] !== 0xff) {
            ok = false;
            break;
          }
          var m = buf[i + 1];
          if (m === 0xd9) {
            if (!inserted) {
              out.push(app1());
              inserted = true;
            }
            out.push(buf.subarray(i));
            break;
          }
          if (m === 0xda) {
            if (!inserted) {
              out.push(app1());
              inserted = true;
            }
            out.push(buf.subarray(i));
            break;
          }
          if (m >= 0xd0 && m <= 0xd7) {
            out.push(buf.subarray(i, i + 2));
            i += 2;
            continue;
          }
          if (i + 4 > buf.length) {
            ok = false;
            break;
          }
          var len = (buf[i + 2] << 8) | buf[i + 3];
          if (len < 2 || i + 2 + len > buf.length) {
            ok = false;
            break;
          }
          // Never discard orientation, camera tags or unrelated APP1/XMP data.
          if (m === 0xe1 && len >= 8 && [69, 120, 105, 102, 0, 0].every((v, k) => buf[i + 4 + k] === v)) return blob;
          out.push(buf.subarray(i, i + 2 + len));
          i += 2 + len;
        }
        if (!ok || !inserted) throw new Error("JPEG parse failed");
        var total = 0;
        out.forEach(function (p) {
          total += p.length;
        });
        var jpeg = new Uint8Array(total);
        var off = 0;
        out.forEach(function (p) {
          jpeg.set(p, off);
          off += p.length;
        });
        return new Blob([jpeg], { type: "image/jpeg" });
      }

      const dv = new DataView(buffer),
        chunks = [];
      if (dv.getUint32(4, true) !== buf.length - 8) throw new Error("Invalid WebP length");
      let pos = 12,
        extended = null,
        simple = null,
        xmp = -1;
      while (pos < buf.length) {
        if (pos + 8 > buf.length) throw new Error("Incomplete WebP chunk");
        const tag = String.fromCharCode(...buf.subarray(pos, pos + 4)),
          size = dv.getUint32(pos + 4, true);
        const end = pos + 8 + size + (size % 2);
        if (end > buf.length) throw new Error("Incomplete WebP data");
        if (tag === "EXIF") return blob;
        const chunk = buf.slice(pos, end);
        if (tag === "VP8X") {
          if (size !== 10) throw new Error("Invalid extended header");
          extended = chunk;
        }
        if (tag === "VP8 " || tag === "VP8L") simple = { tag, chunk, size };
        if (tag === "XMP ") xmp = chunks.length;
        chunks.push(chunk);
        pos = end;
      }
      // WebP EXIF is TIFF data. Chunk lengths exclude the even-byte padding.
      const tiff = data.subarray(6),
        exif = new Uint8Array(8 + tiff.length + (tiff.length % 2));
      exif.set(fourCC("EXIF"));
      exif.set(u32le(tiff.length), 4);
      exif.set(tiff, 8);
      chunks.splice(xmp < 0 ? chunks.length : xmp, 0, exif);
      if (!extended) {
        if (!simple) throw new Error("Missing WebP image");
        const { tag, chunk, size } = simple;
        let width,
          height,
          alpha = 0;
        if (tag === "VP8L" && size >= 5 && chunk[8] === 0x2f) {
          const bits = new DataView(chunk.buffer).getUint32(9, true);
          width = 1 + (bits & 0x3fff);
          height = 1 + ((bits >>> 14) & 0x3fff);
          alpha = (bits >>> 28) & 1;
        } else if (tag === "VP8 " && size >= 10 && chunk[11] === 0x9d && chunk[12] === 1 && chunk[13] === 0x2a) {
          width = (chunk[14] | (chunk[15] << 8)) & 0x3fff;
          height = (chunk[16] | (chunk[17] << 8)) & 0x3fff;
        } else throw new Error("Unsupported WebP header");
        if (!width || !height) throw new Error("Invalid WebP dimensions");
        extended = new Uint8Array(18);
        extended.set(fourCC("VP8X"));
        extended.set(u32le(10), 4);
        extended[8] = alpha ? 0x10 : 0;
        extended.set(u32le(width - 1).subarray(0, 3), 12);
        extended.set(u32le(height - 1).subarray(0, 3), 15);
        chunks.unshift(extended);
      }
      extended[8] |= 0x08;
      return new Blob(
        [fourCC("RIFF"), u32le(4 + chunks.reduce((n, c) => n + c.length, 0)), fourCC("WEBP"), ...chunks],
        { type: "image/webp" }
      );
    });
  }

  // ─── DASH pipeline ─────────────────────────────────────────────────────
  function parseDashManifest(mpdXml) {
    try {
      if (!mpdXml || typeof mpdXml !== "string") return { video: null, audio: null };
      var xml = new DOMParser().parseFromString(mpdXml, "application/xml");
      if (xml.querySelector("parsererror, ContentProtection") || xml.querySelectorAll("Period").length !== 1)
        return { video: null, audio: null };
      var reps = Array.prototype.slice.call(xml.querySelectorAll("Representation"));
      var cands = [];
      reps.forEach(function (rep) {
        var set = rep.closest("AdaptationSet");
        var mimeType = rep.getAttribute("mimeType") || (set && set.getAttribute("mimeType")) || "";
        var contentType = (set && set.getAttribute("contentType")) || "";
        var baseUrlEl = rep.querySelector("BaseURL");
        var url = baseUrlEl ? baseUrlEl.textContent : null;
        // One media segment is not a complete track. Leave segmented or protected manifests alone.
        if (
          !trustedURL(url) ||
          rep.querySelector("SegmentTemplate, SegmentList") ||
          set?.querySelector(":scope > SegmentTemplate, :scope > SegmentList") ||
          rep.closest("Period")?.querySelector(":scope > SegmentTemplate, :scope > SegmentList")
        )
          return;
        url = url.trim();
        cands.push({
          id: rep.getAttribute("id") || "",
          url: url,
          mimeType: mimeType,
          contentType: contentType,
          codecs: rep.getAttribute("codecs") || (set && set.getAttribute("codecs")) || "",
          bandwidth: parseInt(rep.getAttribute("bandwidth") || "0", 10) || 0,
          width: parseInt(rep.getAttribute("width") || "0", 10) || 0,
          height: parseInt(rep.getAttribute("height") || "0", 10) || 0
        });
      });
      var isVideo = function (c) {
        return (c.contentType || "").indexOf("video") > -1 || (c.mimeType || "").indexOf("video") === 0;
      };
      var isAudio = function (c) {
        return (c.contentType || "").indexOf("audio") > -1 || (c.mimeType || "").indexOf("audio") === 0;
      };
      var video =
        cands.filter(isVideo).sort(function (a, b) {
          return b.height - a.height || b.bandwidth - a.bandwidth || b.width - a.width;
        })[0] || null;
      var audio =
        cands.filter(isAudio).sort(function (a, b) {
          return b.bandwidth - a.bandwidth;
        })[0] || null;
      return { video: video, audio: audio };
    } catch (e) {
      logger("[DASH]", "parse error:", e && e.message ? e.message : e);
      return { video: null, audio: null };
    }
  }

  function muxDashVideoAudioToMp4(videoBuf, audioBuf) {
    var MB = Mediabunny;
    return (async function () {
      var videoInput = new MB.Input({ formats: [MB.MP4], source: new MB.BufferSource(videoBuf) });
      var audioInput = new MB.Input({ formats: [MB.MP4], source: new MB.BufferSource(audioBuf) });
      let output;
      try {
        var vTrack = await videoInput.getPrimaryVideoTrack();
        if (!vTrack || !vTrack.codec) throw new Error("No video track found");
        var aTrack = await audioInput.getPrimaryAudioTrack();
        if (!aTrack || !aTrack.codec) throw new Error("No audio track found");
        var vSink = new MB.EncodedPacketSink(vTrack);
        var aSink = new MB.EncodedPacketSink(aTrack);
        output = new MB.Output({
          format: new MB.Mp4OutputFormat({ fastStart: "in-memory" }),
          target: new MB.BufferTarget()
        });
        var vSource = new MB.EncodedVideoPacketSource(vTrack.codec);
        var aSource = new MB.EncodedAudioPacketSource(aTrack.codec);
        output.addVideoTrack(vSource, { rotation: vTrack.rotation || 0 });
        output.addAudioTrack(aSource);
        await output.start();
        var vDecoderConfig = await vTrack.getDecoderConfig();
        var aDecoderConfig = await aTrack.getDecoderConfig();
        var vMeta = vDecoderConfig ? { decoderConfig: vDecoderConfig } : undefined;
        var aMeta = aDecoderConfig ? { decoderConfig: aDecoderConfig } : undefined;
        var vIter = vSink.packets();
        var aIter = aSink.packets();
        var vNext = await vIter.next();
        var aNext = await aIter.next();
        if (vNext.done || aNext.done) throw new Error("Empty DASH track");
        const shift = Math.max(0, -Math.min(vNext.value.timestamp, aNext.value.timestamp));
        async function writeTrack(source, iterator, first, metadata) {
          let next = first;
          while (!next.done) {
            const packet = next.value;
            await source.add(shift ? packet.clone({ timestamp: packet.timestamp + shift }) : packet, metadata);
            metadata = undefined;
            next = await iterator.next();
          }
          source.close();
        }
        // Independent pumps respect backpressure even when the streams end at
        // different times. Awaiting one stalled track before writing the other can deadlock.
        await Promise.all([writeTrack(vSource, vIter, vNext, vMeta), writeTrack(aSource, aIter, aNext, aMeta)]);
        await output.finalize();
        var outBuf = output.target.buffer;
        if (outBuf instanceof ArrayBuffer) return outBuf;
        if (outBuf && outBuf.buffer) {
          return outBuf.buffer.slice(outBuf.byteOffset, outBuf.byteOffset + outBuf.byteLength);
        }
        throw new Error("Unexpected output buffer type");
      } catch (e) {
        if (output?.state === "started") await output.cancel().catch(() => {});
        throw e;
      } finally {
        videoInput.dispose?.();
        audioInput.dispose?.();
      }
    })();
  }

  async function tryDashDownload(mediaItem, meta, isPreview) {
    if (
      !USER_SETTING.PREFER_DASH_MANIFEST ||
      !USER_SETTING.FORCE_RESOURCE_VIA_MEDIA ||
      !mediaItem?.video_dash_manifest
    )
      return false;
    const { video, audio } = parseDashManifest(mediaItem.video_dash_manifest);
    if (!video) return false;
    if (isPreview) return USER_SETTING.NEW_TAB_HIGHEST_VIDEO && openNewTab(video.url);
    if (!audio) return false; // A progressive MP4 can contain sound; do not silently save a silent track instead.
    updateLoadingBar(true);
    try {
      let merged;
      try {
        const [v, a] = await Promise.all([fetchArrayBuffer(video.url), fetchArrayBuffer(audio.url)]);
        logger("Merging downloaded audio and video");
        merged = new Blob([await muxDashVideoAudioToMp4(v, a)], { type: "video/mp4" });
        logger("Merged MP4", merged.size);
      } catch (e) {
        if (e.stopLookup) throw e;
        logger("DASH unavailable; trying offered progressive media", e.message);
        return false;
      }
      // A failed file handoff is not a demux failure. Do not retry it as a second download.
      await createSaveFileElement(video.url, merged, { ...(await resolveFilenameUID(meta)), filetype: "mp4" });
      return true;
    } finally {
      updateLoadingBar(false);
    }
  }

  async function downloadResource(item, meta, opts = {}) {
    if (!item) return false;
    meta = {
      ...meta,
      sourceType:
        !meta.sourceType || meta.sourceType === "post" ? (item.isVideo ? "video" : "photo") : meta.sourceType,
      caption: item.caption || meta.caption,
      timestamp: item.takenAt || meta.timestamp,
      thumbnailURL: item.thumb || meta.thumbnailURL,
      index: item._igSourceIndex || meta.index || 1
    };
    if (item.dash) {
      try {
        if (await tryDashDownload(item.dash, meta, !!opts.preview)) return true;
      } catch (e) {
        Toasts.error("Download failed: " + e.message);
        return false;
      }
    }
    if (opts.preview) {
      if (!item.url) {
        Toasts.error("Cannot find download URL.");
        return false;
      }
      return openNewTab(item.url);
    }
    if (!item.url) {
      Toasts.error("Cannot find download URL.");
      return false;
    }
    var finalMeta = Object.assign({}, meta, {
      caption: item.caption || meta.caption,
      index: meta.index != null ? meta.index : 0,
      filetype: item.ext || meta.filetype || (item.isVideo ? "mp4" : "jpg"),
      thumbnailURL: item.thumb || meta.thumbnailURL
    });
    const alternate =
      !item.isVideo && item.id && USER_SETTING.CAPTURE_IMAGE_VIA_MEDIA_CACHE ? getImageFromCache(item.id) : null;
    return saveFiles(item.url, finalMeta, alternate);
  }

  async function batchDownload(items, meta) {
    if (!items.length) return { saved: 0, failed: 0, skipped: 0 };
    if (state.batchActive) {
      Toasts.info("A batch is already running.");
      return null;
    }
    state.batchActive = true;
    const route = location.href;
    let saved = 0,
      failed = 0;
    try {
      Progress.set(0, items.length);
      for (const [i, item] of items.entries()) {
        if (location.href !== route) break;
        const details = { ...meta, index: item._igSourceIndex || i + 1 };
        if ((meta.sourceType === "stories" || meta.sourceType === "highlights") && item.id)
          details.shortcode = item.id;
        try {
          if (await downloadResource(item, details)) saved++;
          else failed++;
        } catch (_) {
          failed++;
        }
        Progress.set(i + 1, items.length);
        if (i + 1 < items.length) await new Promise((r) => setTimeout(r, 350));
      }
      const skipped = items.length - saved - failed;
      notify(
        NAME,
        `Saved ${saved} of ${items.length} items` +
          (failed ? ` · ${failed} failed` : "") +
          (skipped ? ` · ${skipped} skipped` : "") +
          "."
      );
      return { saved, failed, skipped };
    } finally {
      state.batchActive = false;
      if (!state.busy) Progress.hide();
    }
  }

  /* ============================================================
     Ignis Render — UI (download dialog, dashboard, viewer)
     ============================================================ */

  const INTERNAL_CSS = `
:where(.ignis-modal,.ignis-toasts,.ignis-progress,.ignis-palette,.ignis-ksh,.ignis-bar,.ignis-storytools,.ignis-rd,.ignis-rn,.ignis-pd,.ignis-gd){
  --ig-brand:#f43f5e;
  --ig-brand-2:#fb923c;
  --ig-accent:#f97316;
  --ig-accent-soft:rgba(249,115,22,.12);
  --ig-surface:#ffffff;
  --ig-surface-2:#f6f6f8;
  --ig-surface-3:#ececf1;
  --ig-text:#17171a;
  --ig-text-2:#71717a;
  --ig-line:rgba(24,24,27,.09);
  --ig-line-strong:rgba(24,24,27,.16);
  --ig-shadow:0 24px 60px -20px rgba(24,24,27,.35),0 2px 8px rgba(24,24,27,.06);
  --ig-shadow-sm:0 8px 24px -12px rgba(24,24,27,.3);
  --ig-radius:18px;
  --ig-radius-sm:12px;
  --ig-overlay:rgba(16,16,20,.55);
  --ig-ring:0 0 0 3px rgba(249,115,22,.28);
  --ig-font:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
  --ig-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){
  :where(.ignis-modal,.ignis-toasts,.ignis-progress,.ignis-palette,.ignis-ksh,.ignis-bar,.ignis-storytools,.ignis-rd,.ignis-rn,.ignis-pd,.ignis-gd){
    --ig-surface:#17171b;
    --ig-surface-2:#1f1f25;
    --ig-surface-3:#2a2a32;
    --ig-text:#f4f4f5;
    --ig-text-2:#a1a1aa;
    --ig-line:rgba(255,255,255,.08);
    --ig-line-strong:rgba(255,255,255,.16);
    --ig-shadow:0 24px 60px -20px rgba(0,0,0,.8),0 2px 8px rgba(0,0,0,.35);
    --ig-shadow-sm:0 8px 24px -12px rgba(0,0,0,.7);
    --ig-overlay:rgba(0,0,0,.68);
    --ig-accent-soft:rgba(249,115,22,.16);
  }
}
.ignis-toasts{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none;max-width:min(92vw,520px)}
.ignis-toast{pointer-events:auto;display:flex;align-items:center;gap:10px;background:var(--ig-surface);color:var(--ig-text);border:1px solid var(--ig-line);border-radius:14px;padding:12px 18px;font:500 13px/1.45 var(--ig-font);box-shadow:var(--ig-shadow-sm);opacity:0;transform:translateY(-12px) scale(.97);transition:opacity .22s ease,transform .22s ease;cursor:pointer;max-width:100%}
.ignis-toast::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--ig-accent);flex-shrink:0}
.ignis-toast-in{opacity:1;transform:none}
.ignis-toast-out{opacity:0;transform:translateY(-8px)}
.ignis-toast-success::before{background:#22c55e}
.ignis-toast-error::before{background:#ef4444}
.ignis-toast-info::before{background:var(--ig-accent)}

.ignis-progress{position:fixed;bottom:24px;right:24px;z-index:2147483000;display:none;align-items:center;gap:12px;background:var(--ig-surface);color:var(--ig-text);border:1px solid var(--ig-line);border-radius:14px;padding:12px 18px;font:600 12px var(--ig-font);box-shadow:var(--ig-shadow-sm)}
.ignis-progress-on{display:flex}
.ignis-progress i{width:16px;height:16px;border-radius:50%;border:2px solid var(--ig-brand);border-top-color:transparent;animation:ignisSpin .7s linear infinite}
@keyframes ignisSpin{to{transform:rotate(360deg)}}

.ignis-modal{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;background:transparent;opacity:0;transition:opacity .2s ease;padding:24px}
.ignis-modal-in{opacity:1;background:var(--ig-overlay);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.ignis-modal-card{position:relative;width:min(760px,100%);max-height:88vh;display:flex;flex-direction:column;background:var(--ig-surface);color:var(--ig-text);border:1px solid var(--ig-line);border-radius:var(--ig-radius);box-shadow:var(--ig-shadow);overflow:hidden;transform:translateY(14px) scale(.985);transition:transform .2s cubic-bezier(.2,.8,.2,1);font-family:var(--ig-font)}
.ignis-modal-in .ignis-modal-card{transform:none}
.ignis-modal-wide .ignis-modal-card{width:min(980px,100%)}
.ignis-modal-head{display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--ig-line);flex-shrink:0}
.ignis-modal-title{font-size:16px;font-weight:700;letter-spacing:-.01em;display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.ignis-modal-title .ignis-sub{font:600 11px var(--ig-font);color:var(--ig-text-2);background:var(--ig-surface-2);border:1px solid var(--ig-line);padding:3px 9px;border-radius:999px;white-space:nowrap;letter-spacing:0}
.ignis-modal-x{width:34px;height:34px;border:none;background:transparent;color:var(--ig-text-2);border-radius:10px;display:grid;place-items:center;cursor:pointer;transition:background .15s,color .15s;flex-shrink:0}
.ignis-modal-x:hover{background:var(--ig-surface-2);color:var(--ig-text)}
.ignis-modal-body{flex:1;overflow-y:auto;padding:16px;scrollbar-width:thin;scrollbar-color:var(--ig-line-strong) transparent}
.ignis-modal-body::-webkit-scrollbar{width:10px}
.ignis-modal-body::-webkit-scrollbar-thumb{background:var(--ig-line-strong);border-radius:99px;border:3px solid var(--ig-surface)}
.ignis-modal-foot{display:flex;align-items:center;gap:10px;padding:14px 18px;border-top:1px solid var(--ig-line);flex-shrink:0;flex-wrap:nowrap;justify-content:flex-end;background:var(--ig-surface)}
.ignis-foot-gap{flex:1}

.ignis-btn{border:none;border-radius:11px;padding:10px 18px;font:600 13px var(--ig-font);cursor:pointer;transition:transform .1s,filter .15s,background .15s;display:inline-flex;align-items:center;gap:8px;min-height:40px}
.ignis-btn:active{transform:scale(.98)}
.ignis-btn:focus-visible{outline:none;box-shadow:var(--ig-ring)}
.ignis-btn:disabled{opacity:.4;cursor:not-allowed}
.ignis-btn-pri{background:linear-gradient(135deg,var(--ig-brand),var(--ig-brand-2));color:#fff;box-shadow:0 8px 18px -8px rgba(244,63,94,.65)}
.ignis-btn-pri:not(:disabled):hover{filter:brightness(1.06)}
.ignis-btn-sec{background:var(--ig-surface-2);color:var(--ig-text);border:1px solid var(--ig-line)}
.ignis-btn-sec:not(:disabled):hover{background:var(--ig-surface-3)}
.ignis-btn svg{width:15px;height:15px}
.ignis-btn-sec svg{width:14px;height:14px}

.ignis-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
@media (max-width:520px){.ignis-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}
.ignis-item{position:relative;display:flex;flex-direction:column;border:1px solid var(--ig-line);border-radius:16px;overflow:hidden;background:var(--ig-surface);transition:border-color .15s,transform .15s,box-shadow .15s}
.ignis-item:hover{border-color:var(--ig-line-strong);transform:translateY(-2px);box-shadow:var(--ig-shadow-sm)}
.ignis-item.is-selected{border-color:var(--ig-accent);box-shadow:0 0 0 1px var(--ig-accent)}
.ignis-card-media{position:relative;aspect-ratio:4/5;background:var(--ig-surface-2);overflow:hidden}
.ignis-thumb{width:100%;height:100%;object-fit:cover;display:block}
.ignis-thumb-empty{width:100%;height:100%;display:grid;place-items:center;color:var(--ig-text-2);background:repeating-linear-gradient(135deg,var(--ig-surface-2),var(--ig-surface-2) 10px,var(--ig-surface-3) 10px,var(--ig-surface-3) 20px)}
.ignis-badge{position:absolute;top:10px;right:10px;font:700 9px var(--ig-font);letter-spacing:.08em;padding:4px 8px;border-radius:999px;background:rgba(12,12,16,.7);color:#fff;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.ignis-checkmark{position:absolute;top:10px;left:10px;width:22px;height:22px;border-radius:7px;border:2px solid rgba(255,255,255,.9);background:rgba(12,12,16,.35);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:grid;place-items:center;transition:background .15s,border-color .15s}
.ignis-checkmark::after{content:"";width:10px;height:6px;border-left:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(-45deg) scale(0);transition:transform .12s;margin-top:-2px}
.ignis-checkmark:focus-visible{outline:2px solid #fff;outline-offset:2px}
.ignis-item.is-selected .ignis-checkmark{background:var(--ig-accent);border-color:var(--ig-accent)}
.ignis-item.is-selected .ignis-checkmark::after{transform:rotate(-45deg) scale(1)}
.ignis-card-body{padding:10px 12px 4px}
.ignis-type{font:600 10px var(--ig-font);color:var(--ig-text-2);letter-spacing:.06em;text-transform:uppercase;display:flex;gap:6px;align-items:center}
.ignis-type b{color:var(--ig-text);font-size:10px}
.ignis-cap{font:400 11px/1.45 var(--ig-font);color:var(--ig-text-2);margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.ignis-actions{display:flex;gap:4px;padding:6px 8px 10px;margin-top:auto}
.ignis-act{width:32px;height:32px;border:none;border-radius:9px;background:var(--ig-surface-2);color:var(--ig-text-2);display:grid;place-items:center;cursor:pointer;transition:all .12s}
.ignis-act:hover{background:var(--ig-accent);color:#fff}
.ignis-act svg{width:15px;height:15px}
.ignis-item input[type="checkbox"]{position:absolute;opacity:0;pointer-events:none}

.ignis-sel{display:flex;align-items:center;gap:9px;cursor:pointer;user-select:none;font:600 12px var(--ig-font);color:var(--ig-text);white-space:nowrap}
.ignis-sel input{position:absolute;opacity:0;width:0;height:0}
.ignis-sel span{width:18px;height:18px;border:1.5px solid var(--ig-line-strong);border-radius:6px;display:grid;place-items:center;transition:all .15s;background:var(--ig-surface);flex-shrink:0}
.ignis-sel span::after{content:"";width:9px;height:5px;border-left:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(-45deg) scale(0);transition:transform .12s;margin-top:-1px}
.ignis-sel input:checked~span{background:var(--ig-accent);border-color:var(--ig-accent)}
.ignis-sel input:checked~span::after{transform:rotate(-45deg) scale(1)}
.ignis-sel input:indeterminate~span{background:var(--ig-accent);border-color:var(--ig-accent)}
.ignis-sel input:indeterminate~span::after{transform:none;border:none;width:8px;height:2px;background:#fff;margin:0}
.ignis-count{font:700 10px var(--ig-mono);background:var(--ig-surface-2);border:1px solid var(--ig-line);border-radius:999px;padding:2px 8px;color:var(--ig-text-2)}
.ignis-empty{padding:48px 20px;text-align:center;color:var(--ig-text-2);font:500 13px var(--ig-font)}
.ignis-load{display:flex;align-items:center;justify-content:center;gap:12px;padding:56px 0;color:var(--ig-text-2);font:500 13px var(--ig-font)}
.ignis-load i{width:18px;height:18px;border-radius:50%;border:2px solid var(--ig-line);border-top-color:var(--ig-accent);animation:ignisSpin .7s linear infinite}
.ignis-hint{font-size:11px;color:var(--ig-text-2)}

.ignis-tabs{display:flex;gap:4px;padding:4px;background:var(--ig-surface-2);border:1px solid var(--ig-line);border-radius:12px;margin:0 0 12px;overflow-x:auto;flex-shrink:0;scrollbar-width:none}
.ignis-tabs::-webkit-scrollbar{display:none}
.ignis-tab{border:none;background:transparent;color:var(--ig-text-2);font:600 12px var(--ig-font);padding:8px 14px;border-radius:9px;cursor:pointer;white-space:nowrap;transition:all .15s}
.ignis-tab:hover{color:var(--ig-text)}
.ignis-tab-a{color:var(--ig-text)!important;background:var(--ig-surface);box-shadow:0 1px 4px rgba(0,0,0,.08)}
.ignis-tab b{font-size:9px;background:var(--ig-accent);color:#fff;border-radius:999px;padding:1px 6px;margin-left:6px;vertical-align:1px}
.ignis-search{margin:0 0 12px;padding:10px 14px;border:1px solid var(--ig-line);border-radius:11px;background:var(--ig-surface-2);color:var(--ig-text);font:500 13px var(--ig-font);outline:none;width:100%;box-sizing:border-box}
.ignis-search:focus{border-color:var(--ig-accent);box-shadow:var(--ig-ring)}
.ignis-search::placeholder{color:var(--ig-text-2)}

.ignis-row{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:12px;transition:background .1s;border:1px solid transparent}
.ignis-row:hover{background:var(--ig-surface-2)}
.ignis-row-txt{flex:1;min-width:0}
.ignis-row-lb{font:600 13px var(--ig-font);color:var(--ig-text);letter-spacing:-.01em}
.ignis-row-ds{font:400 11px/1.5 var(--ig-font);color:var(--ig-text-2);margin-top:2px}
.ignis-row-dis .ignis-row-lb,.ignis-row-dis .ignis-row-ds{opacity:.45}
.ignis-sw{position:relative;width:42px;height:24px;flex-shrink:0;cursor:pointer}
.ignis-sw input{position:absolute;opacity:0;width:0;height:0}
.ignis-sw i{position:absolute;inset:0;background:var(--ig-surface-3);border-radius:999px;transition:background .22s}
.ignis-sw i::before{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;background:#fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.25);transition:left .22s}
.ignis-sw input:checked~i{background:var(--ig-accent)}
.ignis-sw input:checked~i::before{left:20px}
.ignis-sw input:focus-visible~i{box-shadow:var(--ig-ring)}
.ignis-sw input:disabled~i{opacity:.5;cursor:not-allowed}
.ignis-row-edit{position:absolute;inset:0;z-index:5;display:flex;align-items:center;gap:8px;background:var(--ig-surface);border:1px solid var(--ig-accent);border-radius:12px;padding:0 12px;box-shadow:var(--ig-shadow)}
.ignis-row-wrap{position:relative}
.ignis-inp{flex:1;min-width:60px;padding:8px 12px;border:1px solid var(--ig-line);border-radius:9px;background:var(--ig-surface-2);color:var(--ig-text);font:500 12px var(--ig-mono);outline:none}
.ignis-inp:focus{border-color:var(--ig-accent);box-shadow:var(--ig-ring)}

.ignis-kbd{display:inline-flex;align-items:center;gap:4px;font:600 11px var(--ig-mono);color:var(--ig-text-2)}
.ignis-kbd kbd{background:var(--ig-surface-2);border:1px solid var(--ig-line);border-bottom-width:2px;border-radius:6px;padding:2px 7px;font:600 11px var(--ig-mono)}
.ignis-keyrow{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;cursor:pointer;transition:background .1s}
.ignis-keyrow:hover{background:var(--ig-surface-2)}
.ignis-keyrow .ignis-kbd{flex:1}
.ignis-keyrow button{border:1px dashed var(--ig-line-strong);background:transparent;color:var(--ig-text-2);border-radius:8px;padding:6px 12px;font:600 11px var(--ig-mono);cursor:pointer;transition:all .15s}
.ignis-keyrow button:hover{border-color:var(--ig-accent);color:var(--ig-accent)}

.ignis-about{padding:8px 4px;line-height:1.75;font-size:13px;color:var(--ig-text)}
.ignis-about b{color:var(--ig-brand)}
.ignis-about a{color:var(--ig-accent);text-decoration:none;font-weight:600}
.ignis-about a:hover{text-decoration:underline}
.ignis-rt{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
.ignis-rt span{background:var(--ig-surface-2);border:1px solid var(--ig-line);border-radius:999px;padding:4px 11px;font:600 10px var(--ig-font);color:var(--ig-text-2);letter-spacing:.03em;text-transform:uppercase}
.ignis-hero{display:flex;align-items:center;gap:14px;padding:8px 4px 18px;border-bottom:1px solid var(--ig-line);margin-bottom:8px}
.ignis-hero-mark{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--ig-brand),var(--ig-brand-2));display:grid;place-items:center;color:#fff;font:800 18px var(--ig-font);box-shadow:0 10px 24px -10px rgba(244,63,94,.7)}
.ignis-hero-mark svg{width:22px;height:22px}
.ignis-hero h3{margin:0;font-size:17px;letter-spacing:-.02em}
.ignis-hero p{margin:2px 0 0;font-size:12px;color:var(--ig-text-2)}

.ignis-stat-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.ignis-stat-card{background:var(--ig-surface-2);border:1px solid var(--ig-line);border-radius:14px;padding:14px}
.ignis-stat-card .ignis-stat-v{font:700 22px/1.1 var(--ig-font);letter-spacing:-.03em;display:block;margin-top:6px}
.ignis-stat-card small{display:block;font:600 10px var(--ig-font);color:var(--ig-text-2);letter-spacing:.06em;text-transform:uppercase}
.ignis-stats-h{font:700 10px var(--ig-font);color:var(--ig-text-2);letter-spacing:.08em;text-transform:uppercase;padding:16px 4px 6px}
.ignis-row .ignis-stat-v{font:600 12px var(--ig-mono);color:var(--ig-text);flex-shrink:0}
.ignis-spark{display:flex;align-items:flex-end;gap:4px;height:72px;padding:8px 4px;border-bottom:1px solid var(--ig-line);margin-bottom:6px}
.ignis-spark-bar{flex:1;min-width:4px;background:linear-gradient(180deg,var(--ig-brand),var(--ig-brand-2));border-radius:3px 3px 0 0;opacity:.85;transition:opacity .15s}
.ignis-spark-bar:hover{opacity:1}

.ignis-tagged-list{display:flex;flex-direction:column;gap:6px}
.ignis-tagged{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--ig-line);border-radius:12px;background:var(--ig-surface-2);color:var(--ig-text);font:600 13px var(--ig-font);text-decoration:none;transition:all .15s}
.ignis-tagged:hover{border-color:var(--ig-accent);background:var(--ig-surface-3);color:var(--ig-accent)}
.ignis-tagged svg{width:14px;height:14px;opacity:.6}
.ignis-tagged:hover svg{opacity:1}

.ignis-palette{position:fixed;inset:0;z-index:2147482600;background:var(--ig-overlay);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh}
.ignis-pal-card{width:min(560px,92vw);background:var(--ig-surface);color:var(--ig-text);border-radius:16px;border:1px solid var(--ig-line);box-shadow:var(--ig-shadow);overflow:hidden;animation:ignisPal .18s ease}
@keyframes ignisPal{from{opacity:0;transform:translateY(-8px) scale(.99)}to{opacity:1;transform:none}}
.ignis-pal-inp{width:100%;box-sizing:border-box;border:none;outline:none;background:transparent;color:var(--ig-text);padding:17px 20px;font:500 14px var(--ig-font);border-bottom:1px solid var(--ig-line)}
.ignis-pal-inp::placeholder{color:var(--ig-text-2)}
.ignis-pal-list{max-height:48vh;overflow-y:auto;padding:8px;scrollbar-width:thin}
.ignis-pal-it{padding:10px 12px;border-radius:10px;font:500 13px var(--ig-font);cursor:pointer;display:flex;justify-content:space-between;gap:12px;align-items:center}
.ignis-pal-it small{font:600 10px var(--ig-mono);color:var(--ig-text-2)}
.ignis-pal-on{background:var(--ig-accent-soft);color:var(--ig-accent)}

.ignis-bar{position:absolute;top:12px;right:12px;z-index:15;display:flex;flex-direction:row-reverse;gap:6px;padding:6px;border-radius:14px;background:rgba(16,16,20,.62);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px -8px rgba(0,0,0,.5)}
.ignis-dl,.ignis-nt,.ignis-th,.ignis-da{width:36px;height:36px;border:none;border-radius:10px;background:transparent;color:#fff;display:grid;place-items:center;cursor:pointer;transition:all .12s}
.ignis-dl:hover,.ignis-nt:hover,.ignis-th:hover,.ignis-da:hover{background:rgba(255,255,255,.16);transform:scale(1.06)}
.ignis-dl:active,.ignis-nt:active,.ignis-th:active,.ignis-da:active{transform:scale(.94)}
.ignis-dl:focus-visible,.ignis-nt:focus-visible,.ignis-th:focus-visible,.ignis-da:focus-visible{outline:2px solid #fff;outline-offset:1px}
.ignis-dl svg,.ignis-nt svg,.ignis-th svg,.ignis-da svg{width:17px;height:17px}

.ignis-storytools{position:absolute;top:16px;right:16px;z-index:14;display:flex;flex-direction:column;gap:6px;padding:6px;border-radius:16px;background:rgba(16,16,20,.55);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px -8px rgba(0,0,0,.5)}
.ignis-sd,.ignis-sn,.ignis-sa,.ignis-st,.ignis-tp,.ignis-sl,.ignis-hd,.ignis-hn,.ignis-ha,.ignis-ht,.ignis-htp,.ignis-hl{width:36px;height:36px;border:none;border-radius:10px;background:transparent;color:#fff;display:grid;place-items:center;cursor:pointer;transition:all .12s}
.ignis-sd:hover,.ignis-sn:hover,.ignis-sa:hover,.ignis-st:hover,.ignis-tp:hover,.ignis-sl:hover,.ignis-hd:hover,.ignis-hn:hover,.ignis-ha:hover,.ignis-ht:hover,.ignis-htp:hover,.ignis-hl:hover{background:rgba(255,255,255,.18);transform:scale(1.06)}
.ignis-sd svg,.ignis-sn svg,.ignis-sa svg,.ignis-st svg,.ignis-tp svg,.ignis-sl svg,.ignis-hd svg,.ignis-hn svg,.ignis-ha svg,.ignis-ht svg,.ignis-htp svg,.ignis-hl svg{width:17px;height:17px}
.ignis-sb-pos{position:relative;z-index:12;min-width:28px;height:20px;padding:0 7px;border-radius:999px;background:rgba(16,16,20,.72);color:#fff;font:700 10px var(--ig-font);display:flex;align-items:center;justify-content:center;pointer-events:none;letter-spacing:.04em;border:1px solid rgba(255,255,255,.14);margin-top:1px}

.ignis-rd,.ignis-rn{position:absolute;z-index:12;width:36px;height:36px;border:none;border-radius:11px;background:rgba(16,16,20,.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.16);color:#fff;display:grid;place-items:center;cursor:pointer;transition:all .12s;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.ignis-rd:hover,.ignis-rn:hover{background:rgba(255,255,255,.18);transform:scale(1.05)}
.ignis-rd svg,.ignis-rn svg{width:17px;height:17px}
.ignis-rn{position:absolute;z-index:12;width:36px;height:36px;border:none;border-radius:11px;background:rgba(16,16,20,.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.16);color:#fff;display:grid;place-items:center;cursor:pointer;transition:all .12s;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.ignis-rn:hover{background:rgba(255,255,255,.18);transform:scale(1.05)}
.ignis-rn svg{width:17px;height:17px}
.ignis-pd{position:absolute;top:8px;right:8px;z-index:12;width:34px;height:34px;border-radius:11px;border:1px solid rgba(255,255,255,.4);background:rgba(16,16,20,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);transition:all .12s}
.ignis-pd:hover{background:rgba(255,255,255,.18);transform:scale(1.05)}
.ignis-pd svg{width:16px;height:16px}
.ignis-gd{position:absolute;top:8px;right:8px;z-index:10;width:34px;height:34px;border:none;border-radius:11px;background:rgba(16,16,20,.62);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.14);color:#fff;display:grid;place-items:center;cursor:pointer;opacity:0;transition:opacity .15s ease,transform .12s;box-shadow:0 4px 14px rgba(0,0,0,.3)}
a:hover>.ignis-gd,.ignis-gd:focus-visible,.ignis-gd:hover{opacity:1;transform:scale(1.06)}
.ignis-gd svg{width:16px;height:16px}

.ignis-ksh{position:fixed;inset:0;z-index:2147482500;background:var(--ig-overlay);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px}
.ignis-ksh-card{background:var(--ig-surface);color:var(--ig-text);border-radius:var(--ig-radius);padding:24px 28px;max-width:min(580px,100%);box-shadow:var(--ig-shadow);font:500 13px/2 var(--ig-font);border:1px solid var(--ig-line)}
.ignis-ksh-card h3{margin:0 0 12px;font-size:16px;letter-spacing:-.01em}
.ignis-ksh-card table{border-collapse:collapse;width:100%}
.ignis-ksh-card td{padding:4px 0;border-bottom:1px solid var(--ig-line)}
.ignis-ksh-card td:last-child{text-align:right;color:var(--ig-text-2)}
.ignis-ksh-card .ignis-hint{margin-top:12px;text-align:center;font-size:11px;color:var(--ig-text-2)}
.ignis-ksh-card kbd{background:var(--ig-surface-2);border:1px solid var(--ig-line);border-bottom-width:2px;border-radius:6px;padding:2px 8px;font:600 10px var(--ig-mono)}

.ignis-rename{display:flex;flex-direction:column;gap:14px}
.ignis-rename-preview{background:var(--ig-surface-2);border:1px solid var(--ig-line);border-radius:12px;padding:12px 14px;font:500 12px var(--ig-mono);color:var(--ig-text);word-break:break-all}
.ignis-rename-preview small{display:block;font:600 9px var(--ig-font);color:var(--ig-text-2);letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px}
.ignis-chips{display:flex;flex-wrap:wrap;gap:6px}
.ignis-chip{border:1px solid var(--ig-line);background:var(--ig-surface-2);color:var(--ig-text-2);border-radius:999px;padding:4px 9px;font:600 10px var(--ig-mono);cursor:pointer;transition:all .12s}
.ignis-chip:hover{border-color:var(--ig-accent);color:var(--ig-accent);background:var(--ig-accent-soft)}
.ignis-divider{height:1px;background:var(--ig-line);margin:4px 0}
@media (max-width:560px){
  .ignis-modal{padding:10px}
  .ignis-modal-card{max-height:94vh;border-radius:16px}
  .ignis-modal-head{padding:14px 16px}
  .ignis-modal-body{padding:12px}
  .ignis-modal-foot{flex-wrap:wrap;justify-content:stretch;gap:8px;padding:12px}
  .ignis-modal-foot .ignis-btn{flex:1 1 auto;justify-content:center}
  .ignis-foot-gap,.ignis-modal-foot .ignis-hint{display:none}
  .ignis-sel{width:100%;order:-1}
  .ignis-card-body{padding:8px 10px 2px}
  .ignis-actions{padding:4px 6px 8px}
  .ignis-row{padding:10px}
}

.ignis-position-host{position:relative}
.ignis-template-link{background:none;color:inherit;font:inherit;border:0;padding:0;text-align:start;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.ignis-bar button:focus-visible,.ignis-storytools button:focus-visible,.ignis-modal button:focus-visible,.ignis-checkmark:focus-visible{outline:2px solid #e86829;outline-offset:2px}
@media(prefers-reduced-motion:reduce){.ignis-modal,.ignis-modal-card,.ignis-toast,.ignis-palette *{transition:none!important;animation:none!important}}
`;


  function installStyle() {
    if (typeof GM_addStyle === "function") {
      try {
        GM_addStyle(INTERNAL_CSS);
        return;
      } catch (_) {}
    }
    const style = document.createElement("style");
    style.textContent = INTERNAL_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  // ─── Modal stack ───────────────────────────────────────────────────────
  const ModalStack = {
    modals: [],
    push: function (m) {
      this.modals.push(m);
      return m;
    },
    pop: function () {
      var m = this.modals.pop();
      if (m) m.close();
      return m;
    },
    closeTop: function () {
      if (this.modals.length) this.pop();
    },
  };

  function createModal(opts) {
    opts = opts || {};
    const opener = document.activeElement;
    let closed = false,
      endDrag = null;
    var root = $('<div class="ignis-modal">');
    var card = $('<div class="ignis-modal-card" role="dialog" aria-modal="true">');
    card.attr("aria-label", opts.title || "IGNIS");
    var head = $('<div class="ignis-modal-head">');
    var title = $('<div class="ignis-modal-title">');
    if (opts.title) title.append(esc(opts.title));
    if (opts.sub) title.append('<span class="ignis-sub">' + esc(opts.sub) + "</span>");
    var closeBtn = $(
      '<button class="ignis-modal-x" aria-label="Close" title="Close (Esc / ' +
        esc(getPlatformModifierKey()) +
        '+Q)">' +
        SVG.CLOSE +
        "</button>"
    );
    var body = $('<div class="ignis-modal-body">');
    var foot = $('<div class="ignis-modal-foot">');
    head.append(title, closeBtn);
    card.append(head, body, foot);
    root.append(card);
    $body.append(root);
    var api = {
      el: root,
      body: body,
      foot: foot,
      title: title,
      close: function () {
        if (closed) return;
        closed = true;
        if (endDrag) endDrag();
        const restore = root[0].contains(document.activeElement);
        root[0].inert = true;
        if (restore && opener?.isConnected) opener.focus({ preventScroll: true });
        root.removeClass("ignis-modal-in");
        setTimeout(function () {
          root.remove();
        }, 220);
        var i = ModalStack.modals.indexOf(api);
        if (i > -1) ModalStack.modals.splice(i, 1);
        $(document).off("keydown.igmodal", onKey);
      }
    };
    function onKey(e) {
      if (closed || ModalStack.modals.at(-1) !== api || document.querySelector(".ignis-palette")) return;
      if (e.key === "Tab") {
        const nodes = card
          .find(
            'button:enabled:visible,input:enabled:visible,textarea:visible,a[href]:visible,[tabindex="0"]:visible'
          )
          .toArray()
          .filter((n) => n.tabIndex >= 0);
        const first = nodes[0],
          last = nodes.at(-1);
        if (first && e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (last && !e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.key !== "Escape") return;
      e.preventDefault();
      api.close();
    }
    $(document).on("keydown.igmodal", onKey);
    closeBtn.on("click", api.close);
    var cardEl = card[0];
    head.css("cursor", "grab");
    head.on("mousedown.igdrag", function (e) {
      if (e.button !== 0) return;
      if ($(e.target).closest("button")[0]) return;
      e.preventDefault();
      var r = cardEl.getBoundingClientRect();
      var sx = e.clientX;
      var sy = e.clientY;
      var ox = r.left;
      var oy = r.top;
      card.css({ transition: "none", position: "fixed", left: ox + "px", top: oy + "px", margin: "0" });
      function onMove(ev) {
        var maxX = Math.max(8, window.innerWidth - r.width - 8);
        var maxY = Math.max(8, window.innerHeight - 48);
        card.css({
          left: Math.min(maxX, Math.max(8, ox + ev.clientX - sx)) + "px",
          top: Math.min(maxY, Math.max(8, oy + ev.clientY - sy)) + "px"
        });
      }
      function onUp() {
        $(document).off("mousemove.igdrag", onMove);
        $(document).off("mouseup.igdrag", onUp);
        card.css("transition", "");
        endDrag = null;
      }
      endDrag = onUp;
      $(document).on("mousemove.igdrag", onMove);
      $(document).on("mouseup.igdrag", onUp);
    });
    root.on("mousedown", function (e) {
      if (e.target === root[0]) api.close();
    });
    setTimeout(function () {
      if (closed) return;
      root.addClass("ignis-modal-in");
      if (ModalStack.modals.at(-1) === api && !root[0].contains(document.activeElement)) closeBtn.trigger("focus");
    }, 10);
    return ModalStack.push(api);
  }

  // ─── Post download dialog ──────────────────────────────────────────────
  function buildPostItems(payload, postPath) {
    var res = normalizePostResource(payload.resource);
    return {
      items: res.items,
      meta: {
        username: res.username || "NONE",
        uid: res.uid,
        shortcode: res.shortcode || postPath,
        sourceType: "post",
        timestamp: res.takenAt || Math.floor(Date.now() / 1000),
        caption: res.caption || null
      },
      fromDom: false
    };
  }

  function extractPostFromDom(postPath, ctx) {
    var $post = null;
    if (ctx?.post || ctx?.anchor) $post = $(ctx.post || ctx.anchor);
    else
      $post = $('[data-snig="canDownload"]')
        .filter((_, el) => Array.from(el.querySelectorAll("a[href]")).some((a) => postCode(a.href) === postPath))
        .first();
    if (!$post?.length) return null;
    const items = [],
      seen = new Set(),
      username = getPostUsername($post) || "NONE";
    // Walk images and videos in their actual carousel order. A blob video is not
    // itself a downloadable URL, and must not hide its downloadable neighbours.
    $post.find("img, video").each(function () {
      if (this.closest("header,nav,.ignis-modal,.ignis-bar")) return;
      const rect = this.getBoundingClientRect(),
        video = this.tagName === "VIDEO";
      if (!video && (rect.width < 150 || rect.height < 100)) return;
      const url = video
        ? trustedURL(this.currentSrc || this.src || this.querySelector("source[src]")?.src)
        : domImage(this);
      const li = this.closest("li");
      const pos = slideOrdinal(li) || items.length + 1,
        identity = (li ? pos + ":" : "") + url;
      if (!url || seen.has(identity)) return;
      seen.add(identity);
      items.push({
        id: decodeMediaIdFromUrl(url),
        isVideo: video,
        url,
        thumb: video ? trustedURL(this.poster) : url,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        caption: null,
        dash: null,
        ext: mediaExtension(url, video ? "mp4" : "jpg"),
        _igSourceIndex: pos
      });
    });
    if (!items.length) return null;
    if (items.length === 1 && postCode(location.href) === postPath) {
      const index = Number(new URL(location.href).searchParams.get("img_index"));
      if (Number.isSafeInteger(index) && index > 0 && !$post.find("li[aria-posinset],li[style*=translate]").length)
        items[0]._igSourceIndex = index;
    }
    var ts = Math.floor(Date.now() / 1000);
    var $t = $post.find("time[datetime]").first();
    if ($t.length) {
      var d = new Date($t.attr("datetime")).getTime() / 1000;
      if (isFinite(d) && d > 0) ts = Math.floor(d);
    }
    return {
      items: items,
      meta: { username: username, shortcode: postPath, sourceType: "post", timestamp: ts, caption: null },
      fromDom: true
    };
  }

  async function loadPostItems(postPath, ctx) {
    const embedded = extractPostFromPageJson(postPath);
    if (embedded) return buildPostItems(embedded, postPath);
    const instant = extractPostFromDom(postPath, ctx);
    if (instant && (!ctx?.complete || !USER_SETTING.FORCE_RESOURCE_VIA_MEDIA)) return instant;
    try {
      const rich = buildPostItems(await getPostPayload(postPath, true), postPath);
      if (rich.items.length || !instant) return rich;
    } catch (e) {
      if (!instant || e.stopLookup) throw e;
    }
    return instant;
  }

  function renderItems(body, items, meta) {
    body.empty();
    if (!items.length) {
      body.append('<div class="ignis-empty">No downloadable media found.</div>');
      return;
    }
    var grid = $('<div class="ignis-grid">');
    items.forEach(function (item, i) {
      item._igSourceIndex ||= i + 1;
      const caption = item.caption || meta.caption;
      var row = $('<div class="ignis-item is-selected" data-idx="' + i + '">');
      var input = $('<input type="checkbox" checked tabindex="-1" aria-hidden="true">');
      var media = $('<div class="ignis-card-media">');
      if (item.thumb) {
        media.append('<img class="ignis-thumb" loading="lazy" src="' + esc(item.thumb) + '" alt="">');
      } else {
        media.append('<div class="ignis-thumb-empty">' + SVG.THUMBNAIL + "</div>");
      }
      media.append(
        '<span class="ignis-checkmark" role="checkbox" tabindex="0" aria-checked="true" aria-label="Select item"></span>',
        '<span class="ignis-badge">' + (item.isVideo ? "VIDEO" : "IMAGE") + "</span>"
      );
      var dims = item.width || item.height ? item.width + "×" + item.height + " · " : "";
      var type =
        '<div class="ignis-type"><b>' +
        (item.isVideo ? "Video" : "Image") +
        "</b><span>" +
        esc(dims) +
        esc(item.ext || "") +
        "</span></div>";
      var cap = caption ? '<div class="ignis-cap">' + esc(caption.slice(0, 180)) + "</div>" : "";
      var actions = $('<div class="ignis-actions">');
      actions.append(
        '<button class="ignis-act ig-act-dl" title="Download" aria-label="Download">' + SVG.DOWNLOAD + "</button>",
        '<button class="ignis-act ig-act-nt" title="Open in new tab" aria-label="Open in new tab">' +
          SVG.NEW_TAB +
          "</button>"
      );
      if (item.thumb && item.isVideo) {
        actions.append(
          '<button class="ignis-act ig-act-th" title="Download thumbnail" aria-label="Download thumbnail">' +
            SVG.THUMBNAIL +
            "</button>"
        );
      }
      if (caption) {
        actions.append(
          '<button class="ignis-act ig-act-cap" title="Download caption (.txt)" aria-label="Download caption">' +
            SVG.TEXT +
            "</button>"
        );
      }
      row.append(input, media, $('<div class="ignis-card-body">').append(type, cap), actions);
      grid.append(row);
    });
    body.append(grid);
    body
      .off(".igitem")
      .on("click.igitem", ".ignis-item", function (e) {
        if ($(e.target).closest(".ignis-checkmark").length) {
          var cb = $(this).find('input[type="checkbox"]')[0];
          if (cb) {
            cb.checked = !cb.checked;
            $(this).toggleClass("is-selected", cb.checked);
            $(e.target)
              .closest(".ignis-checkmark")
              .attr("aria-checked", cb.checked ? "true" : "false");
            $(cb).trigger("change");
          }
          e.preventDefault();
          return;
        }
        var act = $(e.target).closest(".ignis-act")[0];
        if (!act) return;
        e.stopPropagation();
        var idx = parseInt($(this).attr("data-idx"), 10);
        var item = items[idx];
        if (!item) return;
        var photoMeta = Object.assign({}, meta, {
          sourceType: meta.sourceType === "post" ? (item.isVideo ? "video" : "photo") : meta.sourceType,
          shortcode: meta.sourceType === "stories" || meta.sourceType === "highlights" ? item.id : meta.shortcode,
          timestamp: item.takenAt || meta.timestamp,
          index: item._igSourceIndex || idx + 1
        });
        if (act.classList.contains("ig-act-dl")) {
          downloadResource(item, photoMeta, {});
        } else if (act.classList.contains("ig-act-nt")) {
          downloadResource(item, photoMeta, { preview: true });
        } else if (act.classList.contains("ig-act-th") && item.thumb) {
          saveFiles(item.thumb, Object.assign({}, photoMeta, { sourceType: "thumbnail", filetype: "jpg" }));
        } else if (act.classList.contains("ig-act-cap") && (item.caption || meta.caption)) {
          const text = item.caption || meta.caption;
          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          const capMeta = { ...photoMeta, filetype: "txt" };
          resolveFilenameUID(capMeta)
            .then((meta) => triggerDownload(blob, getSaveFileName(item.url, meta)))
            .then(
              () => Stats.record("caption", blob.size),
              () => Toasts.error("Could not save caption.")
            );
        }
      })
      .on("keydown.igitem", ".ignis-checkmark", function (e) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          $(this).trigger("click");
        }
      });
  }

  function attachSelectionFooter(modal, getItems, getMeta, extra) {
    var selectAll = $(
      '<label class="ignis-sel" title="Select / deselect all"><input type="checkbox" checked><span></span>Select all<b class="ignis-count"></b></label>'
    );
    var countBadge = selectAll.find(".ignis-count");
    var dlSel = $('<button class="ignis-btn ignis-btn-pri" disabled>' + SVG.DOWNLOAD + " Download Selected</button>");
    var dlAll = $('<button class="ignis-btn ignis-btn-sec">' + SVG.DOWNLOAD_ALL + " Download All</button>");

    function refresh() {
      var checks = modal.body.find('.ignis-item input[type="checkbox"]');
      var total = checks.length;
      var selected = checks.filter(":checked").length;
      selectAll.find("input").prop("checked", total > 0 && selected === total);
      selectAll.find("input").prop("indeterminate", selected > 0 && selected < total);
      countBadge.text(total ? selected + "/" + total : "");
      dlSel.prop("disabled", selected === 0);
      dlAll.prop("disabled", total === 0);
      modal.body.find(".ignis-item").each(function () {
        var checked = !!$(this).find('input[type="checkbox"]').prop("checked");
        $(this).toggleClass("is-selected", checked);
        $(this)
          .find(".ignis-checkmark")
          .attr("aria-checked", checked ? "true" : "false");
      });
    }

    function selectedItems() {
      var items = getItems();
      var out = [];
      modal.body.find(".ignis-item").each(function () {
        if ($(this).find('input[type="checkbox"]').prop("checked")) {
          var idx = parseInt($(this).attr("data-idx"), 10);
          if (items[idx]) out.push(items[idx]);
        }
      });
      return out;
    }

    selectAll.find("input").on("change", function () {
      modal.body.find('.ignis-item input[type="checkbox"]').prop("checked", this.checked);
      refresh();
    });
    modal.body.off("change.igsel").on("change.igsel", '.ignis-item input[type="checkbox"]', refresh);
    dlSel.on("click", function () {
      var selected = selectedItems();
      if (!selected.length) {
        Toasts.info("Select at least one item to download.");
        return;
      }
      batchDownload(selected, getMeta());
    });
    dlAll.on("click", function () {
      batchDownload(getItems(), getMeta());
    });

    modal.foot.append(selectAll, '<span class="ignis-foot-gap"></span>', dlSel, dlAll);
    if (extra) modal.foot.append(extra);
    refresh();
    return { refresh: refresh, selectedItems: selectedItems };
  }

  async function openPostDialog(postPath, ctx) {
    const modal = createModal({ title: "Download post", sub: postPath });
    modal.body.append('<div class="ignis-load"><i></i>Loading media…</div>');
    let loaded;
    try {
      loaded = ctx?.initial || (await loadPostItems(postPath, { ...ctx, complete: true }));
    } catch (e) {
      modal.body.empty().append($("<div class='ignis-empty'>").text("Could not load this post: " + e.message));
      return null;
    }
    if (!modal.el[0].isConnected || modal.el[0].inert) return null;
    const { items, meta } = loaded;
    const author = meta.username && meta.username !== "NONE" ? "@" + meta.username + " · " : "";
    modal.title.find(".ignis-sub").text(author + items.length + (items.length === 1 ? " item" : " items"));
    renderItems(modal.body, items, meta);
    if (loaded.fromDom)
      modal.body.prepend(
        '<p class="ignis-hint">Showing only media loaded on this page. The full post may contain more items.</p>'
      );
    attachSelectionFooter(
      modal,
      () => items,
      () => meta
    );
    return loaded;
  }

  // ─── Story / highlight dialogs ─────────────────────────────────────────
  function openStoryDialog(payload, type) {
    var reel = payload && payload.data && payload.data.reels_media && payload.data.reels_media[0];
    if (!reel) {
      Toasts.error("No stories available for this account.");
      return null;
    }
    var items = normalizeReelItems(reel.items);
    var username =
      (reel.user && reel.user.username) ||
      (reel.owner && reel.owner.username) ||
      getStoryUsername() ||
      "NONE";
    var meta = {
      username: username,
      shortcode: reel.id || "",
      sourceType: type,
      timestamp: Math.floor(Date.now() / 1000),
      caption: null,
    };
    var modal = createModal({
      title: type === "highlights" ? "Highlights" : "Stories",
      sub: "@" + username + " · " + items.length + " item" + (items.length === 1 ? "" : "s"),
    });
    renderItems(modal.body, items, meta);
    var hint = $('<span class="ignis-hint">' + items.length + " item" + (items.length === 1 ? "" : "s") + "</span>");
    attachSelectionFooter(
      modal,
      function () {
        return items;
      },
      function () {
        return meta;
      },
      hint
    );
    return modal;
  }


  // ─── Filename template editor ──────────────────────────────────────────
  function openRenameEditor() {
    var modal = createModal({ title: "Filename template", sub: "Auto rename" });
    var wrap = $('<div class="ignis-rename">');
    var inp = $(
      '<input class="ignis-inp" spellcheck="false" value="' + esc(state.fileRenameFormat) + '" aria-label="Filename template">'
    );
    var preview = $('<div class="ignis-rename-preview"><small>Preview</small><span></span></div>');
    var previewText = preview.find("span");
    var keys = ["USERNAME", "SOURCE_TYPE", "SHORTCODE", "YEAR", "2-YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND", "ORIGINAL_NAME", "ORIGINAL_NAME_FIRST", "INDEX", "UID"];
    var chips = $('<div class="ignis-chips">');
    keys.forEach(function (key) {
      chips.append('<button type="button" class="ignis-chip" data-token="%' + key + '%">%' + key + "%</button>");
    });
    ["-", "_", ".", " ", "(", ")", "[", "]"].forEach(function (sep) {
      chips.append('<button type="button" class="ignis-chip" data-token="' + esc(sep) + '">' + (sep === " " ? "space" : esc(sep)) + "</button>");
    });

    function previewName(format) {
      var now = new Date();
      var tokens = {
        USERNAME: "instagram",
        SOURCE_TYPE: "post",
        SHORTCODE: "C1a2B3c4D5e",
        YEAR: String(now.getFullYear()),
        "2-YEAR": String(now.getFullYear()).slice(-2),
        MONTH: pad2(now.getMonth() + 1),
        DAY: pad2(now.getDate()),
        HOUR: pad2(now.getHours()),
        MINUTE: pad2(now.getMinutes()),
        SECOND: pad2(now.getSeconds()),
        ORIGINAL_NAME: "35000000_44444444_n",
        ORIGINAL_NAME_FIRST: "35000000",
        INDEX: "1",
        UID: "123456789",
      };
      var name = String(format || "").replace(/%([\w\-]+)%/g, function (m, t) {
        var up = t.toUpperCase();
        return tokens[up] != null ? tokens[up] : m;
      });
      return sanitizeFilename(name) + ".jpg";
    }

    function render() {
      var format = inp.val();
      state.fileRenameFormat = format;
      Store.set("G_RENAME_FORMAT", format);
      previewText.text(previewName(format) || "—");
    }

    inp.on("input", render);
    chips.on("click", "button", function () {
      var token = $(this).attr("data-token");
      var el = inp[0];
      var start = el.selectionStart != null ? el.selectionStart : el.value.length;
      var end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
      el.value = el.value.slice(0, start) + token + el.value.slice(end);
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
      render();
    });

    var actions = $('<div class="ignis-chips">');
    var reset = $('<button type="button" class="ignis-btn ignis-btn-sec">Reset to default</button>');
    reset.on("click", function () {
      inp.val("%USERNAME%-%SOURCE_TYPE%-%SHORTCODE%-%YEAR%%MONTH%%DAY%_%HOUR%%MINUTE%%SECOND%_%ORIGINAL_NAME_FIRST%");
      render();
    });
    actions.append(reset);
    wrap.append(inp, preview, chips, '<div class="ignis-divider"></div>', actions);
    modal.body.append(wrap);
    modal.foot.append($('<button class="ignis-btn ignis-btn-pri">Done</button>').on("click", modal.close));
    render();
    setTimeout(function () {
      inp.trigger("focus");
    }, 30);
    return modal;
  }

  // ─── Dashboard settings ────────────────────────────────────────────────
  function showSetting(tab) {
    if (typeof tab === "string") state._igTab = tab;
    if (!CATS.some((c) => c[0] === state._igTab) && state._igTab !== "about") state._igTab = "download";
    while (ModalStack.modals.length) ModalStack.pop();
    $(".ignis-modal").remove();
    var modal = createModal({ title: NAME + " Settings", sub: "v" + VERSION });
    modal.el.addClass("ignis-modal-wide");
    var tabs = $('<div class="ignis-tabs">');
    var search = $('<input class="ignis-search" type="search" placeholder="Search settings…">');
    var list = $("<div>");
    var hero = $(
      '<div class="ignis-hero"><div class="ignis-hero-mark">' +
        SVG.SPARK +
        "</div>" +
        "<div><h3>" +
        esc(NAME) +
        "</h3><p>Instagram media downloader · v" +
        esc(VERSION) +
        "</p></div></div>"
    );
    modal.body.append(hero, tabs, search, list);

    function countOn(cat) {
      var n = 0;
      Object.keys(CAT_MAP).forEach(function (k) {
        if (CAT_MAP[k] === cat && USER_SETTING[k]) n++;
      });
      return n;
    }
    function buildTabs() {
      tabs.empty();
      CATS.forEach(function (c) {
        var on = countOn(c[0]);
        tabs.append(
          '<button class="ignis-tab' +
            (state._igTab === c[0] ? " ignis-tab-a" : "") +
            '" data-tab="' +
            c[0] +
            '">' +
            esc(c[1]) +
            (on ? "<b>" + on + "</b>" : "") +
            "</button>"
        );
      });
      tabs.append(
        '<button class="ignis-tab' +
          (state._igTab === "about" ? " ignis-tab-a" : "") +
          '" data-tab="about">About</button>'
      );
    }

    function keyName(code) {
      try {
        return String.fromCharCode(code);
      } catch (e) {
        return String(code);
      }
    }

    function renderHotkeyEditor(container) {
      var keys = [
        ["settings", "Open Settings", "settingsHotkeyKeyCode"],
        ["downloadStory", "Download Story", "downloadStoryHotkeyKeyCode"],
        ["debug", "Debug Window", "debugHotkeyKeyCode"]
      ];
      keys.forEach(function (k) {
        var code = state[k[2]];
        var row = $('<div class="ignis-keyrow" data-hotkey="' + k[2] + '">');
        row.append(
          '<span class="ignis-kbd"><kbd>' +
            esc(getPlatformModifierKey()) +
            "</kbd>+<kbd>" +
            esc(keyName(code)) +
            "</kbd></span>",
          $('<div class="ignis-row-txt"><div class="ignis-row-lb">' + esc(k[1]) + "</div></div>"),
          $('<button type="button">Rebind</button>')
        );
        row.on("click", function () {
          container.data("cap", k[2]);
          row.find("button").text("Press a key…").trigger("focus");
        });
        container.append(row);
      });
      container.append(
        '<div class="ignis-hint" style="margin:10px 12px;display:block">Click a row, then press the new key. Used with ' +
          esc(getPlatformModifierKey()) +
          ".</div>"
      );
    }

    const STAT_TYPE_LABELS = {
      post: "Posts",
      photo: "Photos",
      video: "Videos",
      reels: "Reels",
      stories: "Stories",
      highlights: "Highlights",
      thumbnail: "Thumbnails",
      avatar: "Profile Pictures",
      caption: "Captions",
      other: "Other"
    };

    function formatBytes(n) {
      n = Number(n) || 0;
      if (n <= 0) return "0 B";
      var units = ["B", "KB", "MB", "GB", "TB"];
      var i = 0;
      while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
      }
      return (i ? n.toFixed(1) : String(Math.round(n))) + " " + units[i];
    }

    function statRow(label, value) {
      return (
        '<div class="ignis-row"><div class="ignis-row-txt"><div class="ignis-row-lb">' +
        esc(label) +
        '</div></div><span class="ignis-stat-v">' +
        esc(value) +
        "</span></div>"
      );
    }

    function buildStatsPanel(onReset) {
      var s = Stats._load();
      var panel = $('<div class="ignis-stats">');
      var cards = $('<div class="ignis-stat-cards">');
      [
        ["Total downloads", String(s.items || 0)],
        ["Data saved", formatBytes(s.bytes)],
        ["Sessions", String(s.sessions || 0)],
        ["Last download", s.lastAt ? new Date(s.lastAt).toLocaleDateString() : "—"]
      ].forEach(function (pair) {
        cards.append(
          '<div class="ignis-stat-card"><small>' +
            esc(pair[0]) +
            '</small><span class="ignis-stat-v">' +
            esc(pair[1]) +
            "</span></div>"
        );
      });
      panel.append(cards);

      var days = [];
      var maxCount = 1;
      for (var i = 13; i >= 0; i--) {
        var day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        var count = (s.byDay && s.byDay[day]) || 0;
        if (count > maxCount) maxCount = count;
        days.push({ day: day, count: count });
      }
      var spark = $('<div class="ignis-spark">');
      days.forEach(function (entry) {
        var pct = entry.count ? Math.max(6, Math.round((entry.count / maxCount) * 100)) : 2;
        spark.append(
          '<div class="ignis-spark-bar" style="height:' +
            pct +
            '%" title="' +
            esc(entry.day + " · " + entry.count + " downloads") +
            '"></div>'
        );
      });
      panel.append('<div class="ignis-stats-h">Last 14 days</div>', spark);
      panel.append(
        statRow("Tracking since", s.firstDay ? new Date(s.firstDay).toLocaleDateString() : "—"),
        statRow("Last download", s.lastAt ? new Date(s.lastAt).toLocaleString() : "—")
      );

      var types = Object.keys(s.byType || {}).sort(function (a, b) {
        return s.byType[b] - s.byType[a];
      });
      if (types.length) {
        panel.append('<div class="ignis-stats-h">By type</div>');
        types.forEach(function (t) {
          panel.append(statRow(STAT_TYPE_LABELS[t] || t, String(s.byType[t])));
        });
      }
      panel.append(
        '<div style="padding:14px 4px 4px"><button class="ignis-btn ignis-btn-sec">Reset statistics</button></div>'
      );
      panel.find("button").on("click", function () {
        Stats.reset();
        Toasts.success("Statistics reset.");
        if (onReset) onReset();
      });
      return panel;
    }

    function buildList(filter) {
      filter = (filter ?? search.val()).trim().toLowerCase();
      list.empty().removeData("cap");
      if (state._igTab === "about") {
        list.append(
          '<div class="ignis-about">' +
            "<b>" +
            NAME +
            " v" +
            VERSION +
            "</b> downloads media from Instagram pages: posts, carousels, reels, stories, highlights, HD avatars and captions." +
            '<div class="ignis-rt">' +
            ["IGNIS Core", "IGNIS Lens", "IGNIS Forge", "IGNIS Render", "IGNIS Pulse"]
              .map(function (r) {
                return "<span>" + esc(r) + "</span>";
              })
              .join("") +
            "</div>" +
            "All processing is local. Network requests go only to Instagram and its CDN hosts. Nothing is sent anywhere else." +
            '<div class="ignis-divider" style="margin:14px 0"></div>' +
            '<a href="https://github.com/mheci/Ignis" target="_blank" rel="noopener noreferrer">Project page</a> · ' +
            '<a href="https://github.com/mheci/Ignis/issues" target="_blank" rel="noopener noreferrer">Report an issue</a>' +
            '<p class="ignis-hint" style="margin-top:12px">Independent project, unaffiliated with Instagram. GPL-3.0-only.</p>' +
            "</div>"
        );
        return;
      }
      if (state._igTab === "keyboard") {
        if (!filter) renderHotkeyEditor(list);
      }
      if (state._igTab === "stats") {
        list.append(
          buildStatsPanel(function () {
            buildList(filter);
          })
        );
      }
      Object.keys(CAT_MAP)
        .filter(function (k) {
          return CAT_MAP[k] === state._igTab;
        })
        .filter(function (k) {
          if (!filter) return true;
          return (LABEL[k] + " " + DESC[k]).toLowerCase().indexOf(filter) > -1;
        })
        .forEach(function (k) {
          var parent = null;
          Object.keys(PARENT_CHILD_MAPPING).forEach(function (p) {
            if (PARENT_CHILD_MAPPING[p].indexOf(k) > -1) parent = p;
          });
          var disabled = parent
            ? !USER_SETTING[parent] || (parent === "PREFER_DASH_MANIFEST" && !USER_SETTING.FORCE_RESOURCE_VIA_MEDIA)
            : false;
          var row = $(
            '<div class="ignis-row ignis-row-wrap' + (disabled ? " ignis-row-dis" : "") + '" data-set="' + k + '">'
          );
          var sw = $(
            '<label class="ignis-sw"><input type="checkbox" aria-label="' +
              esc(LABEL[k]) +
              '" ' +
              (USER_SETTING[k] ? "checked" : "") +
              (disabled ? " disabled" : "") +
              "><i></i></label>"
          );
          row.append(
            $('<div class="ignis-row-txt">').append(
              '<div class="ignis-row-lb">' + esc(LABEL[k]) + "</div>",
              '<div class="ignis-row-ds">' + esc(DESC[k]) + "</div>"
            ),
            sw
          );
          if (k === "AUTO_RENAME") {
            row
              .find(".ignis-row-lb")
              .empty()
              .append(
                $('<button type="button" class="ignis-template-link">').text(LABEL[k]).on("click", openRenameEditor)
              );
          }
          list.append(row);
        });
      if (!list.children().length) {
        list.append('<div class="ignis-empty">No settings match.</div>');
      }
    }

    modal.el.on("keydown.igcap", function (e) {
      var cap = list.data("cap");
      if (!cap) return;
      e.preventDefault();
      e.stopPropagation();
      var code = e.keyCode || e.which;
      if (e.key === "Escape") {
        buildList();
        return;
      }
      const keys = {
        settingsHotkeyKeyCode: "SETTINGS",
        downloadStoryHotkeyKeyCode: "DOWNLOAD_STORY",
        debugHotkeyKeyCode: "DEBUG"
      };
      if (
        !Object.hasOwn(keys, cap) ||
        code < 65 ||
        code > 90 ||
        [81, 75, 84, 82].includes(code) ||
        Object.keys(keys).some((k) => k !== cap && state[k] === code)
      ) {
        Toasts.info("Choose an unused letter, or Escape to cancel.");
        return;
      }
      state[cap] = code;
      Store.set("G_HOTKEY_" + keys[cap] + "_KEYCODE", code);
      list.data("cap", null);
      buildList();
    });

    modal.el.on("change.igset", ".ignis-sw input", function () {
      var $row = $(this).closest(".ignis-row");
      var k = $row.attr("data-set");
      var v = this.checked;
      USER_SETTING[k] = v;
      Store.set(k, v);
      buildTabs();
      buildList();
    });

    modal.el.on("contextmenu.igset", ".ignis-row[data-set]", function (e) {
      var $row = $(this);
      var k = $row.attr("data-set");
      if (k !== "AUTO_RENAME") return;
      e.preventDefault();
      openRenameEditor();
    });

    tabs.on("click.igset", ".ignis-tab", function () {
      state._igTab = $(this).attr("data-tab");
      buildTabs();
      buildList();
    });
    search.on("input.igset", function () {
      buildList(search.val().trim().toLowerCase());
    });
    buildTabs();
    buildList();
  }

  function showHotkeySetting() {
    showSetting("keyboard");
  }

  // ─── Debug & feedback ──────────────────────────────────────────────────
  function showDebugDOM() {
    var modal = createModal({ title: "Debug Window", sub: NAME + " v" + VERSION });
    var ta = $(
      '<textarea spellcheck="false" style="width:100%;height:240px;box-sizing:border-box;border:1px solid var(--ig-line);border-radius:10px;background:var(--ig-surface-2);color:var(--ig-text);font:11px ui-monospace,Menlo,monospace;padding:10px;resize:vertical"></textarea>'
    );
    modal.body.append(ta);
    modal.foot.append(
      $('<button class="ignis-btn ignis-btn-sec">Copy</button>').on("click", function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ta.val()).then(
            function () {
              Toasts.success("Copied to clipboard.");
            },
            () => Toasts.error("Clipboard unavailable; select the text to copy.")
          );
        } else {
          ta.trigger("select");
          document.execCommand("copy");
        }
      }),
      $('<button class="ignis-btn ignis-btn-sec">Download</button>').on("click", function () {
        var blob = new Blob([ta.val()], { type: "text/plain;charset=utf-8" });
        triggerDownload(blob, "ignis-debug-" + Date.now() + ".txt").catch(() =>
          Toasts.error("Could not save debug log.")
        );
      })
    );
    var lines = [];
    lines.push(NAME + " v" + VERSION + " — URL: " + location.origin + location.pathname);
    lines.push("UA: " + navigator.userAgent);
    lines.push("");
    lines.push("— Log —");
    state.GL_logger.slice(-500).forEach(function (entry) {
      lines.push("[" + new Date(entry.time).toISOString() + "] " + entry.content.map(String).join(" "));
    });
    ta.val(lines.join("\n"));
  }

  /* ============================================================
     Ignis Pulse — page injection, download flows, router
     ============================================================ */

  // ─── Carousel visible-index detection ──────────────────────────────────
  function slideOrdinal(li) {
    if (!li) return null;
    const explicit = Number(li.getAttribute("aria-posinset"));
    if (Number.isSafeInteger(explicit) && explicit > 0) return explicit;
    const translate = li.style.transform.match(/translate(?:X|3d)?\(\s*(-?\d+(?:\.\d+)?)px/i);
    const width = li.getBoundingClientRect().width;
    if (translate && width > 0 && Number(translate[1]) >= 0) return Math.round(Number(translate[1]) / width) + 1;
    return Array.from(li.parentElement.children).indexOf(li) + 1;
  }
  function getVisibleNodeIndex($main) {
    const post = $main?.[0];
    if (!post) return 0;
    if (postCode(location.href) && getPostContextFromButton(post).postPath === postCode(location.href)) {
      const index = Number(new URL(location.href).searchParams.get("img_index"));
      if (Number.isSafeInteger(index) && index >= 1) return index - 1;
    }
    const list = Array.from(post.querySelectorAll("ul,ol")).find((el) =>
      el.querySelector(":scope > li img,:scope > li video")
    );
    if (!list) return 0;
    const viewport = list.parentElement.getBoundingClientRect(),
      mid = (Math.max(0, viewport.left) + Math.min(innerWidth, viewport.right)) / 2;
    let nearest = null,
      best = Infinity;
    for (const slide of list.children) {
      if (!slide.matches("li") || !slide.querySelector("img,video")) continue;
      const r = slide.getBoundingClientRect();
      if (!r.width || r.right <= Math.max(0, viewport.left) || r.left >= Math.min(innerWidth, viewport.right))
        continue;
      const distance = Math.abs((r.left + r.right) / 2 - mid);
      if (distance < best) {
        nearest = slide;
        best = distance;
      }
    }
    return nearest ? slideOrdinal(nearest) - 1 : -1;
  }

  // ─── Shared IntersectionObserver ───────────────────────────────────────
  let sharedIO = null;
  let ioCallbacks = new WeakMap();
  function getIO() {
    if (!sharedIO && typeof IntersectionObserver !== "undefined") {
      sharedIO = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              sharedIO?.unobserve(en.target);
              var cb = ioCallbacks.get(en.target);
              if (cb) {
                ioCallbacks.delete(en.target);
                cb(en.target);
              }
            }
          });
        },
        { rootMargin: "150px" }
      );
    }
    return sharedIO;
  }
  function observeOnce(el, cb) {
    var io = getIO();
    if (!io) {
      cb(el);
      return;
    }
    if (ioCallbacks.has(el)) return;
    ioCallbacks.set(el, cb);
    io.observe(el);
  }

  // ─── Universal post/media detection ────────────────────────────────────
  function looksLikePost(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest(".ignis-bar, .ignis-sb, .ignis-rd, .ignis-modal, .ignis-gd")) return false;
    var isDiv = el.tagName === "DIV";
    var hasHeader = el.querySelector(":scope > header, :scope > div > header") != null;
    var hasLink = Array.from(el.querySelectorAll("a[href]")).some((a) => postCode(a.href));
    var hasMedia = el.querySelector("video, img[src*='cdninstagram'], img[src*='fbcdn.net']") != null;
    if (!hasLink && !hasHeader) return false;
    if (!hasMedia) return false;
    if (isDiv && el.closest("article")) return false;
    if (isDiv && !hasLink) return false;
    if (isDiv) {
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.width * r.height > window.innerWidth * window.innerHeight * 0.75) {
        return false;
      }
    }
    return true;
  }

  function findPostElements() {
    var out = [];
    var seen = new Set();
    function push(el) {
      if (seen.has(el)) return;
      seen.add(el);
      out.push(el);
    }
    document.querySelectorAll('article[role="presentation"], article, div[role="presentation"]').forEach(function (el) {
      if (looksLikePost(el)) push(el);
    });
    document.querySelectorAll("section > main > div > div > div > div > div > hr").forEach(function (hr) {
      var p = hr.parentElement;
      for (var i = 0; i < 4 && p; i++) p = p.parentElement;
      if (p) push(p);
    });
    return out;
  }

  // New IG layouts (2026) render posts as plain divs — no <article>, no
  // role="presentation", no <header>. Detect them from their media element
  // and climb to the smallest ancestor carrying post links + timestamp +
  // action bar (comments / like / share controls).
  function qualifiesAsPost(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === "A" || tag === "ARTICLE" || tag === "VIDEO" || tag === "IMG") return false;
    if (el.querySelector(":scope > header")) return true;
    if (tag === "DIV") {
      var r = el.getBoundingClientRect();
      if (
        r.width >= window.innerWidth * 0.98 &&
        r.height >= window.innerHeight * 0.9
      ) {
        return false;
      }
    }
    var hasPostLink = el.querySelector('a[href*="/p/"], a[href*="/reel/"]') != null;
    var hasTime = el.querySelector("time[datetime]") != null;
    var hasActions =
      el.querySelector(
        'svg[aria-label="Like"], svg[aria-label="Unlike"], svg[aria-label="Comment"], svg[aria-label="Share"], textarea[aria-label*="comment" i]'
      ) != null;
    return hasPostLink && hasTime && hasActions;
  }

  function scanMediaContainers() {
    document.querySelectorAll("video, img[src*='cdninstagram'], img[src*='fbcdn.net']").forEach(function (media) {
      try {
        if (
          media.closest(
            "article, [data-snig], .ignis-bar, .ignis-sb, .ignis-rd, .ignis-modal, .ignis-gd, div[aria-busy][tabindex]"
          )
        ) {
          return;
        }
        var r = media.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (media.tagName === "IMG" && (r.width < 250 || r.height < 250)) return;
        if (media.tagName === "VIDEO" && r.width < 150) return;
        var el = media.parentElement;
        var found = null;
        for (var i = 0; i < 30 && el && el !== document.body; i++) {
          if (qualifiesAsPost(el)) {
            found = el;
            break;
          }
          el = el.parentElement;
        }
        if (found && !found.hasAttribute("data-snig")) {
          var $f = $(found);
          if ($f.height() > 0 && $f.width() > 0) injectPostBar($f);
        }
      } catch (e) {
        /* never let one media element break the scan */
      }
    });
  }

  function findMediaHost($post) {
    var $children = $post.children("div").children("div");
    var tag = $post[0].tagName;
    var $target = $children.eq(tag === "DIV" ? 0 : $children.length - 2);
    if (!$target.length || !$target.is(":visible") || $target.width() === 0) {
      $target = $post.find("video").first().parent();
    }
    if (!$target.length || $target.width() === 0) {
      var best = null;
      var bestArea = 0;
      $post.find("img[src*='cdninstagram'], img[src*='fbcdn.net']").each(function () {
        var r = this.getBoundingClientRect();
        var area = r.width * r.height;
        if (area > bestArea) {
          bestArea = area;
          best = $(this).parent();
        }
      });
      if (best) $target = best;
    }
    if (!$target.length || $target.width() === 0) {
      $target = $post.children().first();
    }
    return $target;
  }

  function injectPostBar($post) {
    if (!$post || !$post.length) return;
    if ($post.attr("data-snig")) return;
    if ($post.parents("div#scrollview").length) return;
    if ($post.find(".ignis-bar, .ignis-rd").length) return;
    var $target = findMediaHost($post);
    if (!$target.length || $target.width() === 0) return;
    $post.attr("data-snig", "canDownload");
    positionHost($target[0]);
    var bar = $('<div class="ignis-bar">');
    bar.append(
      makeButton(SVG.DOWNLOAD, "Download", "ignis-dl"),
      makeButton(SVG.NEW_TAB, "Open in new tab", "ignis-nt")
    );
    if (
      $post.find("ul li").filter((_, n) => n.querySelector("img,video")).length > 1 ||
      $post.find(resourceCountSelector).length > 1
    ) {
      bar.append(makeButton(SVG.DOWNLOAD_ALL, "Download all", "ignis-da"));
    }
    $target.append(bar);
    observeOnce($target[0], function () {
      if (bar.find(".ignis-th").length) return;
      if ($target.find("video")[0]) {
        bar.append(makeButton(SVG.THUMBNAIL, "Download thumbnail", "ignis-th"));
      }
    });
  }

  function scanPosts() {
    // intrinsic self-heal: re-inject bars that Instagram re-rendered away
    document.querySelectorAll('[data-snig="canDownload"]').forEach(function (el) {
      if (!el.querySelector(".ignis-bar")) el.removeAttribute("data-snig");
    });
    findPostElements().forEach(function (el) {
      var $a = $(el);
      if ($a.height() > 0 && $a.width() > 0) injectPostBar($a);
    });
    scanMediaContainers();
  }

  // Grid thumbnails: explore / profile / saved / tagged / related / DM embeds
  function scanGrids() {
    document.querySelectorAll("a > .ignis-gd").forEach((btn) => {
      if (!postCode(btn.parentElement.href)) btn.remove();
    });
    document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"],a[href*="/reels/"]').forEach(function (a) {
      try {
        if (a.querySelector(":scope > .ignis-gd")) return;
        if (a.closest("article, header, nav, .ignis-bar, .ignis-modal, div[aria-busy][tabindex]")) return;
        var media = a.querySelector("img, video");
        if (!media) return;
        var r = media.getBoundingClientRect();
        if (r.width < 200 || r.height < 150) return;
        if (!postCode(a.href)) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ignis-gd";
        btn.title = "Download this post";
        btn.setAttribute("aria-label", "Download this post");
        btn.innerHTML = SVG.DOWNLOAD;
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var sc = postCode(a.href);
          if (sc) openPostDialog(sc, { anchor: a });
        });
        positionHost(a);
        a.appendChild(btn);
      } catch (e) {
        /* never let one anchor break the scan */
      }
    });
  }

  function getPostContextFromButton(target) {
    var $article = $(target).closest('[data-snig="canDownload"], article, div[data-snig]');
    if (!$article.length) return { $article: $(), postPath: null };
    const links = Array.from($article[0].querySelectorAll("a[href]"));
    const timeLink = $article[0].querySelector("time[datetime]")?.closest("a[href]");
    const postPath =
      postCode(timeLink?.href) || links.map((a) => postCode(a.href)).find(Boolean) || postCode(location.href);
    return { $article: $article, postPath: postPath };
  }

  async function resolvePostShortcode(shortcode, ctx) {
    const href = location.href;
    try {
      const loaded = await loadPostItems(shortcode, ctx);
      const host = ctx?.post || ctx?.anchor;
      if (
        host &&
        (!host.isConnected ||
          (host.matches('[data-snig="canDownload"]') && getPostContextFromButton(host).postPath !== shortcode))
      )
        return null;
      return location.href === href ? loaded : null;
    } catch (e) {
      Toasts.error("Could not load post: " + ((e && e.message) || "network error"));
      return null;
    }
  }

  // ─── Story flows ───────────────────────────────────────────────────────
  function getStoryProgress(username) {
    var $hdr = null;
    $('body > div section:visible a[href^="/' + esc(username) + '"]').each(function () {
      var $a = $(this);
      if ($a.find("img").length === 0) {
        var txt = $a.text().trim();
        if (!txt || txt.toLowerCase() !== String(username).toLowerCase()) return;
      }
      $a.parents("div:not([class]):not([style])").each(function () {
        var t = $(this).text().trim();
        if (t !== String(username) && $(this).children().length > 1) {
          $hdr = $(this);
          return false;
        }
      });
      if ($hdr) return false;
    });
    if (!$hdr) return $();
    return $hdr.children().filter(function () {
      return $(this).height() < 10;
    }).first().children();
  }

  function setStoryProgressIndexText($element, className, username) {
    var $segs = getStoryProgress(username);
    var total = $segs.length;
    if (total < 2) {
      $element.find("." + className).remove();
      return;
    }
    var current = 0;
    $segs.each(function (i) {
      if ($(this).children().length > 0) current = i + 1;
    });
    if (!current) return;
    var $target = $element.find(".ignis-storytools").first();
    if (!$target.length) $target = $element;
    var $counter = $target.find("." + className).first();
    if (!$counter.length) {
      $counter = $('<div class="' + className + ' ignis-sb-pos">');
      $target.append($counter);
    }
    if ($counter.text() !== current + "/" + total)
      $counter.text(current + "/" + total).attr("title", "Item " + current + " of " + total);
  }

  function urlStoryId() {
    const [, name, id] = location.pathname.split("/").filter(Boolean);
    return name && name !== "highlights" && /^\d+$/.test(id || "") ? id : null;
  }

  async function loadStoryPayload(username, type) {
    var cacheKey = type === "highlights" ? "highlights" : "stories";
    var cacheId = type === "highlights" ? location.pathname.split("/").filter(Boolean).pop() : username;
    const cached = state.GL_dataCache[cacheKey][cacheId];
    if (cached && Date.now() - cached.ts < POST_CACHE_MAX_AGE) return cached.value;
    const route = location.href;
    var payload;
    if (type === "highlights") {
      payload = await getHighlightStories(cacheId);
    } else {
      var userInfo = await getUserId(username);
      var uid = (userInfo.user && (userInfo.user.pk || userInfo.user.id)) || null;
      if (!uid) throw new Error("Cannot resolve user id");
      payload = await getStories(uid, username);
    }
    if (route !== location.href) throw new Error("The active page changed");
    state.GL_dataCache[cacheKey][cacheId] = { value: payload, ts: Date.now() };
    return payload;
  }

  function resolveStoryTarget(payload, urlId) {
    const raw = resolveRawStoryItem(payload, urlId);
    const target = raw && normalizeItem(raw, payload.data.reels_media[0].items.indexOf(raw));
    return target ? { target } : null;
  }

  function getStoryScopeUsername(type) {
    var username =
      type === "highlights"
        ? getHighlightsStoryUsername()
        : cleanName(location.pathname.split("/")[2]) || getStoryUsername();
    if (!username) {
      var parts = location.pathname.split("/").filter(Boolean);
      if (parts[0] === "stories" && parts[1] && parts[1] !== "highlights") username = parts[1];
    }
    if (username && username.toLowerCase() === "highlights") username = null;
    return username || null;
  }

  function resolveStoryOwner(payload, fallback) {
    var reel = payload && payload.data && payload.data.reels_media && payload.data.reels_media[0];
    var owner = reel && (reel.user || reel.owner);
    return (owner && owner.username) || fallback || null;
  }

  async function downloadStoryCurrent(type, isPreview) {
    var username = getStoryScopeUsername(type);
    if (!username && type !== "highlights") {
      Toasts.error("Cannot resolve the account name.");
      return;
    }
    var ts = Math.floor(Date.now() / 1000);
    var $time = $("body > div section:visible time[datetime]").first();
    if ($time.length) {
      var d = new Date($time.attr("datetime")).getTime() / 1000;
      if (isFinite(d) && d > 0) ts = Math.floor(d);
    }
    const route = location.href,
      activeSection = findStoryContainer();
    const video = activeSection.find("video").get(0);
    const img = activeSection
      .find("img")
      .toArray()
      .filter((n) => !n.closest("header,nav,a[href]") && n.getBoundingClientRect().width >= 150)
      .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    const direct = video
      ? trustedURL(video.currentSrc || video.src || video.querySelector("source[src]")?.src)
      : domImage(img);
    if (
      direct &&
      (!video || !USER_SETTING.FORCE_RESOURCE_VIA_MEDIA || (isPreview && !USER_SETTING.NEW_TAB_HIGHEST_VIDEO))
    ) {
      const meta = { username: username || "NONE", sourceType: type, timestamp: ts, shortcode: urlStoryId() || "" };
      return downloadResource(
        { url: direct, isVideo: !!video, ext: mediaExtension(direct, video ? "mp4" : "jpg"), thumb: video?.poster },
        meta,
        { preview: isPreview }
      );
    }
    var payload;
    try {
      payload = await loadStoryPayload(username || "", type);
    } catch (e) {
      Toasts.error("Could not load story data: " + ((e && e.message) || "network error"));
      return;
    }
    username = resolveStoryOwner(payload, username);
    if (!username) {
      Toasts.error("Cannot resolve the account name.");
      return;
    }
    var t = await resolveStoryTarget(payload, urlStoryId());
    if (!t) {
      Toasts.error("Cannot identify the active item. Use Browse to choose one.");
      return;
    }
    var item = t.target;
    var meta = {
      username: username,
      sourceType: type,
      timestamp: item.takenAt || ts,
      shortcode: item.id,
      caption: item.caption || null
    };
    if (
      item.isVideo &&
      !item.dash &&
      USER_SETTING.FORCE_RESOURCE_VIA_MEDIA &&
      USER_SETTING.PREFER_DASH_MANIFEST &&
      item.id &&
      (!isPreview || USER_SETTING.NEW_TAB_HIGHEST_VIDEO)
    ) {
      try {
        const mi = await getMediaInfo(item.id);
        const offered = mi.items?.find((v) =>
          [v?.id, v?.pk].some((id) => id != null && String(id).split("_")[0] === item.id.split("_")[0])
        );
        if (offered?.video_dash_manifest) item.dash = offered;
      } catch (e) {
        if ((e.stopLookup && e.status !== 429) || !USER_SETTING.FALLBACK_TO_BLOB_FETCH_IF_MEDIA_API_THROTTLED) {
          Toasts.error(e.message);
          return;
        }
      }
    }
    if (location.href === route) return downloadResource(item, meta, { preview: isPreview });
  }

  async function downloadStoryThumbnail(type) {
    var username = getStoryScopeUsername(type);
    if (!username && type !== "highlights") {
      Toasts.error("Cannot resolve the account name.");
      return;
    }
    try {
      var payload = await loadStoryPayload(username || "", type);
      var owner = resolveStoryOwner(payload, username);
      if (!owner) {
        Toasts.error("Cannot resolve the account name.");
        return;
      }
      var t = await resolveStoryTarget(payload, urlStoryId());
      if (!t || !t.target.thumb) {
        Toasts.error("No thumbnail available.");
        return;
      }
      await saveFiles(t.target.thumb, {
        username: owner,
        sourceType: "thumbnail",
        timestamp: t.target.takenAt || Math.floor(Date.now() / 1000),
        shortcode: t.target.id,
        filetype: "jpg",
      });
    } catch (e) {
      Toasts.error("Could not load thumbnail: " + ((e && e.message) || "network error"));
    }
  }

  async function downloadStoriesAll(type) {
    var username = getStoryScopeUsername(type);
    if (!username && type !== "highlights") {
      Toasts.error("Cannot resolve the account name.");
      return;
    }
    try {
      var payload = await loadStoryPayload(username || "", type);
      var reel = payload.data && payload.data.reels_media && payload.data.reels_media[0];
      var items = normalizeReelItems(reel ? reel.items : []);
      if (!items.length) {
        Toasts.info("No stories available right now.");
        return;
      }
      var owner = resolveStoryOwner(payload, username);
      if (!owner) {
        Toasts.error("Cannot resolve the account name.");
        return;
      }
      var meta = {
        username: owner,
        shortcode: (reel && reel.id) || "",
        sourceType: type,
        timestamp: Math.floor(Date.now() / 1000),
        caption: null
      };
      const route = location.href,
        batch = await batchDownload(items, meta);
      if (!batch || batch.skipped || location.href !== route) return;
      if (type === "stories" && USER_SETTING.DOWNLOAD_STORY_HIGHLIGHTS) {
        try {
          var userInfo = await getUserId(owner);
          var uid = (userInfo.user && (userInfo.user.pk || userInfo.user.id)) || null;
          if (uid) {
            var tray = await getUserHighlights(uid);
            for (var i = 0; i < tray.length; i++) {
              if (route !== location.href) return;
              var hl = await getHighlightStories(tray[i].id);
              if (route !== location.href) return;
              var hReel = hl.data && hl.data.reels_media && hl.data.reels_media[0];
              var hItems = normalizeReelItems(hReel ? hReel.items : []);
              if (hItems.length) {
                await batchDownload(hItems, {
                  username: resolveStoryOwner(hl, owner),
                  shortcode: (hReel && hReel.id) || "",
                  sourceType: "highlights",
                  timestamp: Math.floor(Date.now() / 1000),
                  caption: null
                });
              }
            }
          }
        } catch (e) {
          Toasts.error("Highlights batch stopped: " + e.message);
        }
      }
    } catch (e) {
      Toasts.error("Could not load stories: " + ((e && e.message) || "network error"));
    }
  }

  // ─── Story item resolution & tagged profiles ───────────────────────────
  function resolveRawStoryItem(payload, urlId = urlStoryId()) {
    var reel = payload && payload.data && payload.data.reels_media && payload.data.reels_media[0];
    var items = Array.isArray(reel?.items) ? reel.items.filter(Boolean) : [];
    if (!items.length) return null;

    if (urlId) {
      for (var i = 0; i < items.length; i++) {
        var ids = [items[i].id, items[i].pk]
          .filter(function (id) {
            return id != null;
          })
          .map(String);
        var baseIds = ids.map(function (id) {
          return id.split("_")[0];
        });
        if (ids.indexOf(String(urlId)) > -1 || baseIds.indexOf(String(urlId)) > -1) return items[i];
      }
      return null; // An explicit ID must not silently select somebody else’s item.
    }

    var $time = $("body > div section:visible time[datetime]")
      .filter(function () {
        return (
          $(this).is(":visible") &&
          $(this).parents('a[href^="/stories/highlights/"]').length === 0 &&
          $(this).parents('[role="button"]').length === 0
        );
      })
      .first();
    if ($time.length) {
      var visibleTs = Math.floor(new Date($time.attr("datetime")).getTime() / 1000);
      if (isFinite(visibleTs) && visibleTs) {
        var best = null;
        var minDiff = Infinity;
        items.forEach(function (item) {
          var diff = Math.abs((item.taken_at_timestamp || item.taken_at || 0) - visibleTs);
          if (diff < minDiff) {
            minDiff = diff;
            best = item;
          }
        });
        if (best && minDiff <= 5) return best;
      }
    }

    var countA = $("body > div section._ac0a header._ac0k > ._ac3r ._ac3n ._ac3p[style]").length;
    var countB = $(
      "body > div section:visible > div > div:not([class]) > div > div div.x1ned7t2.x78zum5 div.x1caxmr6"
    ).length;
    var nowIndex = countA || countB;
    if (nowIndex > 0 && nowIndex <= items.length) return items[nowIndex - 1];
    return items.length === 1 ? items[0] : null;
  }

  function extractTaggedProfiles(item, excludeUsername) {
    var profiles = new Map();
    var stickers = item && Array.isArray(item.story_bloks_stickers) ? item.story_bloks_stickers : [];
    stickers.forEach(function (sticker) {
      var username =
        sticker &&
        sticker.bloks_sticker &&
        sticker.bloks_sticker.sticker_data &&
        sticker.bloks_sticker.sticker_data.ig_mention &&
        sticker.bloks_sticker.sticker_data.ig_mention.username;
      if (!cleanName(username)) return;
      if (excludeUsername && username.toLowerCase() === excludeUsername.toLowerCase()) return;
      var key = username.toLowerCase();
      if (!profiles.has(key)) profiles.set(key, username);
    });
    return Array.from(profiles.values());
  }

  function openTaggedProfilesDialog(usernames, mediaId, errorMessage) {
    var modal = createModal({
      title: "Tagged profiles",
      sub: mediaId ? "media " + String(mediaId).split("_")[0] : "",
    });
    if (errorMessage) {
      modal.body.append('<div class="ignis-empty">' + esc(errorMessage) + "</div>");
      return modal;
    }
    if (!usernames.length) {
      modal.body.append('<div class="ignis-empty">No profiles are tagged in this story.</div>');
      return modal;
    }
    var list = $('<div class="ignis-tagged-list">');
    usernames.forEach(function (username) {
      list.append(
        '<a class="ignis-tagged" target="_blank" rel="noopener noreferrer" href="https://www.instagram.com/' +
          encodeURIComponent(username) +
          '/"><span>@' +
          esc(username) +
          "</span>" +
          SVG.NEW_TAB +
          "</a>"
      );
    });
    modal.body.append(list);
    return modal;
  }

  async function showTaggedProfiles(type) {
    var username = getStoryScopeUsername(type);
    if (!username && type !== "highlights") {
      openTaggedProfilesDialog([], null, "Cannot resolve the account name.");
      return;
    }
    try {
      var payload = await loadStoryPayload(username || "", type);
      var item = resolveRawStoryItem(payload);
      if (!item) {
        openTaggedProfilesDialog([], null, "Could not identify the active story item.");
        return;
      }
      var owner = resolveStoryOwner(payload, username);
      var profiles = extractTaggedProfiles(item, owner);
      openTaggedProfilesDialog(profiles, item.pk || item.id || "", null);
    } catch (e) {
      openTaggedProfilesDialog([], null, "Could not load tagged profiles: " + ((e && e.message) || "network error"));
    }
  }

  async function openStoryBrowser(type) {
    var username = getStoryScopeUsername(type);
    if (!username && type !== "highlights") {
      Toasts.error("Cannot resolve the account name.");
      return;
    }
    try {
      var payload = await loadStoryPayload(username || "", type);
      openStoryDialog(payload, type);
    } catch (e) {
      Toasts.error("Could not load the media list: " + ((e && e.message) || "network error"));
    }
  }

  function skipStoryConfirm() {
    if (!USER_SETTING.SKIP_VIEW_STORY_CONFIRM || state.GL_storyConfirmSkipped) return;
    var $button = $(
      'div[id^="mount"] section:last-child > div > div:not([class]) div:last-child > div[role="button"]'
    ).filter(function () {
      return $(this).children().length === 0 && /^view story$/i.test(this.textContent.trim());
    });
    if ($button.length) {
      $button.first().trigger("click");
      state.GL_storyConfirmSkipped = true;
    }
  }

  function skipSharedWithYouDialog() {
    if (!USER_SETTING.SKIP_SHARED_WITH_YOU_DIALOG) return;
    var url;
    try {
      url = new URL(window.location.href);
    } catch (e) {
      return;
    }
    if (!url.searchParams.has("igsh")) return;

    var profileUsername = location.pathname.split("/").filter(Boolean)[0];
    if (profileUsername) profileUsername = profileUsername.toLowerCase();

    $('div[role="dialog"]').each(function () {
      var $dialog = $(this);
      if (!$dialog.is(":visible")) return;
      var $headers = $dialog.find("h2");
      if (!$headers.length) return;
      var isSharedHeader =
        $headers.filter(function () {
          var text = (this.textContent || "").trim().toLowerCase();
          if (!text) return false;
          if (text.indexOf("shared this with you") > -1) return true;
          if (text.indexOf("shared with you") > -1) return true;
          return !!(profileUsername && text.indexOf(profileUsername) > -1 && text.indexOf("shared") > -1);
        }).length > 0;
      if (!isSharedHeader) return;

      var $buttons = $dialog.find('div[role="button"]');
      if (!$buttons.length) return;
      var $notNow = null;
      $buttons.each(function () {
        if ((this.textContent || "").trim().toLowerCase() === "not now") {
          $notNow = $(this);
          return false;
        }
      });
      if ($notNow && $notNow.length) $notNow.trigger("click");
    });
  }

  function maybeSkipSharedDialog() {
    if (!USER_SETTING.SKIP_SHARED_WITH_YOU_DIALOG || !window.location.search.includes("igsh")) return;
    var tries = 0;
    var timer = (state.sharedDialogTimer = setInterval(function () {
      if (!window.location.search.includes("igsh") || ++tries > 20) {
        clearInterval(timer);
        return;
      }
      skipSharedWithYouDialog();
    }, 200));
  }

  // ─── Story controls ────────────────────────────────────────────────────
  function ensureStoryTools($host) {
    positionHost($host[0]);
    $(".ignis-storytools")
      .filter((_, el) => el.parentElement !== $host[0])
      .remove();
    var $bar = $host.children(".ignis-storytools").first();
    if (!$bar.length) {
      $bar = $('<div class="ignis-storytools">');
      $host.append($bar);
    }
    return $bar;
  }

  function attachStoryButtons() {
    var $element = findStoryContainer();
    if (!$element?.length) return;
    var $bar = ensureStoryTools($element);
    var username = getStoryUsername() || "";
    if (!$bar.find(".ignis-sd").length) {
      $bar.append(
        makeButton(SVG.DOWNLOAD, "Download this story", "ignis-sd"),
        makeButton(SVG.NEW_TAB, "Open story in new tab", "ignis-sn")
      );
    }
    if (getStoryProgress(username).length > 1 && !$bar.find(".ignis-sa").length) {
      $bar.append(makeButton(SVG.DOWNLOAD_ALL, "Download all stories", "ignis-sa"));
    }
    if (!$bar.find(".ignis-tp").length) {
      $bar.append(makeButton(SVG.TAGGED_PROFILES, "Show tagged profiles", "ignis-tp"));
    }
    if (!$bar.find(".ignis-sl").length) {
      $bar.append(makeButton(SVG.LIST, "Browse stories", "ignis-sl"));
    }
    setStoryProgressIndexText($element, "ignis-sp-pos", username);
  }

  function attachHighlightButtons() {
    var $element = findStoryContainer();
    if (!$element?.length) return;
    var $bar = ensureStoryTools($element);
    var username = getHighlightsStoryUsername() || "";
    if (!$bar.find(".ignis-hd").length) {
      $bar.append(
        makeButton(SVG.DOWNLOAD, "Download this highlight", "ignis-hd"),
        makeButton(SVG.NEW_TAB, "Open highlight in new tab", "ignis-hn")
      );
    }
    if (getStoryProgress(username).length > 1 && !$bar.find(".ignis-ha").length) {
      $bar.append(makeButton(SVG.DOWNLOAD_ALL, "Download all highlights", "ignis-ha"));
    }
    if (!$bar.find(".ignis-htp").length) {
      $bar.append(makeButton(SVG.TAGGED_PROFILES, "Show tagged profiles", "ignis-htp"));
    }
    if (!$bar.find(".ignis-hl").length) {
      $bar.append(makeButton(SVG.LIST, "Browse highlights", "ignis-hl"));
    }
    setStoryProgressIndexText($element, "ignis-hp-pos", username);
  }

  function attachStoryThumbnailButton() {
    var $bar = $(".ignis-sd").first().parent();
    if (!$bar.length) return;
    var $host = $bar.parent();
    if ($host.find("video").length === 0) {
      $bar.find(".ignis-st").remove();
      return;
    }
    if ($bar.find(".ignis-st").length) return;
    $bar.append(makeButton(SVG.THUMBNAIL, "Download story thumbnail", "ignis-st"));
  }

  function attachHighlightThumbnailButton() {
    var $bar = $(".ignis-hd").first().parent();
    if (!$bar.length) return;
    var $host = $bar.parent();
    if ($host.find("video").length === 0) {
      $bar.find(".ignis-ht").remove();
      return;
    }
    if ($bar.find(".ignis-ht").length) return;
    $bar.append(makeButton(SVG.THUMBNAIL, "Download highlight thumbnail", "ignis-ht"));
  }

  function scanStoryPage() {
    attachStoryButtons();
    skipStoryConfirm();
    attachStoryThumbnailButton();
  }

  function scanHighlightPage() {
    attachHighlightButtons();
    skipStoryConfirm();
    attachHighlightThumbnailButton();
  }

  // ─── Reels ─────────────────────────────────────────────────────────────
  function attachReelBar($main) {
    if (!$main || !$main.length || $main.find(".ignis-rd, .ignis-bar").length) return;
    positionHost($main[0]);
    const action = (preview) => {
      const button = makeButton(preview ? SVG.NEW_TAB : SVG.DOWNLOAD,
        preview ? "Open reel in new tab" : "Download reel", preview ? "ignis-rn" : "ignis-rd");
      button.css({right:"40px", top:preview ? "51px" : "15px"});
      // Instagram can consume the bubble at its playback controller before
      // it reaches document. Handle our own control, not the site's click.
      button.on("click", function (event) {
        event.preventDefault(); event.stopPropagation();
        if (this.disabled) return;
        this.disabled = true;
        downloadCurrentReel(preview, this)
          .catch(err => Toasts.error("Could not open reel: " + (err?.message || err)))
          .finally(() => { this.disabled = false; });
      });
      return button;
    };
    $main.append(action(false), action(true));
  }

  function onReelsPage() {
    for (const video of document.querySelectorAll("main video,div[aria-busy][tabindex] video")) {
      if (video.closest(".ignis-modal")) continue;
      const rect = video.getBoundingClientRect();
      if (rect.width < 140 || rect.height < 120) continue;
      // A transparent Instagram play/pause target can be a *sibling* of the
      // transformed video layer. A high z-index inside that layer cannot win.
      // Mount on the enclosing single-reel surface, never the whole feed.
      let host = video.parentElement;
      for (let el = host; el && !el.matches("main, body"); el = el.parentElement) {
        if (el.querySelectorAll("video").length !== 1) break;
        const box = el.getBoundingClientRect();
        if (box.width >= rect.width - 2 && box.width <= rect.width + 16 &&
            box.height >= rect.height - 2 && box.height <= rect.height + 48 &&
            Math.abs(box.left - rect.left) < 12 && Math.abs(box.top - rect.top) < 32) host = el;
        if (Array.from(el.querySelectorAll("a[href]")).some((a) => postCode(a.href))) {
          host = el;
          break;
        }
      }
      if (host) {
        // If React moved the native overlay above our old mount, move the
        // existing controls rather than adding another toolbar.
        const old = host.querySelector(".ignis-rd");
        if (old && old.parentElement !== host) {
          positionHost(host);
          const preview = old.parentElement.querySelector(".ignis-rn");
          host.appendChild(old);
          if (preview) host.appendChild(preview);
        } else attachReelBar($(host));
      }
    }
  }

  async function downloadCurrentReel(isPreview, button) {
    const host = button.parentElement,
      route = location.href;
    const code =
      Array.from(host.querySelectorAll("a[href]"))
        .map((a) => postCode(a.href))
        .find(Boolean) || postCode(route);
    const video = host.querySelector("video"),
      direct = trustedURL(video?.currentSrc || video?.src || video?.querySelector("source[src]")?.src);
    if (
      direct &&
      (!code || !USER_SETTING.FORCE_RESOURCE_VIA_MEDIA || (isPreview && !USER_SETTING.NEW_TAB_HIGHEST_VIDEO))
    )
      return downloadResource(
        { isVideo: true, url: direct, thumb: trustedURL(video.poster), ext: mediaExtension(direct, "mp4") },
        { sourceType: "reels", shortcode: code || "", username: getPostUsername($(host)) || "NONE" },
        { preview: isPreview }
      );
    if (!code) {
      Toasts.info("No downloadable reel is visible.");
      return;
    }
    logger("Resolving visible reel", code);
    const loaded = await resolvePostShortcode(code, { post: host, complete: true });
    logger("Reel lookup complete", loaded?.items?.length || 0);
    if (loaded && location.href === route && host.isConnected) {
      const videoItem = loaded.items.find((i) => i.isVideo);
      if (videoItem)
        await downloadResource(videoItem, { ...loaded.meta, sourceType: "reels" }, { preview: isPreview });
      else Toasts.info("No downloadable reel is visible.");
    }
  }

  // ─── Profile avatar ────────────────────────────────────────────────────
  function attachAvatarButton() {
    if ($(".ignis-pd").length) return;
    var $img = $("header > *[class]:first-child > *[class]:first-child img[alt]").first();
    if (!$img.length) $img = $("header > *[class]:first-child img[alt]").first();
    if (!$img.length) return;
    var $mount = $img.is("[draggable]") ? $img.parent().parent() : $img.parent().parent().parent();
    if (!$mount.length) $mount = $img.parent().parent();
    if (!$mount.length) return;
    positionHost($mount[0]);
    if ($mount.find(".ignis-pd").length) return;
    $mount.append(makeButton(SVG.DOWNLOAD, "Download profile picture", "ignis-pd"));
  }

  async function downloadAvatar() {
    var parts = location.pathname.split("/").filter(Boolean);
    var username = null;
    if (parts.length && !["p", "reel", "reels", "stories", "explore", "direct"].includes(parts[0])) {
      username = parts[0];
    }
    if (!username) {
      Toasts.error("Cannot resolve the profile name.");
      return;
    }
    try {
      const route = location.href;
      let userInfo = null;
      if (USER_SETTING.DOWNLOAD_PROFILE_PIC_HD) {
        try {
          userInfo = await getUserId(username);
        } catch (_) {}
      }
      var uid = userInfo?.user?.pk || userInfo?.user?.id || null;
      var url = null;
      if (USER_SETTING.DOWNLOAD_PROFILE_PIC_HD && uid) {
        try {
          url = await getUserHdAvatar(uid, username);
        } catch (e) {
          url = null;
          if (e && e.message === "Avatar owner mismatch") {
            var key = username.toLowerCase();
            delete state.GL_userIdCache[key];
            setPersistentCache(USER_ID_CACHE_KEY, state.GL_userIdCache);
            userIdCache.delete(key);
            try {
              var fresh = await resolveUserIdLive(username);
              var freshId = fresh && fresh.user && (fresh.user.pk || fresh.user.id);
              if (freshId) {
                putUserIdInCache(key, freshId);
                userIdCache.set(key, Promise.resolve(fresh));
                userInfo = fresh;
                uid = freshId;
                try {
                  url = await getUserHdAvatar(freshId, username);
                } catch (e2) {
                  url = null;
                }
              }
            } catch (e2) {
              userInfo = null;
              uid = null;
            }
          }
        }
      }
      if (!url && USER_SETTING.DOWNLOAD_PROFILE_PIC_HD && userInfo && userInfo.user && userInfo.user._hdUrl) {
        url = userInfo.user._hdUrl;
      }
      if (!url) {
        url =
          (userInfo && userInfo.user && (userInfo.user.profile_pic_url || userInfo.user.profile_pic_url_hd)) ||
          $("header img[alt]").first().attr("src");
      }
      if (!url) {
        Toasts.error("Cannot find profile picture URL.");
        return;
      }
      if (location.href !== route) return;
      await saveFiles(url, {
        username: username,
        sourceType: "avatar",
        timestamp: Math.floor(Date.now() / 1000),
        shortcode: username,
        filetype: "jpg",
        uid: uid
      });
    } catch (e) {
      Toasts.error("Could not download profile picture: " + ((e && e.message) || "network error"));
    }
  }

  // ─── Scan dispatcher ───────────────────────────────────────────────────
  function storyTick() {
    // Lightweight per-tick work for story/highlight routes: the progress bar
    // advances via style/width changes (no childList mutations), so a cheap
    // targeted refresh replaces the old full scanAll interval.
    var isHl = state.route === "highlights";
    var btnSel = isHl ? ".ignis-hd" : ".ignis-sd";
    if (!$(btnSel).length) {
      if (isHl) attachHighlightButtons();
      else attachStoryButtons();
    }
    var $host = $(btnSel).first().closest(".ignis-storytools").parent();
    if (!$host.length) return;
    if ($host.find("video").length) {
      if (isHl) attachHighlightThumbnailButton();
      else attachStoryThumbnailButton();
    }
    var u = (isHl ? getHighlightsStoryUsername : getStoryUsername)();
    if (u) setStoryProgressIndexText($host, isHl ? "ignis-hp-pos" : "ignis-sp-pos", u);
  }

  function scanAll() {
    if (!state.pageLoaded) return;
    function safe(fn) {
      try {
        fn();
      } catch (e) {
        logger("scan error:", e && e.message ? e.message : e);
      }
    }
    if (state.route === "reels") {
      safe(onReelsPage);
    } else if (state.route === "story") {
      safe(scanStoryPage);
    } else if (state.route === "highlights") {
      safe(scanHighlightPage);
    } else if (state.route === "profile") {
      safe(attachAvatarButton);
      safe(scanPosts);
    } else if (
      state.route === "post" ||
      state.route === "home" ||
      state.route === "explore" ||
      state.route === "dm" ||
      state.route === null
    ) {
      safe(scanPosts);
    }
    safe(scanGrids);
  }

  let scanScheduled = false;
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(function () {
      scanScheduled = false;
      // The observer doubles as the navigation safety net: any DOM churn on
      // an unclassified/blacklisted page re-runs the router, so no periodic
      // watchdog is needed.
      if (state.firstStarted && ((!state.pageLoaded && !state.blocked) || location.href !== state.currentURL)) {
        Router.enter();
        return;
      }
      scanAll();
    }, 150);
  }

  let domObserver = null;
  let domObserverRoot = null;
  function installDomObserver() {
    if (domObserver) domObserver.disconnect();
    var mount = document.documentElement;
    domObserverRoot = mount;
    domObserver = new MutationObserver(function (muts) {
      if ($body[0] !== document.body && document.body) $body = $(document.body);
      const own =
        ".ignis-modal,.ignis-bar,.ignis-storytools,.ignis-progress,.ignis-toasts,.ignis-palette,.ignis-ksh,.ignis-rd,.ignis-rn,.ignis-pd,.ignis-gd";
      if (
        location.href !== state.currentURL ||
        muts.some(
          (m) =>
            !m.target.closest?.(own) &&
            ((m.type === "attributes" && m.target.matches("a[href],#splash-screen")) ||
              Array.from(m.addedNodes).some((n) => n.nodeType === 1 && !n.matches(own)) ||
              Array.from(m.removedNodes).some(
                (n) => n.nodeType === 1 && (n.id === "splash-screen" || n.matches(".ignis-bar,.ignis-gd"))
              ) ||
              (!state.pageLoaded && !state.blocked && m.target.id === "splash-screen"))
        )
      )
        scheduleScan();
    });
    domObserver.observe(mount, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    const splash = document.getElementById("splash-screen");
    if (splash)
      domObserver.observe(splash, {
        attributes: true,
        attributeFilter: ["style", "class", "hidden"],
        childList: true,
        subtree: true
      });
  }

  // ─── Delegated click handlers ──────────────────────────────────────────
  function selectedPostItem(loaded, index) {
    const item = loaded.items.find((it) => it._igSourceIndex === index + 1);
    if (!item) Toasts.info("Could not identify this slide. Open the post dialog to choose an item.");
    return item;
  }
  async function downloadPostBatch(ctx) {
    const post = ctx.$article[0],
      loaded = await resolvePostShortcode(ctx.postPath, { post, complete: true });
    if (!loaded) return;
    if (loaded.fromDom) return openPostDialog(ctx.postPath, { post, initial: loaded });
    return batchDownload(loaded.items, loaded.meta);
  }

  function registerBodyHandlers() {
    if (state.bodyEventsRegistered) return;
    state.bodyEventsRegistered = true;

    $(document).on("click.ignisEvents", ".ignis-dl", function () {
      var ctx = getPostContextFromButton(this);
      if (!ctx.postPath) {
        Toasts.error("Cannot find the post link.");
        return;
      }
      var postEl = ctx.$article[0] || null;
      if (USER_SETTING.DIRECT_DOWNLOAD_ALL) {
        downloadPostBatch(ctx);
        return;
      }
      if (USER_SETTING.DIRECT_DOWNLOAD_VISIBLE_RESOURCE) {
        var index = getVisibleNodeIndex(ctx.$article);
        resolvePostShortcode(ctx.postPath, { post: postEl, complete: true }).then(function (loaded) {
          if (!loaded) return;
          var item = selectedPostItem(loaded, index);
          if (item) downloadResource(item, loaded.meta, {});
        });
        return;
      }
      openPostDialog(ctx.postPath, { post: postEl });
    });

    $(document).on("click.ignisEvents", ".ignis-da", function () {
      var ctx = getPostContextFromButton(this);
      if (!ctx.postPath) {
        Toasts.error("Cannot find the post link.");
        return;
      }
      downloadPostBatch(ctx);
    });

    $(document).on("click.ignisEvents", ".ignis-nt", function () {
      var ctx = getPostContextFromButton(this);
      if (!ctx.postPath) {
        Toasts.error("Cannot find the post link.");
        return;
      }
      var index = getVisibleNodeIndex(ctx.$article);
      resolvePostShortcode(ctx.postPath, { post: ctx.$article[0] || null, complete: true }).then(function (loaded) {
        if (!loaded) return;
        var item = selectedPostItem(loaded, index);
        if (item) downloadResource(item, loaded.meta, { preview: true });
      });
    });

    $(document).on("click.ignisEvents", ".ignis-th", function () {
      var ctx = getPostContextFromButton(this);
      if (!ctx.postPath) {
        Toasts.error("Cannot find the post link.");
        return;
      }
      var index = getVisibleNodeIndex(ctx.$article);
      resolvePostShortcode(ctx.postPath, { post: ctx.$article[0] || null, complete: true }).then(function (loaded) {
        if (!loaded) return;
        var item = selectedPostItem(loaded, index);
        if (item && item.thumb) {
          saveFiles(
            item.thumb,
            Object.assign({}, loaded.meta, {
              index: item._igSourceIndex,
              timestamp: item.takenAt || loaded.meta.timestamp,
              sourceType: "thumbnail",
              filetype: "jpg"
            })
          );
        }
      });
    });

    $(document).on("click.ignisEvents", ".ignis-sd", function () {
      if (USER_SETTING.DIRECT_DOWNLOAD_STORY) downloadStoriesAll("stories");
      else downloadStoryCurrent("stories", false);
    });
    $(document).on("click.ignisEvents", ".ignis-sn", function () {
      downloadStoryCurrent("stories", true);
    });
    $(document).on("click.ignisEvents", ".ignis-sa", function () {
      downloadStoriesAll("stories");
    });
    $(document).on("click.ignisEvents", ".ignis-st", function () {
      downloadStoryThumbnail("stories");
    });

    $(document).on("click.ignisEvents", ".ignis-hd", function () {
      if (USER_SETTING.DIRECT_DOWNLOAD_STORY) downloadStoriesAll("highlights");
      else downloadStoryCurrent("highlights", false);
    });
    $(document).on("click.ignisEvents", ".ignis-hn", function () {
      downloadStoryCurrent("highlights", true);
    });
    $(document).on("click.ignisEvents", ".ignis-ha", function () {
      downloadStoriesAll("highlights");
    });
    $(document).on("click.ignisEvents", ".ignis-ht", function () {
      downloadStoryThumbnail("highlights");
    });
    $(document).on("click.ignisEvents", ".ignis-tp", function () {
      showTaggedProfiles("stories");
    });
    $(document).on("click.ignisEvents", ".ignis-htp", function () {
      showTaggedProfiles("highlights");
    });
    $(document).on("click.ignisEvents", ".ignis-sl", function () {
      openStoryBrowser("stories");
    });
    $(document).on("click.ignisEvents", ".ignis-hl", function () {
      openStoryBrowser("highlights");
    });

    $(document).on("click.ignisEvents", ".ignis-pd", function () {
      downloadAvatar();
    });
  }

  // ─── Router ────────────────────────────────────────────────────────────
  const Router = {
    enter: function () {
      this.cleanup();
      state.firstStarted = true;
      state.currentURL = location.href;
      state.route = null;
      state.GL_storyConfirmSkipped = false;
      var path = location.pathname;
      var blacklist =
        /^\/(challenge\/?.*|qr\/?|accounts\/.*|emails\/.*|language\/?.*?|your_activity\/?.*|settings\/help(\/.*)?|auth_platform\/codeentry\/?.*|consent\/?.*)$/i;
      state.blocked = blacklist.test(path);
      if (state.blocked || ($("div#splash-screen").length > 0 && !$("div#splash-screen").is(":hidden"))) {
        state.pageLoaded = false;
        if (!state.blocked) installDomObserver();
        return;
      }
      if (path === "/" || /^\/explore(?:\/|$)/.test(path)) {
        state.route = path === "/" ? "home" : "explore";
      } else if (path.startsWith("/p/") || path.startsWith("/reel/") || /^\/([^/]+)\/(p|reel)\//.test(path)) {
        state.route = "post";
      } else if (/^\/reels(?:\/|$)/.test(path)) {
        state.route = "reels";
      } else if (path.startsWith("/stories/highlights/")) {
        state.route = "highlights";
      } else if (path.startsWith("/stories/")) {
        state.route = "story";
      } else if (path.startsWith("/direct/")) {
        state.route = "dm";
      } else if (
        path.split("/").filter(Boolean).length === 1 &&
        /^[a-zA-Z0-9_.]{1,30}$/.test(path.split("/").filter(Boolean)[0] || "")
      ) {
        state.route = "profile";
      } else {
        state.route = null;
      }
      state.pageLoaded = true;
      maybeSkipSharedDialog();
      // Self-heal: Instagram occasionally swaps the mount node, which would
      // silently orphan the observer. Re-arm it whenever the root died.
      if (!domObserver || !domObserverRoot || !domObserverRoot.isConnected) {
        installDomObserver();
      }
      try {
        scanAll();
      } catch (e) {
        logger("router scan error:", e && e.message ? e.message : e);
      }
      if (state.route === "home" || state.route === "explore" || state.route === "post") {
        // Bounded backoff ladder instead of a 50ms×100 hot poll: the
        // MutationObserver already covers late renders, these are just
        // insurance scans while the first paint settles.
        var follow = [400, 1000, 2500];
        var fi = 0;
        function followScan() {
          try {
            scanAll();
          } catch (e) {
            /* isolated */
          }
          if (fi < follow.length && !document.querySelector(".ignis-bar, .ignis-gd")) {
            state.postPoll = setTimeout(followScan, follow[fi++]);
          } else {
            state.postPoll = null;
          }
        }
        state.postPoll = setTimeout(followScan, follow[fi++]);
      }
      if (state.route === "story" || state.route === "highlights") {
        state.GL_repeat = setInterval(function () {
          try {
            storyTick();
          } catch (e) {
            /* isolated */
          }
        }, checkInterval);
      }
    },
    cleanup: function () {
      clearInterval(state.GL_repeat);
      state.GL_repeat = null;
      clearTimeout(state.postPoll);
      state.postPoll = null;
      clearTimeout(state.homepageObserverDebounce);
      clearInterval(state.sharedDialogTimer);
      sharedIO?.disconnect();
      sharedIO = null;
      ioCallbacks = new WeakMap();
      while (ModalStack.modals.length) ModalStack.pop();
      $(document).off("keydown.igpal");
      $(".ignis-bar,.ignis-storytools,.ignis-rd,.ignis-rn,.ignis-gd,.ignis-pd,.ignis-palette,.ignis-ksh").remove();
      $("[data-snig=canDownload]").removeAttr("data-snig");
      $(".ignis-position-host").removeClass("ignis-position-host");
      var now = Date.now();
      Object.keys(state.GL_payloadCache).forEach(function (k) {
        var c = state.GL_payloadCache[k];
        if (!c || now - c.ts > POST_CACHE_MAX_AGE) delete state.GL_payloadCache[k];
      });
      // Story/highlight payloads are re-fetchable; keep them for the session
      // (per-item swipes reuse them) but bound total retention.
      var dcCount =
        Object.keys(state.GL_dataCache.stories).length + Object.keys(state.GL_dataCache.highlights).length;
      if (dcCount > 30) {
        state.GL_dataCache.stories = Object.create(null);
        state.GL_dataCache.highlights = Object.create(null);
      }
    },
    start: function () {
      // Navigation events and the DOM observer work across manager sandboxes. Coalesce
      // bursts (IG fires several mutations per route change) into one enter.
      var navTimer = null;
      __ignisOnNavigate = function () {
        if (navTimer) return;
        navTimer = setTimeout(function () {
          navTimer = null;
          if (location.href !== state.currentURL) Router.enter();
        }, 60);
      };
    }
  };

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
