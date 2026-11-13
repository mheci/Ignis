// ==UserScript==
// @name               IGNIS — Instagram Enhancement Suite
// @version            10.0.0
// @description        IGNIS v10: high-quality downloads (posts, reels, stories, highlights, HD avatars, DASH video+audio MP4 mux, captions, EXIF), tagged-profile lookup, IndexedDB caches, local statistics, and a rebuilt interface.
// @author             IGNIS
// @match              https://*.instagram.com/*
// @downloadURL        https://github.com/mheci/Ignis/releases/latest/download/ignis.user.js
// @updateURL          https://github.com/mheci/Ignis/releases/latest/download/ignis.user.js
// @require            https://code.jquery.com/jquery-4.0.0.min.js
// @require            https://cdn.jsdelivr.net/npm/mediabunny@1.34.5/dist/bundles/mediabunny.min.cjs
// @grant              GM_addStyle
// @grant              GM_download
// @grant              GM_getValue
// @grant              GM_notification
// @grant              GM_registerMenuCommand
// @grant              GM_setValue
// @grant              GM_unregisterMenuCommand
// @grant              unsafeWindow
// @grant              GM_xmlhttpRequest
// @connect            *
// @icon               https://www.google.com/s2/favicons?domain=www.instagram.com&sz=32
// @license            GPL-3.0-only
// @compatible         chrome >= 100
// @compatible         edge >= 100
// @compatible         firefox >= 100
// @run-at             document-start
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "10.0.0";
  const NAME = "IGNIS";
  const $ = jQuery;

  var __ignisFocusTarget = (typeof unsafeWindow !== "undefined" && unsafeWindow) || window;
  var __ignisNativeFocus = null;
  try {
    __ignisNativeFocus = __ignisFocusTarget.focus.bind(__ignisFocusTarget);
    var __ignisGuardedFocus = function () {
      try {
        if (!document.hasFocus()) return;
      } catch (e) {}
      return __ignisNativeFocus.apply(__ignisFocusTarget, arguments);
    };
    window.focus = __ignisGuardedFocus;
    __ignisFocusTarget.focus = __ignisGuardedFocus;
  } catch (e) {}

  var __ignisOnNavigate = null;
  function __ignisHandleNavigate() {
    if (typeof __ignisOnNavigate !== "function") return;
    try {
      __ignisOnNavigate();
    } catch (e) {

    }
  }
  try {
    var __ignisPushState = history.pushState;
    var __ignisReplaceState = history.replaceState;
    history.pushState = function () {
      var r = __ignisPushState.apply(this, arguments);
      __ignisHandleNavigate();
      return r;
    };
    history.replaceState = function () {
      var r = __ignisReplaceState.apply(this, arguments);
      __ignisHandleNavigate();
      return r;
    };
  } catch (e) {

  }
  window.addEventListener("popstate", __ignisHandleNavigate);
  window.addEventListener("hashchange", __ignisHandleNavigate);

  const SETTINGS = [
    ["AUTO_RENAME", "download", "Auto Rename Files", "Auto-renames downloaded files. Right-click the row to edit the template.", true],
    ["RENAME_PUBLISH_DATE", "download", "Use Publish Date in Filename", "Uses the post publish date instead of the download time.", true],
    ["CAPTURE_IMAGE_VIA_MEDIA_CACHE", "download", "Capture Images via Cache", "Captures high-quality image URLs from the page's resource cache.", true],
    ["DOWNLOAD_ORIGINAL_QUALITY", "download", "Download Original Quality", "Strips size constraints from CDN URLs to get the original file.", true],
    ["FORCE_RESOURCE_VIA_MEDIA", "download", "Fetch via Media API", "Fetches resources via the Media API for the highest quality.", true],
    ["PREFER_DASH_MANIFEST", "download", "Prefer DASH Manifest", "Downloads separate highest-quality video + audio DASH streams and merges them.", true],
    ["FALLBACK_TO_BLOB_FETCH_IF_MEDIA_API_THROTTLED", "download", "Fallback if API Throttled", "Falls back to direct links when the Media API is rate-limited.", true],
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

  const PERSISTENT_CACHE_DB_NAME = "IGNIS";
  const PERSISTENT_CACHE_DB_VERSION = 1;
  const PERSISTENT_CACHE_STORE_NAME = "DATA_CACHE";
  const PERSISTENT_CACHE_FLUSH_DELAY = 500;

  const PERSISTENT_CACHE_BINDINGS = {
    [IMAGE_CACHE_KEY]: "GL_imageCache",
    [USER_ID_CACHE_KEY]: "GL_userIdCache",
  };

  const HASTE_BITMAP_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";

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

  const mediaCache = new Map();
  let $body = $("body");

  const persistentCacheStore = {
    backend: null,
    db: null,
    readyPromise: null,
    values: new Map(),
    pending: new Set(),
    flushTimer: null,
    flushChain: Promise.resolve(true),
  };

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
    GL_dataCache: { stories: {}, highlights: {}, posts: {}, taggedProfiles: {} },
    GL_payloadCache: {},
    GL_imageCache: {},
    GL_userIdCache: {},
    GL_mediaDataCache: {},
    busy: 0,
    _igTab: "download",
    settingsHotkeyKeyCode: 87,
    debugHotkeyKeyCode: 90,
    downloadStoryHotkeyKeyCode: 83,
    bodyEventsRegistered: false,
  };

  const Store = {
    get(key, fallback) {
      try {
        const v = GM_getValue(key, fallback);
        return v === undefined ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        GM_setValue(key, value);
      } catch (e) {

      }
    },
    loadImageCache() {
      const raw = this.get(IMAGE_CACHE_KEY, {});
      if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
      return {};
    },
  };

  const STATS_KEY = "IGNIS_STATS_V1";
  const Stats = {
    _data: null,
    _blank() {
      return { v: 1, firstDay: Date.now(), sessions: 0, items: 0, bytes: 0, byType: {}, byDay: {}, lastAt: 0 };
    },
    _load() {
      if (!this._data) {
        var d = Store.get(STATS_KEY, null);
        this._data = d && typeof d === "object" && d.v === 1 && d.byType && d.byDay ? d : this._blank();
      }
      return this._data;
    },
    _save() {
      try {
        Store.set(STATS_KEY, this._data);
      } catch (e) {

      }
    },
    session() {
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
    },
  };

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

    }
  }

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
    if (ts == null || isNaN(ts)) return Math.floor(Date.now() / 1000);
    ts = Number(ts);
    return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
  }

  function sanitizeFilename(name) {
    return String(name == null ? "" : name)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .replace(/[. ]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
  }

  function isMacOS() {
    return /Mac|iPod|iPhone|iPad/i.test(navigator.userAgent);
  }

  function getPlatformModifierKey() {
    return isMacOS() ? "⌥" : "Alt";
  }

  function makeButton(icon, title, cls) {
    return $(
      '<div class="' + cls + '" role="button" tabindex="0" aria-label="' + esc(title) + '" title="' + esc(title) + '">' + icon + "</div>"
    );
  }

  function openNewTab(link) {
    if (!link) return;
    var a = document.createElement("a");
    a.href = link;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function cleanName(t) {
    t = (t || "").replace(/^@/, "").trim().toLowerCase();
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
    var u = cleanName(name);
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

  function sortCandidatesDescending(candidates, widthKey, stpKey) {
    if (!Array.isArray(candidates)) return candidates || [];
    return candidates
      .map(function (c) {
        return c;
      })
      .sort(function (a, b) {
        if (stpKey) {
          var aStp = "",
            bStp = "";
          try {
            aStp = new URL(a.url || a.src).searchParams.get("stp") || "";
            bStp = new URL(b.url || b.src).searchParams.get("stp") || "";
          } catch (e) {

          }
          if (aStp && bStp && aStp.length !== bStp.length) return bStp.length - aStp.length;
        }
        var aW = a[widthKey] || a.config_width || 0;
        var bW = b[widthKey] || b.config_width || 0;
        return bW - aW;
      });
  }

  function findStoryContainer() {
    if ($("body > div section._ac0a").length > 0) {
      return $("body > div section:visible._ac0a");
    }
    var $c = $("body > div section:visible > div > div[style]:not([class])");
    if ($c.length) {
      $c.css("position", "relative");
      return $c;
    }
    var $mount = $('div[id^="mount"] section > div > a[href="/"]');
    if ($mount.length) {
      var $d = $mount
        .parent()
        .parent()
        .parent()
        .find("section:visible > div > div[style]:not([class])");
      if ($d.length) {
        $d.css("position", "relative");
        return $d;
      }
      var $e = $mount
        .parent()
        .parent()
        .parent()
        .find(
          'section:visible > div div[style]:not([class]) > div:not([data-visualcompletion="loading-state"])'
        );
      if ($e.length) {
        $e.css("position", "relative");
        return $e;
      }
      var $f = $mount.parents("section:visible").find("div[style]:not([class])");
      if ($f.length) {
        $f.css("position", "relative");
        return $f;
      }
    }
    var $g = $(
      "body > div div:not([hidden]) section:visible > div div[class][style] > div[style]:not([class])"
    );
    if ($g.length) {
      var best = null,
        bestW = -1;
      $g.each(function () {
        var w = $(this).width();
        if (w > bestW) {
          bestW = w;
          best = $(this);
        }
      });
      if (best) return best.children("div").first();
    }
    return null;
  }

  function updateLoadingBar(isLoading) {
    state.busy = Math.max(0, state.busy + (isLoading ? 1 : -1));
    if (state.busy > 0) Progress.show();
    else Progress.hide();
  }

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
      GM_notification({ title: title, text: text || "", timeout: 5000 });
    } catch (e) {
      Toasts.info((title || "") + (text ? " — " + text : ""));
    }
  }

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
        if (el) el.classList.remove("ignis-progress-on");
      },
      set: function (now, total) {
        ensure();
        label.textContent = now + "/" + total;
        this.show();
        if (now >= total) {
          setTimeout(function () {
            Progress.hide();
          }, 700);
        }
      },
    };
  })();

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
      ["G_HOTKEY_DOWNLOAD_STORY_KEYCODE", "downloadStoryHotkeyKeyCode"],
    ];
    hotkeys.forEach(function (pair) {
      var v = Store.get(pair[0], null);
      if (typeof v === "number") state[pair[1]] = v;
    });
    state.GL_imageCache = Store.loadImageCache();
    var cachedIds = Store.get(USER_ID_CACHE_KEY, null);
    state.GL_userIdCache = cachedIds && typeof cachedIds === "object" && !Array.isArray(cachedIds) ? cachedIds : {};
  }

  function decodeMediaIdFromUrl(url) {
    try {
      var u = new URL(url);
      var key = u.searchParams.get("ig_cache_key");
      if (key) {
        var raw = atob(key.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"));
        if (/^\d+$/.test(raw)) return raw.length > 19 ? raw.slice(0, 19) : raw;
        return raw || null;
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
    if (!srcset) return [];
    return srcset
      .split(",")
      .map(function (part) {
        var bits = part.trim().split(/\s+/);
        return { url: bits[0], width: parseInt(bits[1], 10) || 0 };
      })
      .filter(function (e) {
        return e.url;
      });
  }

  function stripSizeConstraints(url) {
    if (!url) return url;
    return url.replace(/[\/_]s\d+x\d+/g, "").replace(/s\d+x\d+/g, "s1080x1080");
  }

  function pickImage(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return null;
    var best = null;
    candidates.forEach(function (c) {
      var url = c.url || c.src || null;
      if (!url) return;
      var w = c.width || c.config_width || 0;
      if (!best || w > best.width) best = { url: url, width: w };
    });
    if (!best) return null;
    return USER_SETTING.DOWNLOAD_ORIGINAL_QUALITY ? stripSizeConstraints(best.url) : best.url;
  }

  function pickVideo(versions) {
    if (!Array.isArray(versions) || !versions.length) return null;
    var best = null;
    versions.forEach(function (v) {
      var url = v.url || v.src || null;
      if (!url) return;
      var area = (v.width || 0) * (v.height || 0);
      if (!best || area > best.area) best = { url: url, area: area };
    });
    return best ? best.url : null;
  }

  function thumbFromDisplayResources(resources) {
    if (!Array.isArray(resources) || !resources.length) return null;
    var sorted = sortCandidatesDescending(resources, "config_width");
    var best = sorted[0];
    return best ? best.src || best.url || null : null;
  }

  function captionOf(item) {
    if (!item) return null;
    if (typeof item.caption === "string") return item.caption || null;
    if (item.caption && typeof item.caption === "object" && item.caption.text) return item.caption.text;
    if (item.edge_media_to_caption && item.edge_media_to_caption.edges && item.edge_media_to_caption.edges[0]) {
      return item.edge_media_to_caption.edges[0].node.text || null;
    }
    return null;
  }

  function normalizePostResource(resource) {
    var out = { username: null, shortcode: null, takenAt: null, caption: null, items: [] };
    if (!resource) return out;
    out.username = (resource.owner && resource.owner.username) || (resource.user && resource.user.username) || null;
    out.shortcode = resource.shortcode || resource.code || null;
    out.takenAt = resource.taken_at_timestamp || resource.taken_at || null;
    out.caption = captionOf(resource);
    if (out.caption && typeof out.caption === "string") out.caption = out.caption.slice(0, 4000);

    var push = function (node) {
      var it = {
        id: node.pk || node.id || String(node.media_id || ""),
        isVideo: isReelsMediaVideo(node),
        url: null,
        thumb: null,
        width: 0,
        height: 0,
        caption: captionOf(node),
        dash: node.video_dash_manifest ? node : null,
        ext: null,
      };
      if (it.isVideo) {
        var versions = node.video_versions && node.video_versions.length ? node.video_versions : null;
        var vRes = node.video_resources && node.video_resources.length ? node.video_resources : null;
        var vUrl = pickVideo(versions) || pickVideo(vRes) || node.video_url || null;
        if (vUrl) {
          it.url = vUrl;
          it.ext = "mp4";
          if (versions && versions[0]) {
            it.width = versions[0].width || 0;
            it.height = versions[0].height || 0;
          }
          if (vRes && vRes[0]) {
            it.width = it.width || vRes[0].config_width || 0;
            it.height = it.height || vRes[0].config_height || 0;
          }
          it.thumb = thumbFromDisplayResources(node.display_resources) ||
            thumbFromDisplayResources(node.image_versions2 && node.image_versions2.candidates) ||
            node.display_url || null;
        }
      } else {
        var imgUrl = pickImage(node.display_resources) ||
          pickImage(node.image_versions2 && node.image_versions2.candidates) ||
          node.display_url || node.display_src || null;
        if (imgUrl) {
          it.url = imgUrl;
          it.ext = /\.webp(\?|$)/i.test(imgUrl) ? "webp" : "jpg";
          it.thumb = it.url;
          var bestImg = sortCandidatesDescending(node.image_versions2 && node.image_versions2.candidates, "width");
          if (bestImg && bestImg[0]) {
            it.width = bestImg[0].width || 0;
            it.height = bestImg[0].height || 0;
          } else if (node.display_resources && node.display_resources.length) {
            it.width = node.display_resources[node.display_resources.length - 1].config_width || 0;
            it.height = node.display_resources[node.display_resources.length - 1].config_height || 0;
          }
        }
      }
      if (it.url) out.items.push(it);
    };

    if (resource.__typename === "GraphSidecar") {
      (resource.edge_sidecar_to_children && resource.edge_sidecar_to_children.edges || []).forEach(function (e) {
        push(e.node);
      });
    } else if (resource.carousel_media && resource.carousel_media.length) {
      resource.carousel_media.forEach(push);
    } else {
      push(resource);
    }
    return out;
  }

  function normalizeReelItems(items) {
    return (items || []).map(function (item) {
      var it = {
        id: item.pk || item.id || "",
        isVideo: isReelsMediaVideo(item),
        url: null,
        thumb: null,
        width: 0,
        height: 0,
        takenAt: item.taken_at_timestamp || item.taken_at || null,
        caption: typeof item.caption === "string" ? item.caption : null,
        dash: item.video_dash_manifest ? item : null,
        ext: "jpg",
      };
      if (it.isVideo) {
        var vUrl = pickVideo(item.video_resources) || (item.video_versions && item.video_versions.length ? pickVideo(item.video_versions) : null);
        if (vUrl) {
          it.url = vUrl;
          it.ext = "mp4";
        }
        it.thumb = thumbFromDisplayResources(item.display_resources) ||
          thumbFromDisplayResources(item.image_versions2 && item.image_versions2.candidates) ||
          item.display_url || null;
      } else {
        var imgUrl = pickImage(item.display_resources) ||
          pickImage(item.image_versions2 && item.image_versions2.candidates) ||
          item.display_url || null;
        if (imgUrl) {
          it.url = imgUrl;
          it.thumb = it.url;
        }
      }
      var bestCand = sortCandidatesDescending(item.image_versions2 && item.image_versions2.candidates, "width");
      if (bestCand && bestCand[0]) {
        it.width = bestCand[0].width || 0;
        it.height = bestCand[0].height || 0;
      }
      return it;
    }).filter(function (it) {
      return it.url;
    });
  }

  let cachedAppId = null;
  let graphQLContextCache = { ts: 0, siteData: null, haste: null };

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

  function getBloks() {
    var result = null;
    $('script[type="application/json"][data-sjs]').each(function () {
      var m = (this.textContent || "").match(/"WebBloksVersioningID",\[\],\{"versioningID":"([0-9a-z_-]+)"\}/i);
      if (m && !result) {
        result = m[1];
        return false;
      }
    });
    return result;
  }

  function getDTSG() {
    var result = null;
    $('script[type="application/json"][data-sjs]').each(function () {
      var m = (this.textContent || "").match(/"DTSGInitialData",\[\],\{"token":"([0-9a-z_:-]+)"\}/i);
      if (m && !result) {
        result = m[1];
        return false;
      }
    });
    return result;
  }

  function findConfig(data, name) {
    var stack = [data];
    while (stack.length) {
      var node = stack.pop();
      if (Array.isArray(node)) {
        if (node[0] === name && node.length >= 3 && node[2] && typeof node[2] === "object" && !Array.isArray(node[2])) {
          return node[2];
        }
        stack.push.apply(stack, node);
      } else if (node && typeof node === "object") {
        stack.push.apply(stack, Object.values(node));
      }
    }
    return null;
  }

  function getSiteData() {
    var text = null;
    $('script[type="application/json"][data-sjs]').each(function () {
      var t = this.textContent || "";
      if (/"SiteData",\[\],\{/i.test(t)) {
        text = t;
        return false;
      }
    });
    if (!text) return null;
    try {
      return findConfig(JSON.parse(text), "SiteData");
    } catch (e) {
      return null;
    }
  }

  function getJazoest(fbDtsg) {
    if (!fbDtsg) return "";
    var sum = 0;
    for (var i = 0; i < fbDtsg.length; i++) sum += fbDtsg.charCodeAt(i);
    return "2" + sum;
  }

  function encodeHasteBitMap(indexes) {
    var bits = [];
    indexes.forEach(function (index) {
      if (Number.isInteger(index) && index >= 0) bits[index] = 1;
    });
    if (!bits.length) return "";
    var gamma = function (num) {
      var binary = num.toString(2);
      return "0".repeat(binary.length - 1) + binary;
    };
    var lastValue = bits[0] || 0;
    var runLength = 1;
    var output = String(lastValue);
    for (var i = 1; i < bits.length; i++) {
      var value = bits[i] || 0;
      if (value === lastValue) runLength++;
      else {
        output += gamma(runLength);
        lastValue = value;
        runLength = 1;
      }
    }
    output += gamma(runLength);
    var chunks = (output + "00000").match(/[01]{6}/g) || [];
    return chunks
      .map(function (chunk) {
        return HASTE_BITMAP_ALPHABET[parseInt(chunk, 2)];
      })
      .join("");
  }

  function parseHasteResourceIndexes(value) {
    if (typeof value !== "string" || value[0] !== ":") return [];
    return value
      .slice(1)
      .split(",")
      .map(function (item) {
        return parseInt(item, 10);
      })
      .filter(Number.isInteger);
  }

  function getHasteBitMapParams() {
    var dynIndexes = new Set();
    var hasteIndexes = { __csr: new Set(), __hsdp: new Set(), __hblp: new Set(), __sjsp: new Set() };
    var addHasteIndex = function (name, index) {
      if (!hasteIndexes[name]) hasteIndexes[name] = new Set();
      hasteIndexes[name].add(index);
    };
    var resources = [];
    var csrOn = true;

    var isDefineList = function (value) {
      return Array.isArray(value) &&
        value.every(function (entry) {
          return Array.isArray(entry) && typeof entry[0] === "string";
        });
    };

    var walk = function (data) {
      var stack = [data];
      while (stack.length) {
        var node = stack.pop();
        if (Array.isArray(node)) {
          if (node[0] === "AsyncData" && node[1] === "resolve") continue;
          if (node[0] === "BootloaderConfig" && node[2] && typeof node[2] === "object" && "csrOn" in node[2]) {
            csrOn = !!node[2].csrOn;
          }
          stack.push.apply(stack, node);
          continue;
        }
        if (!node || typeof node !== "object") continue;
        if (isDefineList(node.define)) {
          node.define.forEach(function (entry) {
            if (Number.isInteger(entry[3]) && entry[3] >= 0) dynIndexes.add(entry[3]);
          });
        }
        if (typeof node.phd2_indexes === "string") {
          parseHasteResourceIndexes(node.phd2_indexes).forEach(function (index) {
            addHasteIndex("__sjsp", index);
          });
        }
        if (node.indexUpgrades && typeof node.indexUpgrades === "object") {
          Object.keys(node.indexUpgrades).forEach(function (name) {
            parseHasteResourceIndexes(node.indexUpgrades[name]).forEach(function (index) {
              addHasteIndex(name, index);
            });
          });
        }
        if (node.rsrcMap && typeof node.rsrcMap === "object") {
          resources.push.apply(resources, Object.values(node.rsrcMap));
        }
        stack.push.apply(stack, Object.values(node));
      }
    };

    document.querySelectorAll('script[type="application/json"][data-sjs]').forEach(function (script) {
      try {
        walk(JSON.parse(script.textContent || ""));
      } catch (e) {

      }
    });

    document.querySelectorAll("script[data-bootloader-hash], link[data-bootloader-hash]").forEach(function (element) {
      var c = element.getAttribute("data-c");
      resources.push({
        type: element.tagName === "LINK" ? "css" : "js",
        p: element.getAttribute("data-p"),
        c: c === "1" ? 1 : c === "2" ? 2 : 0,
      });
    });

    if (csrOn) {
      resources.forEach(function (resource) {
        if (!resource || resource.type === "async" || resource.type === "csr" || resource.p == null || !resource.c) return;
        parseHasteResourceIndexes(resource.p).forEach(function (index) {
          if (index !== 0) addHasteIndex("__csr", index);
        });
      });
    }

    var result = {};
    var dyn = encodeHasteBitMap(dynIndexes);
    if (dyn) result.__dyn = dyn;
    Object.keys(hasteIndexes).forEach(function (name) {
      var value = encodeHasteBitMap(hasteIndexes[name]);
      if (value) result[name] = value;
    });
    return result;
  }

  function genWebSessionId() {
    var rand6 = function () {
      return Math.floor(Math.random() * Math.pow(2, 31))
        .toString(36)
        .padStart(6, "0");
    };
    return rand6() + ":" + rand6() + ":" + rand6();
  }

  function getGraphQLContext() {
    if (!graphQLContextCache.ts || Date.now() - graphQLContextCache.ts > 60000 || !graphQLContextCache.siteData) {
      graphQLContextCache = {
        ts: Date.now(),
        siteData: getSiteData(),
        haste: getHasteBitMapParams(),
      };
    }
    return graphQLContextCache;
  }

  function buildGraphQLData(docId, variables, friendlyName, crn, rootName) {
    var context = getGraphQLContext();
    var siteData = context.siteData || {};
    var hasteData = context.haste || {};
    var lsd = getLSD();
    var dtsg = getDTSG();
    var bloks = getBloks();
    var body = Object.assign(
      {
        av: getCookie("ds_user_id") || "0",
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: friendlyName,
        server_timestamps: "true",
        doc_id: docId,
        lsd: lsd || "",
        fb_dtsg: dtsg || "",
        __hs: siteData.haste_session || "",
        __hsi: siteData.hsi || "",
        __rev: siteData.client_revision || "",
        __spin_r: siteData.__spin_r || "",
        __spin_b: siteData.__spin_b || "",
        __spin_t: siteData.__spin_t || "",
        __comet_req: siteData.comet_env || "",
        __ccg: "EXCELLENT",
        dpr: "3",
        jazoest: getJazoest(dtsg),
        __user: "0",
        __a: "1",
        __d: "www",
        __req: "1",
        __s: genWebSessionId(),
        variables: JSON.stringify(variables),
      },
      hasteData
    );
    if (crn) body.__crn = crn;

    var headers = {
      Accept: "*/*",
      Dpr: "3",
      "Sec-Ch-Dpr": "3",
      "Viewport-Width": "3840",
      "Sec-Ch-Viewport-Width": "3840",
      "X-IG-App-ID": getAppId(),
      "X-CSRFToken": getCookie("csrftoken"),
      "X-Fb-Friendly-Name": friendlyName,
      "X-Fb-Lsd": lsd || "",
      "X-Asbd-ID": "359341",
    };
    if (bloks) headers["X-Bloks-Version-ID"] = bloks;
    if (rootName) headers["X-Root-Field-Name"] = rootName;

    var formData = new FormData();
    Object.keys(body).forEach(function (key) {
      formData.append(key, body[key]);
    });

    return { url: new URL("/graphql/query", location.origin).href, body: formData, headers: headers };
  }

  function graphQLRequest(docId, variables, friendlyName, crn, rootName) {
    var api = buildGraphQLData(docId, variables, friendlyName, crn, rootName);
    return request(api.url, {
      method: "POST",
      data: api.body,
      headers: api.headers,
      retries: 0,
      timeout: 15000,
    });
  }

  function androidHeaders() {
    return {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; Pixel 7 XL)Build/RP1A.20845.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.0.0 Mobile Safari/537.36 Instagram 307.0.0.34.111 Android (30/11; 480dpi; 1080x2340; google; Pixel 7 XL; panther; qcom; en_US; 439103586)",
      "X-IG-App-ID": getAppId(),
    };
  }

  function request(url, opts) {
    opts = opts || {};
    var headers = Object.assign({ Accept: "application/json" }, opts.headers || {});
    var attempts = (opts.retries != null ? opts.retries : 1) + 1;
    var timeout = opts.timeout || 15000;
    return new Promise(function (resolve, reject) {
      function attempt(n) {
        GM_xmlhttpRequest({
          method: opts.method || "GET",
          url: url,
          headers: headers,
          data: opts.data || null,
          timeout: timeout,
          onload: function (res) {
            var obj = null;
            try {
              obj = JSON.parse(res.response);
            } catch (e) {
              if (n < attempts) return attempt(n + 1);
              return reject(new Error("Invalid JSON response from API"));
            }
            resolve(obj);
          },
          onerror: function () {
            if (n < attempts) return attempt(n + 1);
            reject(new Error("Network error contacting Instagram"));
          },
          ontimeout: function () {
            if (n < attempts) return attempt(n + 1);
            reject(new Error("API request timed out"));
          },
        });
      }
      attempt(0);
    });
  }

  function getUserIdViaSearch(username) {
    return request("https://www.instagram.com/web/search/topsearch/?query=" + encodeURIComponent(username), {
      retries: 0,
      timeout: 12000,
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

  function getUserIdWithAgent(username) {
    return request("https://i.instagram.com/api/v1/users/web_profile_info/?username=" + encodeURIComponent(username), {
      headers: { "X-IG-App-ID": getAppId() },
      retries: 1,
      timeout: 10000,
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
      if (!user.username) user.username = username;
      if (!user.pk && user.id) user.pk = user.id;
      if (!user.id && user.pk) user.id = user.pk;
      user._hdUrl = hdUrl || user.profile_pic_url_hd || null;
      return { user: user };
    });
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    if (typeof AbortController === "undefined") return fetch(url, options);
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs);
    return fetch(url, Object.assign({}, options, { signal: controller.signal })).finally(function () {
      clearTimeout(timer);
    });
  }

  function getUserIdViaProfileHtml(username) {
    var normalized = String(username || "").replace(/^@+/, "").trim().toLowerCase();
    if (!normalized) return Promise.reject(new Error("No username provided"));
    var profileUrl = new URL("/" + encodeURIComponent(normalized) + "/", "https://www.instagram.com").href;
    return fetchWithTimeout(profileUrl, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "text/html" },
    }, 10000)
      .then(function (response) {
        if (!response.ok) throw new Error("Profile HTML failed with HTTP " + response.status);
        return response.text().then(function (html) {
          var finalUrl = new URL(response.url || profileUrl);
          var finalUsername = finalUrl.pathname.split("/").filter(Boolean)[0] || "";
          if (!/(^|\.)instagram\.com$/i.test(finalUrl.hostname) || finalUsername.toLowerCase() !== normalized) {
            throw new Error("Profile HTML redirected away from the requested profile");
          }
          var patterns = [/"profile_id"\s*:\s*"?(\d+)"?/, /"(?:logging_page_id|page_id)"\s*:\s*"profilePage_(\d+)"/, /"profilePage_(\d+)"/];
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
              _hdUrl: (pic && pic.getAttribute("content")) || null,
            },
          };
        });
      });
  }

  function getUserIdFromPolarisSearch(username) {
    var normalized = String(username || "").replace(/^@+/, "").trim().toLowerCase();
    if (!normalized) return Promise.reject(new Error("No username provided"));
    return graphQLRequest(
      "27706427925724183",
      {
        data: {
          context: "blended",
          include_reel: "true",
          query: normalized,
          rank_token: "",
          search_surface: "web_top_search",
        },
        hasQuery: true,
      },
      "PolarisSearchBoxRefetchableQuery",
      "comet.igweb.PolarisExploreRoute",
      "xdt_api__v1__fbsearch__topsearch_connection"
    ).then(function (obj) {
      var users = obj && obj.data && obj.data.xdt_api__v1__fbsearch__topsearch_connection &&
        obj.data.xdt_api__v1__fbsearch__topsearch_connection.users;
      if (!Array.isArray(users) || !users.length) throw new Error("Polaris search returned no users");
      var result = users.find(function (item) {
        return item.user && (item.user.username || "").toLowerCase() === normalized;
      }) || users[0];
      if (!result || !result.user) throw new Error("Polaris search result has no user");
      var rawId = result.user.pk || result.user.id;
      if (!rawId) throw new Error("Polaris search result has no user ID");
      return {
        user: Object.assign({}, result.user, {
          id: String(rawId),
          pk: String(rawId),
          username: result.user.username || normalized,
        }),
      };
    });
  }

  function resolveUserIdLive(username) {
    return getUserIdViaProfileHtml(username).catch(function () {
      return getUserIdFromPolarisSearch(username);
    });
  }

  function getUserIdFromPersistentCache(username) {
    var id = state.GL_userIdCache[String(username || "").toLowerCase()];
    return id ? { user: { id: String(id), pk: String(id), username: username } } : null;
  }

  function putUserIdInCache(username, id) {
    if (!username || id == null) return false;
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
    if (!key) return Promise.reject(new Error("No username provided"));
    if (userIdCache.has(key)) return userIdCache.get(key);

    var persisted = getUserIdFromPersistentCache(key);
    if (persisted) {
      userIdCache.set(key, Promise.resolve(persisted));
      return userIdCache.get(key);
    }

    var p = resolveUserIdLive(key)
      .catch(function () {
        return getUserIdWithAgent(key);
      })
      .catch(function () {
        return getUserIdViaSearch(key);
      })
      .then(function (info) {
        var id = info && info.user && (info.user.pk || info.user.id);
        if (id) putUserIdInCache(key, id);
        return info;
      })
      .catch(function () {
        userIdCache.delete(key);
        throw new Error("Cannot resolve user ID for: " + key);
      });
    userIdCache.set(key, p);
    return p;
  }

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
        __relay_internal__pv__PolarisCommunityNoteStoriesLabelEnabledrelayprovider: true,
      },
      "PolarisStoriesV3ReelPageStandaloneQuery",
      "comet.igweb.PolarisProfilePostsTabRoute",
      "xdt_api__v1__feed__reels_media"
    )
      .then(function (obj) {
        normalizeReelPayload(obj, false);
        var reel = obj && obj.data && obj.data.reels_media && obj.data.reels_media[0];
        var owner = reel && (reel.owner || reel.user);
        if (expectedUsername && owner && owner.username &&
          owner.username.toLowerCase() !== expectedUsername.toLowerCase()) {
          if (_retried) throw new Error("Story owner mismatch");
          var key = expectedUsername.toLowerCase();
          delete state.GL_userIdCache[key];
          setPersistentCache(USER_ID_CACHE_KEY, state.GL_userIdCache);
          userIdCache.delete(key);
          return resolveUserIdLive(key).then(function (info) {
            var fresh = info && info.user && (info.user.pk || info.user.id);
            if (fresh && String(fresh) !== String(userId)) {
              return getStories(String(fresh), expectedUsername, true);
            }
            throw new Error("Story owner mismatch");
          });
        }
        return obj;
      });
  }

  function getHighlightStories(highlightId) {
    return graphQLRequest(
      "29299425373007309",
      {
        initial_reel_id: "highlight:" + highlightId,
        reel_ids: ["highlight:" + highlightId],
        first: 999,
        last: 0,
        __relay_internal__pv__PolarisCommunityNoteStoriesLabelEnabledrelayprovider: true,
      },
      "PolarisStoriesV3HighlightsPageQuery",
      "comet.igweb.PolarisProfilePostsTabRoute",
      "xdt_api__v1__feed__reels_media__connection"
    ).then(function (obj) {
      return normalizeReelPayload(obj, true);
    });
  }

  function getUserHighlights(userId) {
    return request("https://www.instagram.com/api/v1/highlights/" + encodeURIComponent(userId) + "/highlights_tray/", {
      headers: { "X-IG-App-ID": getAppId() },
      retries: 0,
      timeout: 12000,
    }).then(function (obj) {
      if (obj && obj.status === "ok" && Array.isArray(obj.tray)) return obj.tray;
      throw new Error("Highlights tray unavailable");
    });
  }

  function findDeepKey(obj, key, depth) {
    if (!obj || typeof obj !== "object" || depth > 8) return null;
    if (obj[key] !== undefined) return obj[key];
    for (var k in obj) {
      if (typeof obj[k] === "object") {
        var r = findDeepKey(obj[k], key, depth + 1);
        if (r) return r;
      }
    }
    return null;
  }

  function shortcodeToMediaId(code) {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    var id = 0n;
    for (var i = 0; i < code.length; i++) {
      id = id * 64n + BigInt(alphabet.indexOf(code[i]));
    }
    return id.toString();
  }

  function extractPostFromPageJson(postPath) {
    var scripts = document.querySelectorAll('script[type="application/json"]');
    for (var i = 0; i < scripts.length; i++) {
      var text = scripts[i].textContent || "";
      var item = null;
      try {
        var obj = JSON.parse(text);
        if (text.indexOf("xdt_api__v1__media__shortcode__web_info") > -1) {
          var info = findDeepKey(obj, "xdt_api__v1__media__shortcode__web_info", 0);
          if (info && info.items && info.items[0] && info.items[0].code === postPath) {
            item = info.items[0];
          }
        }
        if (!item && text.indexOf("xig_polaris_media") > -1) {
          var pol = findDeepKey(obj, "xig_polaris_media", 0);
          if (pol) {
            var gated = pol.if_not_gated_logged_out || pol.if_not_gated || pol.media;
            if (gated && (gated.code === postPath || gated.pk)) item = gated;
          }
        }
      } catch (e) {

      }
      if (item) {
        if (item.user && !item.owner) item.owner = item.user;
        return { type: "query_id", resource: item };
      }
    }
    return null;
  }

  function getPostPayload(shortcode) {
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
    var page = extractPostFromPageJson(shortcode);
    if (page) return Promise.resolve(cache(page));

    return graphQLRequest(
      "39422285384081769",
      {
        shortcode: shortcode,
        __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: true,
        __relay_internal__pv__PolarisThreadsStyleCommentsEnabledrelayprovider: false,
        __relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider: true,
      },
      "PolarisPostRootQuery",
      "comet.igweb.PolarisFeedRoute",
      "xdt_api__v1__media__shortcode__web_info"
    )
      .then(function (obj) {
        var items = obj && obj.data && obj.data.xdt_api__v1__media__shortcode__web_info &&
          obj.data.xdt_api__v1__media__shortcode__web_info.items;
        if (items && items[0]) {
          var item = items[0];
          if (item.user && !item.owner) item.owner = item.user;
          return cache({ type: "query_id", resource: item });
        }
        throw new Error("Post payload unavailable");
      })
      .catch(function () {
        var pk = shortcodeToMediaId(shortcode);
        return request("https://www.instagram.com/api/v1/media/" + encodeURIComponent(pk) + "/info/", {
          headers: { "X-IG-App-ID": getAppId() },
          retries: 0,
          timeout: 10000,
        }).then(function (obj) {
          if (obj && obj.status === "ok" && obj.items && obj.items[0]) {
            var item = obj.items[0];
            if (item.user && !item.owner) item.owner = item.user;
            return cache({ type: "query_id", resource: item });
          }
          var vars = encodeURIComponent(JSON.stringify({ shortcode: shortcode }));
          return request(
            "https://www.instagram.com/graphql/query/?query_hash=2c4c2e343a8f64c625ba02b2aa12c7f8&variables=" + vars,
            { headers: androidHeaders(), retries: 0, timeout: 10000 }
          ).then(function (obj3) {
            if (obj3 && obj3.data && obj3.data.shortcode_media) {
              return cache({ type: "query_hash", resource: obj3.data.shortcode_media });
            }
            throw new Error("Post payload unavailable");
          });
        });
      });
  }

  function getMediaInfo(mediaId) {
    return new Promise(function (resolve, reject) {
      if (mediaId == null || String(mediaId) === "") {
        reject(new Error("Invalid media id"));
        return;
      }
      var appId = getAppId();
      if (!appId) {
        reject(new Error("Invalid app id"));
        return;
      }
      var url = "https://i.instagram.com/api/v1/media/" + encodeURIComponent(String(mediaId)) + "/info/";
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        headers: { "User-Agent": navigator.userAgent, Accept: "*/*", "X-IG-App-ID": appId },
        timeout: 8000,
        onload: function (res) {
          var obj = null;
          try {
            obj = JSON.parse(res.response);
          } catch (e) {
            reject(new Error("Media API returned invalid data"));
            return;
          }
          var finalUrl = res.finalUrl || url;
          if (finalUrl === url) {
            resolve(obj);
            return;
          }
          try {
            var u = new URL(finalUrl);
            if (u.pathname.indexOf("/accounts/login") === 0) reject(new Error("Login required for Media API"));
            else reject(new Error("Media API redirected to " + u.host));
          } catch (e) {
            reject(new Error("Media API redirect"));
          }
        },
        onerror: function () {
          reject(new Error("Media API network error"));
        },
        ontimeout: function () {
          reject(new Error("Media API timed out"));
        },
      });
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
        __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: true,
      },
      "PolarisProfilePageContentQuery",
      "comet.igweb.PolarisExploreRoute",
      null
    ).then(function (obj) {
      var user = obj && obj.data && obj.data.user;
      if (expectedUsername && user && user.username &&
        user.username.toLowerCase() !== expectedUsername.toLowerCase()) {
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
    if (item.media_type != null) return item.media_type !== 1;
    return false;
  }

  function gmFetch(url, responseType) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        responseType: responseType,
        timeout: 60000,
        onload: function (res) {
          if (res.status < 200 || res.status >= 300) {
            reject(new Error("HTTP " + res.status));
            return;
          }
          var hdrs = String(res.responseHeaders || "").toLowerCase();
          if (/text\/html|application\/json/i.test(hdrs)) {
            reject(new Error("Server returned a web page instead of media"));
            return;
          }
          resolve(res.response);
        },
        onerror: function () {
          reject(new Error("Network error"));
        },
        ontimeout: function () {
          reject(new Error("Download timed out"));
        },
      });
    });
  }

  function fetchMediaBlob(url) {
    return gmFetch(url, "blob").then(function (blob) {
      return { blob: blob, isWeb: false };
    });
  }

  function fetchArrayBuffer(url) {
    updateLoadingBar(true);
    return gmFetch(url, "arraybuffer").finally(function () {
      updateLoadingBar(false);
    });
  }

  function saveFiles(downloadLink, metadata) {
    return new Promise(function (resolve) {
      updateLoadingBar(true);
      var uidPromise =
        metadata.uid == null && metadata.username && metadata.username !== "NONE"
          ? getUserId(metadata.username)
              .then(function (info) {
                return (info && info.user && (info.user.id || info.user.pk)) || null;
              })
              .catch(function () {
                return null;
              })
          : Promise.resolve(metadata.uid != null ? metadata.uid : null);
      var filetype = metadata.filetype || "jpg";
      var wantExif =
        USER_SETTING.MODIFY_RESOURCE_EXIF &&
        filetype === "jpg" &&
        metadata.shortcode &&
        metadata.sourceType === "photo";
      var wantCaption = USER_SETTING.DOWNLOAD_WITH_CAPTION && metadata.caption;
      if (
        USER_SETTING.USE_EXTERNAL_DOWNLOAD_MODE &&
        !wantExif &&
        !wantCaption &&
        typeof GM_download === "function"
      ) {
        try {
          GM_download({
            url: downloadLink,
            name: getSaveFileName(downloadLink, metadata),
            onload: function () {
              Stats.record(metadata.sourceType, 0);
              updateLoadingBar(false);
              resolve(true);
            },
            onerror: function () {
              updateLoadingBar(false);
              resolve(false);
            },
          });
        } catch (e) {
          updateLoadingBar(false);
          resolve(false);
        }
        return;
      }
      fetchMediaBlob(downloadLink)
        .then(function (r) {
          if (r.isWeb) throw new Error("Server returned a web page instead of media");
          return uidPromise.then(function (uid) {
            metadata.uid = uid;
            return r.blob;
          });
        })
        .then(function (blob) {
          return createSaveFileElement(downloadLink, blob, metadata);
        })
        .then(function () {
          updateLoadingBar(false);
          resolve(true);
        })
        .catch(function (err) {
          updateLoadingBar(false);
          logger("saveFiles failed:", err && err.message ? err.message : err);
          Toasts.error("Download failed: " + ((err && err.message) || "unknown error"));
          resolve(false);
        });
    });
  }

  function triggerDownload(blob, filename) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(blob);
      if (USER_SETTING.USE_EXTERNAL_DOWNLOAD_MODE && typeof GM_download === "function") {
        GM_download({
          url: url,
          name: filename,
          onload: function () {
            URL.revokeObjectURL(url);
            resolve();
          },
          onerror: function () {
            URL.revokeObjectURL(url);
            resolve();
          },
        });
        return;
      }
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      setTimeout(function () {
        try {
          document.body.removeChild(link);
        } catch (e) {

        }
        URL.revokeObjectURL(url);
        resolve();
      }, 300);
    });
  }

  function replaceSameOriginHost(url) {
    try {
      var urlObj = new URL(url);
      urlObj.host = "scontent.cdninstagram.com";
      return urlObj.href;
    } catch (e) {
      return url;
    }
  }

  function getSaveFileName(downloadLink, metadata) {
    var timestamp = normTs(metadata.timestamp);
    var index = metadata.index != null ? metadata.index : 0;
    var date = new Date(timestamp * 1000);
    var filetype = metadata.filetype || "jpg";

    if (USER_SETTING.MATCH_VIDEO_FILENAME_TO_THUMBNAIL && (filetype === "mp4" || filetype === "m4a") && metadata.thumbnailURL) {
      try {
        var thumbBase = new URL(metadata.thumbnailURL).pathname.split("/").pop().split(".").slice(0, -1).join(".");
        if (thumbBase) return sanitizeFilename((metadata.username || "instagram") + "_" + thumbBase) + "." + filetype;
      } catch (e) {

      }
    }

    var original_name = "";
    try {
      original_name = decodeURIComponent(
        String(new URL(downloadLink).pathname.split("/").filter(Boolean).pop() || "")
      );
    } catch (e) {

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
      UID: metadata.uid != null ? String(metadata.uid) : "",
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
    var filetype = metadata.filetype || "jpg";
    if (metadata.uid == null && metadata.username && metadata.username !== "NONE") {
      try {
        var userInfo = await getUserId(metadata.username);
        metadata.uid =
          (userInfo && userInfo.user && (userInfo.user.id || userInfo.user.pk)) || null;
      } catch (e) {
        metadata.uid = null;
      }
    }
    var downloadName = getSaveFileName(downloadLink, metadata);
    if (!metadata.skipMedia) {
      var wantExif =
        USER_SETTING.MODIFY_RESOURCE_EXIF &&
        filetype === "jpg" &&
        metadata.shortcode &&
        metadata.sourceType === "photo" &&
        (object.type === "image/jpeg" || object.type === "image/webp");
      if (wantExif) {
        try {
          var newBlob = await changeExifData(object, metadata);
          await triggerDownload(newBlob, downloadName);
        } catch (err) {
          logger("EXIF attach failed, saving original:", err && err.message ? err.message : err);
          await triggerDownload(object, downloadName);
        }
      } else {
        await triggerDownload(object, downloadName);
      }
      Stats.record(String(metadata.sourceType || "other"), (object && object.size) || 0);
    }
    if (USER_SETTING.DOWNLOAD_WITH_CAPTION && metadata.caption) {
      var captionName = getSaveFileName(
        downloadLink,
        Object.assign({}, metadata, { filetype: "txt" })
      );
      await triggerDownload(
        new Blob([metadata.caption], { type: "text/plain;charset=utf-8" }),
        captionName
      );
      Stats.record("caption", 0);
    }
  }

  function concatBytes(a, b) {
    var c = new Uint8Array(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
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
    var dateBytes = enc(formatExifDate(metadata.timestamp) + "\0");
    var artistBytes = enc((metadata.username || "") + "\0");
    var exifIndex = metadata.index != null && metadata.index > 0 ? metadata.index : 1;
    var keywordBytes = encUtf16le(
      "https://www.instagram.com/p/" + (metadata.shortcode || "") + "/?img_index=" + exifIndex + "\0"
    );
    var xpCommentBytes = encUtf16le(
      "https://www.instagram.com/uid/" + (metadata.uid || "unknown") + "\0"
    );
    var tiffHeader = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    var ifd0 = concatBytes(
      u16le(4),
      concatBytes(
        concatBytes(
          concatBytes(
            makeIFDEntry(0x013b, 2, artistBytes.length, 80),
            makeIFDEntry(0x8769, 4, 1, 62)
          ),
          concatBytes(
            makeIFDEntry(0x9c9c, 1, xpCommentBytes.length, 80 + artistBytes.length + keywordBytes.length),
            makeIFDEntry(0x9c9e, 1, keywordBytes.length, 80 + artistBytes.length)
          )
        ),
        u32le(0)
      )
    );
    var exifIfd = concatBytes(
      u16le(1),
      concatBytes(
        makeIFDEntry(0x9003, 2, dateBytes.length, 80 + artistBytes.length + keywordBytes.length + xpCommentBytes.length),
        u32le(0)
      )
    );
    var body = concatBytes(tiffHeader, concatBytes(ifd0, exifIfd));
    var payload = concatBytes(enc("Exif\0\0"), body);
    return concatBytes(payload, concatBytes(concatBytes(concatBytes(artistBytes, keywordBytes), xpCommentBytes), dateBytes));
  }

  function changeExifData(blob, metadata) {
    return blob.arrayBuffer().then(function (buffer) {
      var buf = new Uint8Array(buffer);
      if (buf.length < 12) throw new Error("Not a JPEG or WEBP");
      var isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
      var isWebp =
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
      if (!isJpeg && !isWebp) throw new Error("Not a JPEG or WEBP");

      var data = buildExifPayload(metadata);

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
          if (m === 0xe1) {
            i += 2 + len;
            continue;
          }
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

      var chunks = [];
      var c = 12;
      var vp8xIndex = -1;
      while (c + 8 <= buf.length) {
        var tag = String.fromCharCode(buf[c], buf[c + 1], buf[c + 2], buf[c + 3]);
        var size = buf[c + 4] | (buf[c + 5] << 8) | (buf[c + 6] << 16) | (buf[c + 7] << 24);
        var end = c + 8 + size;
        if (end > buf.length) break;
        if (tag === "VP8X") vp8xIndex = chunks.length;
        if (tag !== "EXIF" && tag !== "XMP ") chunks.push(buf.subarray(c, end));
        c = end;
      }
      var padded = data.length % 2 === 1 ? concatBytes(data, new Uint8Array([0])) : data;
      var hdr = new Uint8Array(8);
      hdr.set(fourCC("EXIF"), 0);
      new DataView(hdr.buffer).setUint32(4, padded.length, true);
      var exifChunk = concatBytes(hdr, padded);
      if (vp8xIndex > -1) {
        var vp8x = chunks[vp8xIndex].slice();
        vp8x[8] |= 0x10;
        chunks[vp8xIndex] = vp8x;
        chunks.splice(vp8xIndex + 1, 0, exifChunk);
      } else {
        chunks.push(exifChunk);
      }
      var wTotal = 12;
      chunks.forEach(function (ch) {
        wTotal += ch.length;
      });
      var webp = new Uint8Array(wTotal);
      webp.set(new Uint8Array([0x52, 0x49, 0x46, 0x46]), 0);
      webp.set(u32le(wTotal - 8), 4);
      webp.set(new Uint8Array([0x57, 0x45, 0x42, 0x50]), 8);
      var wOff = 12;
      chunks.forEach(function (ch) {
        webp.set(ch, wOff);
        wOff += ch.length;
      });
      return new Blob([webp], { type: "image/webp" });
    });
  }

  function parseDashManifest(mpdXml) {
    try {
      if (!mpdXml || typeof mpdXml !== "string") return { video: null, audio: null };
      var xml = new DOMParser().parseFromString(mpdXml, "application/xml");
      if (xml.querySelector("parsererror")) return { video: null, audio: null };
      var reps = Array.prototype.slice.call(xml.querySelectorAll("Representation"));
      var cands = [];
      reps.forEach(function (rep) {
        var set = rep.closest("AdaptationSet");
        var mimeType = rep.getAttribute("mimeType") || (set && set.getAttribute("mimeType")) || "";
        var contentType = (set && set.getAttribute("contentType")) || "";
        var baseUrlEl = rep.querySelector("BaseURL");
        var url = baseUrlEl ? baseUrlEl.textContent : null;
        if (!url) {
          var st = rep.querySelector("SegmentTemplate");
          if (st && st.getAttribute("media")) {
            url = st
              .getAttribute("media")
              .replace(/\$RepresentationID\$/g, rep.getAttribute("id") || "")
              .replace(/\$Number\$/g, st.getAttribute("startNumber") || "0")
              .replace(/\$Bandwidth\$/g, rep.getAttribute("bandwidth") || "");
          }
        }
        if (!url) return;
        url = url.trim();
        if (!/^https?:\/\//i.test(url)) return;
        cands.push({
          id: rep.getAttribute("id") || "",
          url: url,
          mimeType: mimeType,
          contentType: contentType,
          codecs: rep.getAttribute("codecs") || (set && set.getAttribute("codecs")) || "",
          bandwidth: parseInt(rep.getAttribute("bandwidth") || "0", 10) || 0,
          width: parseInt(rep.getAttribute("width") || "0", 10) || 0,
          height: parseInt(rep.getAttribute("height") || "0", 10) || 0,
        });
      });
      var isVideo = function (c) {
        return (c.contentType || "").indexOf("video") > -1 || (c.mimeType || "").indexOf("video") === 0;
      };
      var isAudio = function (c) {
        return (c.contentType || "").indexOf("audio") > -1 || (c.mimeType || "").indexOf("audio") === 0;
      };
      var video =
        cands
          .filter(isVideo)
          .sort(function (a, b) {
            return b.height - a.height || b.bandwidth - a.bandwidth || b.width - a.width;
          })[0] || null;
      var audio =
        cands
          .filter(isAudio)
          .sort(function (a, b) {
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
      var vTrack = await videoInput.getPrimaryVideoTrack();
      if (!vTrack || !vTrack.codec) throw new Error("No video track found");
      var aTrack = await audioInput.getPrimaryAudioTrack();
      if (!aTrack || !aTrack.codec) throw new Error("No audio track found");
      var vSink = new MB.EncodedPacketSink(vTrack);
      var aSink = new MB.EncodedPacketSink(aTrack);
      var output = new MB.Output({
        format: new MB.Mp4OutputFormat({ fastStart: "in-memory" }),
        target: new MB.BufferTarget(),
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
      var vSentMeta = false;
      var aSentMeta = false;
      var minTs = Infinity;
      if (!vNext.done) minTs = Math.min(minTs, vNext.value.timestamp);
      if (!aNext.done) minTs = Math.min(minTs, aNext.value.timestamp);
      var tsShift = isFinite(minTs) && minTs < 0 ? -minTs : 0;
      function adjust(p) {
        if (!tsShift || typeof p.clone !== "function") return p;
        return p.clone({ timestamp: p.timestamp + tsShift });
      }
      while (!vNext.done || !aNext.done) {
        var takeVideo = vNext.done ? false : aNext.done ? true : vNext.value.timestamp <= aNext.value.timestamp;
        if (takeVideo) {
          await vSource.add(adjust(vNext.value), vSentMeta ? undefined : vMeta);
          vSentMeta = true;
          vNext = await vIter.next();
        } else {
          await aSource.add(adjust(aNext.value), aSentMeta ? undefined : aMeta);
          aSentMeta = true;
          aNext = await aIter.next();
        }
      }
      await output.finalize();
      var outBuf = output.target.buffer;
      if (outBuf instanceof ArrayBuffer) return outBuf;
      if (outBuf && outBuf.buffer) {
        return outBuf.buffer.slice(outBuf.byteOffset, outBuf.byteOffset + outBuf.byteLength);
      }
      throw new Error("Unexpected output buffer type");
    })();
  }

  async function downloadDashStreams(videoUrl, audioUrl, meta) {
    var buffers = await Promise.all([fetchArrayBuffer(videoUrl), fetchArrayBuffer(audioUrl)]);
    var mergedBuf = await muxDashVideoAudioToMp4(buffers[0], buffers[1]);
    var merged = new Blob([mergedBuf], { type: "video/mp4" });
    await createSaveFileElement(videoUrl, merged, meta);
  }

  async function tryDashDownload(mediaItem, meta, isPreview) {
    try {
      if (!USER_SETTING.PREFER_DASH_MANIFEST || !USER_SETTING.FORCE_RESOURCE_VIA_MEDIA) return false;
      if (!mediaItem || !mediaItem.video_dash_manifest) return false;
      var best = parseDashManifest(mediaItem.video_dash_manifest);
      var vUrl = best && best.video ? best.video.url : "";
      if (!vUrl) return false;
      var aUrl = best && best.audio ? best.audio.url : "";
      var progressiveUrl = mediaItem.video_versions && mediaItem.video_versions[0] && mediaItem.video_versions[0].url;
      var thumbnailURL =
        (mediaItem.image_versions2 && mediaItem.image_versions2.candidates && mediaItem.image_versions2.candidates[0] &&
          mediaItem.image_versions2.candidates[0].url) ||
        (mediaItem.display_resources && mediaItem.display_resources[0] && mediaItem.display_resources[0].src) ||
        mediaItem.display_url ||
        meta.thumbnailURL;
      var dashMeta = Object.assign({}, meta, { thumbnailURL: thumbnailURL });
      if (isPreview) {
        if (USER_SETTING.NEW_TAB_HIGHEST_VIDEO) {
          openNewTab(vUrl);
        } else {
          openNewTab(progressiveUrl || vUrl);
        }
        return true;
      }
      if (!aUrl) {
        await saveFiles(vUrl, Object.assign({}, dashMeta, { filetype: "mp4" }));
        return true;
      }
      await downloadDashStreams(vUrl, aUrl, dashMeta);
      return true;
    } catch (e) {
      logger("[DASH]", "mux failed, using single-file fallback:", e && e.message ? e.message : e);
      return false;
    }
  }

  async function downloadResource(item, meta, opts) {
    opts = opts || {};
    var dashCandidate = item.dash || state.GL_mediaDataCache[item.id] || null;
    if (dashCandidate && (!opts.preview || USER_SETTING.NEW_TAB_HIGHEST_VIDEO)) {
      var okDash = await tryDashDownload(dashCandidate, meta, !!opts.preview);
      if (okDash) return true;
    }
    if (!opts.preview && !item.isVideo && item.id && USER_SETTING.CAPTURE_IMAGE_VIA_MEDIA_CACHE) {
      var cached = getImageFromCache(item.id);
      if (cached) {
        var okCache = await saveFiles(
          cached,
          Object.assign({}, meta, {
            caption: item.caption || meta.caption,
            index: meta.index != null ? meta.index : 0,
            filetype: "jpg",
          })
        );
        if (okCache) return true;
      }
    }
    if (opts.preview) {
      if (!item.url) {
        Toasts.error("Cannot find download URL.");
        return false;
      }
      openNewTab(replaceSameOriginHost(item.url));
      return true;
    }
    if (!item.url) {
      Toasts.error("Cannot find download URL.");
      return false;
    }
    var finalMeta = Object.assign({}, meta, {
      caption: item.caption || meta.caption,
      index: meta.index != null ? meta.index : 0,
      filetype: item.ext || meta.filetype || (item.isVideo ? "mp4" : "jpg"),
      thumbnailURL: item.thumb || meta.thumbnailURL,
    });
    return await saveFiles(item.url, finalMeta);
  }

  async function batchDownload(items, meta) {
    var total = items.length;
    if (!total) return;
    var done = 0;
    Progress.set(0, total);
    for (var i = 0; i < total; i++) {
      try {
        var itemMeta = Object.assign({}, meta, { index: items[i]._igSourceIndex || i + 1 });
        if (items[i].takenAt && USER_SETTING.RENAME_PUBLISH_DATE) {
          itemMeta.timestamp = items[i].takenAt;
        }
        if ((meta.sourceType === "stories" || meta.sourceType === "highlights") && items[i].id) {
          itemMeta.shortcode = items[i].id;
        }
        await downloadResource(items[i], itemMeta, {});
      } catch (e) {
        logger("batch item failed:", e && e.message ? e.message : e);
      }
      done++;
      Progress.set(done, total);
      if (done < total) {
        await new Promise(function (r) {
          setTimeout(r, 350);
        });
      }
    }
    notify(NAME, "Downloaded " + done + " of " + total + " items.");
  }

  const INTERNAL_CSS = `
:root{
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
  :root{
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

.ignis-rd{position:absolute;z-index:12;width:36px;height:36px;border:none;border-radius:11px;background:rgba(16,16,20,.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.16);color:#fff;display:grid;place-items:center;cursor:pointer;transition:all .12s;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.ignis-rd:hover{background:rgba(255,255,255,.18);transform:scale(1.05)}
.ignis-rd svg{width:17px;height:17px}
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
`;

  GM_addStyle(INTERNAL_CSS);

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
    var root = $('<div class="ignis-modal">');
    var card = $('<div class="ignis-modal-card" role="dialog" aria-modal="true">');
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
        root.removeClass("ignis-modal-in");
        setTimeout(function () {
          root.remove();
        }, 220);
        var i = ModalStack.modals.indexOf(api);
        if (i > -1) ModalStack.modals.splice(i, 1);
        $(document).off("keydown.igmodal", onKey);
      },
    };
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (ModalStack.modals[ModalStack.modals.length - 1] !== api) return;
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
          top: Math.min(maxY, Math.max(8, oy + ev.clientY - sy)) + "px",
        });
      }
      function onUp() {
        $(document).off("mousemove.igdrag", onMove);
        $(document).off("mouseup.igdrag", onUp);
        card.css("transition", "");
      }
      $(document).on("mousemove.igdrag", onMove);
      $(document).on("mouseup.igdrag", onUp);
    });
    root.on("mousedown", function (e) {
      if (e.target === root[0]) api.close();
    });
    setTimeout(function () {
      root.addClass("ignis-modal-in");
    }, 10);
    return ModalStack.push(api);
  }

  function buildPostItems(payload, postPath) {
    var res = normalizePostResource(payload.resource);
    res.items.forEach(function (it) {
      if (it.dash) state.GL_mediaDataCache[it.id] = it.dash;
    });
    return {
      items: res.items,
      meta: {
        username: res.username || "NONE",
        shortcode: res.shortcode || postPath,
        sourceType: "post",
        timestamp: res.takenAt || Math.floor(Date.now() / 1000),
        caption: res.caption || null,
      },
      fromDom: false,
    };
  }

  function extractPostFromDom(postPath, ctx) {
    var $post = null;
    if (ctx && ctx.post) {
      $post = $(ctx.post);
    } else if (ctx && ctx.anchor) {
      var a = ctx.anchor;
      var img = a.querySelector("img");
      if (img) {
        var srcset = parseSrcset(img.getAttribute("srcset") || "");
        var url = (srcset.length ? srcset[srcset.length - 1].url : null) || img.getAttribute("src") || "";
        if (url) {
          return {
            items: [
              {
                id: decodeMediaIdFromUrl(url),
                isVideo: false,
                url: url,
                thumb: url,
                width: 0,
                height: 0,
                caption: null,
                dash: null,
                ext: /\.webp(\?|$)/i.test(url) ? "webp" : "jpg",
              },
            ],
            meta: {
              username: "NONE",
              shortcode: postPath,
              sourceType: "post",
              timestamp: Math.floor(Date.now() / 1000),
              caption: null,
            },
            fromDom: true,
          };
        }
      }
      return null;
    } else {
      $post = $('[data-snig="canDownload"]')
        .filter(function () {
          return $(this).find('a[href*="/' + postPath + '/"]').length > 0;
        })
        .first();
    }
    if (!$post || !$post.length) return null;
    if ($post.find("video[src^='blob:']").length) return null;
    var items = [];
    var seen = new Set();
    var username = $post.attr("data-username") || getPostUsername($post) || "NONE";
    $post.find("img[src]").each(function () {
      var r = this.getBoundingClientRect();
      if (r.width < 150 || r.height < 150) return;
      var $img = $(this);
      var srcset = parseSrcset($img.attr("srcset") || "");
      var url = (srcset.length ? srcset[srcset.length - 1].url : null) || $img.attr("src") || "";
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({
        id: decodeMediaIdFromUrl(url),
        isVideo: false,
        url: url,
        thumb: url,
        width: Math.round(r.width),
        height: Math.round(r.height),
        caption: null,
        dash: null,
        ext: /\.webp(\?|$)/i.test(url) ? "webp" : "jpg",
      });
    });
    var $v = $post.find("video").first();
    if ($v.length) {
      var vUrl = $v.attr("src") || "";
      if (/^https?:/i.test(vUrl)) {
        items.push({
          id: decodeMediaIdFromUrl(vUrl),
          isVideo: true,
          url: vUrl,
          thumb: null,
          width: 0,
          height: 0,
          caption: null,
          dash: null,
          ext: "mp4",
        });
      }
    }
    if (!items.length) return null;
    var ts = Math.floor(Date.now() / 1000);
    var $t = $post.find("time[datetime]").first();
    if ($t.length) {
      var d = new Date($t.attr("datetime")).getTime() / 1000;
      if (isFinite(d) && d > 0) ts = Math.floor(d);
    }
    return {
      items: items,
      meta: { username: username, shortcode: postPath, sourceType: "post", timestamp: ts, caption: null },
      fromDom: true,
    };
  }

  async function loadPostItems(postPath, ctx) {
    var instant = extractPostFromDom(postPath, ctx);
    if (instant) return instant;
    var payload = await getPostPayload(postPath);
    return buildPostItems(payload, postPath);
  }

  function renderItems(body, items, meta) {
    body.empty();
    if (!items.length) {
      body.append('<div class="ignis-empty">No downloadable media found.</div>');
      return;
    }
    var grid = $('<div class="ignis-grid">');
    items.forEach(function (item, i) {
      item._igSourceIndex = i + 1;
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
      var cap = item.caption
        ? '<div class="ignis-cap">' + esc(item.caption.slice(0, 180)) + "</div>"
        : "";
      var actions = $('<div class="ignis-actions">');
      actions.append(
        '<button class="ignis-act ig-act-dl" title="Download" aria-label="Download">' + SVG.DOWNLOAD + "</button>",
        '<button class="ignis-act ig-act-nt" title="Open in new tab" aria-label="Open in new tab">' + SVG.NEW_TAB + "</button>"
      );
      if (item.thumb && item.isVideo) {
        actions.append(
          '<button class="ignis-act ig-act-th" title="Download thumbnail" aria-label="Download thumbnail">' + SVG.THUMBNAIL + "</button>"
        );
      }
      if (item.caption) {
        actions.append(
          '<button class="ignis-act ig-act-cap" title="Download caption (.txt)" aria-label="Download caption">' + SVG.TEXT + "</button>"
        );
      }
      row.append(input, media, $('<div class="ignis-card-body">').append(type, cap), actions);
      grid.append(row);
    });
    body.append(grid);
    body.off(".igitem").on("click.igitem", ".ignis-item", function (e) {
      if ($(e.target).closest(".ignis-checkmark").length) {
        var cb = $(this).find('input[type="checkbox"]')[0];
        if (cb) {
          cb.checked = !cb.checked;
          $(this).toggleClass("is-selected", cb.checked);
          $(e.target).closest(".ignis-checkmark").attr("aria-checked", cb.checked ? "true" : "false");
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
        sourceType: item.isVideo ? "video" : "photo",
        index: item._igSourceIndex || idx + 1,
      });
      if (act.classList.contains("ig-act-dl")) {
        downloadResource(item, photoMeta, {});
      } else if (act.classList.contains("ig-act-nt")) {
        downloadResource(item, photoMeta, { preview: true });
      } else if (act.classList.contains("ig-act-th") && item.thumb) {
        saveFiles(item.thumb, Object.assign({}, meta, { sourceType: "thumbnail", filetype: "jpg" }));
      } else if (act.classList.contains("ig-act-cap") && item.caption) {
        var capMeta = Object.assign({}, photoMeta, { caption: item.caption, filetype: "txt" });
        triggerDownload(
          new Blob([item.caption], { type: "text/plain;charset=utf-8" }),
          getSaveFileName(item.url, capMeta)
        );
        Stats.record("caption", 0);
      }
    }).on("keydown.igitem", ".ignis-checkmark", function (e) {
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
    var dlSel = $(
      '<button class="ignis-btn ignis-btn-pri" disabled>' + SVG.DOWNLOAD + " Download Selected</button>"
    );
    var dlAll = $(
      '<button class="ignis-btn ignis-btn-sec">' + SVG.DOWNLOAD_ALL + " Download All</button>"
    );

    function refresh() {
      var checks = modal.body.find('.ignis-item input[type="checkbox"]');
      var total = checks.length;
      var selected = checks.filter(":checked").length;
      selectAll.find("input").prop("checked", total > 0 && selected === total);
      selectAll.find("input").prop("indeterminate", selected > 0 && selected < total);
      countBadge.text(total ? selected + "/" + total : "");
      dlSel.prop("disabled", selected === 0);
      modal.body.find(".ignis-item").each(function () {
        var checked = !!$(this).find('input[type="checkbox"]').prop("checked");
        $(this).toggleClass("is-selected", checked);
        $(this).find(".ignis-checkmark").attr("aria-checked", checked ? "true" : "false");
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
    var modal = createModal({ title: "Download post", sub: postPath });
    modal.body.append('<div class="ignis-load"><i></i>Loading media…</div>');
    var loaded;
    try {
      loaded = await loadPostItems(postPath, ctx);
    } catch (e) {
      modal.body.empty().append(
        '<div class="ignis-empty">Could not load this post: ' + esc((e && e.message) || "network error") + "</div>"
      );
      return null;
    }
    if (!modal.el.is(":visible")) return loaded;
    var current = { items: loaded.items, meta: loaded.meta };
    function updateHead() {
      var user = current.meta && current.meta.username && current.meta.username !== "NONE" ? "@" + current.meta.username + " · " : "";
      modal.title.find(".ignis-sub").text(user + current.items.length + " item" + (current.items.length === 1 ? "" : "s"));
    }
    renderItems(modal.body, current.items, current.meta);
    updateHead();
    var selection = attachSelectionFooter(
      modal,
      function () {
        return current.items;
      },
      function () {
        return current.meta;
      }
    );
    if (loaded.fromDom) {
      getPostPayload(postPath)
        .then(function (payload) {
          var rich = buildPostItems(payload, postPath);
          if (rich.items.length && modal.el.is(":visible")) {
            current.items = rich.items;
            current.meta = rich.meta;
            renderItems(modal.body, current.items, current.meta);
            updateHead();
            selection.refresh();
          }
        })
        .catch(function () {});
    }
    return loaded;
  }

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

  function showSetting(tab) {
    if (tab) state._igTab = tab;
    if (!CAT_MAP[state._igTab] && state._igTab !== "about") state._igTab = "download";
    while (ModalStack.modals.length) ModalStack.pop();
    $(".ignis-modal").remove();
    var modal = createModal({ title: NAME + " Settings", sub: "v" + VERSION });
    modal.el.addClass("ignis-modal-wide");
    var tabs = $('<div class="ignis-tabs">');
    var search = $('<input class="ignis-search" type="search" placeholder="Search settings…">');
    var list = $("<div>");
    var hero = $(
      '<div class="ignis-hero"><div class="ignis-hero-mark">' + SVG.SPARK + "</div>" +
        "<div><h3>" + esc(NAME) + "</h3><p>Instagram media downloader · v" + esc(VERSION) + "</p></div></div>"
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
        ["debug", "Debug Window", "debugHotkeyKeyCode"],
      ];
      keys.forEach(function (k) {
        var code = state[k[2]];
        var row = $('<div class="ignis-keyrow" data-hotkey="' + k[2] + '">');
        row.append(
          '<span class="ignis-kbd"><kbd>' + esc(getPlatformModifierKey()) + "</kbd>+<kbd>" + esc(keyName(code)) + "</kbd></span>",
          $('<div class="ignis-row-txt"><div class="ignis-row-lb">' + esc(k[1]) + "</div></div>"),
          $('<button type="button">Rebind</button>')
        );
        row.on("click", function () {
          container.data("cap", k[2]);
          row.find("button").text("Press a key…");
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
      other: "Other",
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
        ["Last download", s.lastAt ? new Date(s.lastAt).toLocaleDateString() : "—"],
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
      list.empty();
      if (state._igTab === "about") {
        list.append(
          '<div class="ignis-about">' +
            "<b>" + NAME + " v" + VERSION + "</b> downloads media from Instagram pages: posts, carousels, reels, stories, highlights, HD avatars and captions." +
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
        renderHotkeyEditor(list);
        return;
      }
      if (state._igTab === "stats") {
        list.append(buildStatsPanel(function () {
          buildList(filter);
        }));
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
          var disabled = parent ? !USER_SETTING[parent] : false;
          var row = $(
            '<div class="ignis-row ignis-row-wrap' + (disabled ? " ignis-row-dis" : "") + '" data-set="' + k + '">'
          );
          var sw = $(
            '<label class="ignis-sw"><input type="checkbox" aria-label="' + esc(LABEL[k]) + '" ' +
              (USER_SETTING[k] ? "checked" : "") +
              (disabled ? "disabled" : "") +
              "><i></i></label>"
          );
          row.append(
            $('<div class="ignis-row-txt">')
              .append(
                '<div class="ignis-row-lb">' + esc(LABEL[k]) + "</div>",
                '<div class="ignis-row-ds">' + esc(DESC[k]) + "</div>"
              ),
            sw
          );
          if (k === "AUTO_RENAME") {
            row.find(".ignis-row-txt").css("cursor", "pointer").on("click", openRenameEditor);
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
      state[cap] = code;
      Store.set("G_HOTKEY_" + cap.replace("HotkeyKeyCode", "").toUpperCase() + "_KEYCODE", code);
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
      e.preventDefault();
      var $row = $(this);
      var k = $row.attr("data-set");
      if (k !== "AUTO_RENAME") return;
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

  function showDebugDOM() {
    var modal = createModal({ title: "Debug Window", sub: NAME + " v" + VERSION });
    var ta = $(
      '<textarea spellcheck="false" style="width:100%;height:240px;box-sizing:border-box;border:1px solid var(--ig-line);border-radius:10px;background:var(--ig-surface-2);color:var(--ig-text);font:11px ui-monospace,Menlo,monospace;padding:10px;resize:vertical"></textarea>'
    );
    modal.body.append(ta);
    modal.foot.append(
      $('<button class="ignis-btn ignis-btn-sec">Copy</button>').on("click", function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ta.val()).then(function () {
            Toasts.success("Copied to clipboard.");
          });
        } else {
          ta.trigger("select");
          document.execCommand("copy");
        }
      }),
      $('<button class="ignis-btn ignis-btn-sec">Download</button>').on("click", function () {
        var blob = new Blob([ta.val()], { type: "text/plain;charset=utf-8" });
        triggerDownload(blob, "ignis-debug-" + Date.now() + ".txt");
      })
    );
    var lines = [];
    lines.push(NAME + " v" + VERSION + " — URL: " + location.href);
    lines.push("UA: " + navigator.userAgent);
    lines.push("");
    lines.push("— Log —");
    state.GL_logger.slice(-500).forEach(function (entry) {
      lines.push("[" + new Date(entry.time).toISOString() + "] " + entry.content.map(String).join(" "));
    });
    ta.val(lines.join("\n"));
  }

  function showFeedbackDOM() {
    var modal = createModal({ title: "About", sub: NAME + " v" + VERSION });
    modal.body.append(
      '<div class="ignis-about">' +
        NAME +
        " is an independent, self-contained userscript. It sends no data anywhere and is not affiliated with any other project or maintainer.</div>"
    );
  }

  function tagCarouselSlides($ul) {
    if (!$ul || !$ul.length) return;
    var $slides = $ul.children("li").filter(function () {
      var w = this.getBoundingClientRect().width;
      return w > 64 && ($(this).find("img, video").length > 0 || $(this).attr("class"));
    });
    if (!$slides.length) return;

    var slideWidth = 0;
    $slides.each(function () {
      var w = this.getBoundingClientRect().width;
      if (w > 64 && !slideWidth) slideWidth = w;
    });
    if (!slideWidth) {
      $slides.each(function () {
        var m = ($(this).children("div").first().attr("style") || "").match(/width:\s*(\d+(?:\.\d+)?)px/);
        if (m && !slideWidth) slideWidth = parseFloat(m[1]);
      });
    }
    if (!slideWidth) {
      var viewport = $ul.parent()[0];
      slideWidth = viewport ? viewport.getBoundingClientRect().width : 0;
    }

    $slides.each(function () {
      var li = this;
      var style = li.getAttribute("style") || "";
      if (style.indexOf("translateX") > -1 && slideWidth > 0) {
        var m = style.match(/translateX\(([^p]+)px\)/);
        if (m && m[1]) {
          var pos = Math.round(parseFloat(m[1]) / slideWidth) + 1;
          if (pos > 0) {
            li.setAttribute("igh-res-index", String(pos));
            return;
          }
        }
      }
      if (!li.hasAttribute("igh-res-index")) {
        var prev = li.previousElementSibling;
        var next = li.nextElementSibling;
        if (prev && prev.hasAttribute("igh-res-index")) {
          var prevPos = parseInt(prev.getAttribute("igh-res-index"), 10);
          if (!isNaN(prevPos) && prevPos > 0) li.setAttribute("igh-res-index", String(prevPos + 1));
        } else if (next && next.hasAttribute("igh-res-index")) {
          var nextPos = parseInt(next.getAttribute("igh-res-index"), 10);
          if (!isNaN(nextPos) && nextPos > 1) li.setAttribute("igh-res-index", String(nextPos - 1));
        }
      }
    });
  }

  function isActivePostRoute() {
    return /^\/(?:[^/]+\/)?(?:p|reel)\//.test(location.pathname);
  }

  function getVisibleNodeIndex($main) {
    if (!$main || !$main.length) return 0;

    if (isActivePostRoute()) {
      try {
        var imgIndex = new URLSearchParams(window.location.search).get("img_index");
        if (imgIndex) {
          var parsedUrlIndex = parseInt(imgIndex, 10);
          if (!isNaN(parsedUrlIndex) && parsedUrlIndex >= 1) return parsedUrlIndex - 1;
        }
      } catch (e) {

      }
    }

    var $ul = $main.find("ul[class]").filter(function () {
      return $(this).children("li").length > 0;
    }).first();
    if (!$ul.length) return 0;

    tagCarouselSlides($ul);

    var $slides = $ul.children("li").filter(function () {
      var w = this.getBoundingClientRect().width;
      return w > 64 && ($(this).find("img, video").length > 0 || $(this).attr("class"));
    });
    if ($slides.length <= 1) {
      if ($slides.length === 1) {
        var onlyPos = $slides.get(0).getAttribute("igh-res-index");
        var onlyParsed = onlyPos ? parseInt(onlyPos, 10) : NaN;
        if (!isNaN(onlyParsed) && onlyParsed >= 1) return onlyParsed - 1;
      }
      return 0;
    }

    var $viewport = $main.find(".button_wrapper").parent();
    if (!$viewport.length || $viewport.get(0).getBoundingClientRect().width === 0) {
      $viewport = $main
        .find('*:not([data-pagelet])>*:not([role]):not([data-pagelet])>*:not([style])>*>*[role="presentation"]>*>ul[class]')
        .parent()
        .parent("[role]");
    }
    if (!$viewport.length || $viewport.get(0).getBoundingClientRect().width === 0) $viewport = $ul.parent().parent();
    if (!$viewport.length || $viewport.get(0).getBoundingClientRect().width === 0) $viewport = $ul.parent();

    if ($viewport.length) {
      var viewportRect = $viewport.get(0).getBoundingClientRect();
      var fallbackWidth = viewportRect.width;
      if (fallbackWidth > 0) {
        var viewportCenter = (viewportRect.left + viewportRect.right) / 2;
        var closestSlide = null;
        var minDistance = Infinity;
        $slides.each(function () {
          if (this.getBoundingClientRect().width === 0) return;
          var rect = this.getBoundingClientRect();
          var distance = Math.abs((rect.left + rect.right) / 2 - viewportCenter);
          if (distance < minDistance) {
            minDistance = distance;
            closestSlide = this;
          }
        });
        if (closestSlide) {
          var ighPos = closestSlide.getAttribute("igh-res-index");
          var parsedPos = ighPos ? parseInt(ighPos, 10) : NaN;
          if (!isNaN(parsedPos) && parsedPos >= 1) return parsedPos - 1;
          var style = closestSlide.getAttribute("style") || "";
          var offsetMatch = style.match(/translateX\(([^p]+)px\)/);
          if (offsetMatch && offsetMatch[1]) {
            var offset = parseFloat(offsetMatch[1]);
            var width = closestSlide.getBoundingClientRect().width || fallbackWidth;
            if (width > 0) {
              var offsetIndex = Math.round(offset / width);
              if (offsetIndex >= 0) return offsetIndex;
            }
          }
          return Math.max(0, $slides.index(closestSlide));
        }
      }
    }
    return 0;
  }

  let sharedIO = null;
  const ioCallbacks = new WeakMap();
  function getIO() {
    if (!sharedIO && typeof IntersectionObserver !== "undefined") {
      sharedIO = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
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

  function looksLikePost(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest(".ignis-bar, .ignis-sb, .ignis-rd, .ignis-modal, .ignis-gd")) return false;
    var isDiv = el.tagName === "DIV";
    var hasHeader = el.querySelector(":scope > header, :scope > div > header") != null;
    var hasLink = el.querySelector('a[href^="/p/"], a[href^="/reel/"]') != null;
    var hasMedia =
      el.querySelector("video, img[src*='cdninstagram'], img[src*='fbcdn.net']") != null;
    if (!hasLink && !hasHeader) return false;
    if (!hasMedia) return false;
    if (isDiv && el.closest("article")) return false;
    if (isDiv && !hasLink) return false;
    if (isDiv) {
      var r = el.getBoundingClientRect();
      if (
        r.width > 0 &&
        r.height > 0 &&
        r.width * r.height > window.innerWidth * window.innerHeight * 0.75
      ) {
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
    if ($post.attr("data-snig") || $post.hasClass("x1iyjqo2")) return;
    if ($post.parents("div#scrollview").length) return;
    if ($post.find(".ignis-bar, .ignis-rd").length) return;
    var $target = findMediaHost($post);
    if (!$target.length || $target.width() === 0) return;
    var username = getPostUsername($post) || "";
    $post.attr("data-snig", "canDownload").attr("data-username", username);
    $target.css("position", "relative");
    var bar = $('<div class="ignis-bar">');
    bar.append(
      makeButton(SVG.DOWNLOAD, "Download", "ignis-dl"),
      makeButton(SVG.NEW_TAB, "Open in new tab", "ignis-nt")
    );
    if ($post.find(resourceCountSelector).length > 1) {
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

    document.querySelectorAll('[data-snig="canDownload"]').forEach(function (el) {
      if (!el.querySelector(".ignis-bar")) el.removeAttribute("data-snig");
    });
    findPostElements().forEach(function (el) {
      var $a = $(el);
      if ($a.height() > 0 && $a.width() > 0) injectPostBar($a);
    });
    scanMediaContainers();
  }

  function scanGrids() {
    document
      .querySelectorAll('a[href^="/p/"], a[href^="/reel/"], a[href*="/p/"], a[href*="/reel/"]')
      .forEach(function (a) {
      try {
        if (a.dataset.igGrid) return;
        if (a.closest("article, header, nav, .ignis-bar, .ignis-modal, div[aria-busy][tabindex]")) return;
        var media = a.querySelector("img, video");
        if (!media) return;
        var r = media.getBoundingClientRect();
        if (r.width < 200 || r.height < 150) return;
        var href = a.getAttribute("href") || "";
        var hrefParts = href.split("/").filter(Boolean);
        var scIdx = hrefParts.indexOf("p");
        if (scIdx === -1) scIdx = hrefParts.indexOf("reel");
        if (scIdx === -1 || !hrefParts[scIdx + 1]) return;
        a.dataset.igGrid = "1";
        var btn = document.createElement("button");
        btn.className = "ignis-gd";
        btn.title = "Download this post";
        btn.setAttribute("aria-label", "Download this post");
        btn.innerHTML = SVG.DOWNLOAD;
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var parts = href.split("/").filter(Boolean);
          var idx = parts.indexOf("p");
          if (idx === -1) idx = parts.indexOf("reel");
          var sc = idx > -1 ? parts[idx + 1] : null;
          if (sc) openPostDialog(sc, { anchor: a });
        });
        if (getComputedStyle(a).position === "static") a.style.position = "relative";
        a.appendChild(btn);
      } catch (e) {

      }
    });
  }

  function getPostContextFromButton(target) {
    var $article = $(target).closest('[data-snig="canDownload"], article, div[data-snig]');
    if (!$article.length) return { $article: $(), postPath: null };
    var candidates = [];
    function pushHref(h) {
      if (h && h.trim()) candidates.push(h.trim());
    }
    pushHref($article.find('a[href^="/p/"]').first().attr("href"));
    pushHref($article.find('a[href^="/reel/"]').first().attr("href"));
    $article.find('a[role="link"][href], a[href]').each(function () {
      var h = $(this).attr("href") || "";
      if (h.indexOf("/p/") > -1 || h.indexOf("/reel/") > -1 || /^\/[^/]+\/(p|reel)\//i.test(h)) {
        pushHref(h);
        return false;
      }
    });
    var postPath = null;
    for (var i = 0; i < candidates.length && !postPath; i++) {
      var parts = candidates[i].split("/").filter(Boolean);
      var idx = parts.indexOf("p");
      if (idx === -1) idx = parts.indexOf("reel");
      if (idx > -1 && parts[idx + 1]) postPath = parts[idx + 1];
    }
    if (!postPath) {
      var pp = location.pathname.split("/").filter(Boolean);
      if (pp[0] === "p" || pp[0] === "reel") postPath = pp[1];
    }
    return { $article: $article, postPath: postPath };
  }

  async function resolvePostShortcode(shortcode, ctx) {
    try {
      return await loadPostItems(shortcode, ctx);
    } catch (e) {
      Toasts.error("Could not load post: " + ((e && e.message) || "network error"));
      return null;
    }
  }

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
    if (total < 2) return;
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
    $counter.text(current + "/" + total).attr("title", "Item " + current + " of " + total);
  }

  function resolveStoryMediaIdByTimestamp(payload) {
    var items = payload && payload.data && payload.data.reels_media && payload.data.reels_media[0] && payload.data.reels_media[0].items;
    if (!items || !items.length) return null;
    var $time = $('body > div section:visible time[datetime]')
      .filter(function () {
        return (
          $(this).is(":visible") &&
          $(this).parents('a[href^="/stories/highlights/"]').length === 0 &&
          $(this).parents('[role="button"]').length === 0
        );
      })
      .first();
    if (!$time.length) return null;
    var visibleTs = Math.floor(new Date($time.attr("datetime")).getTime() / 1000);
    if (!isFinite(visibleTs) || !visibleTs) return null;
    var bestId = null;
    var minDiff = Infinity;
    items.forEach(function (item) {
      var d = Math.abs((item.taken_at_timestamp || 0) - visibleTs);
      if (d < minDiff) {
        minDiff = d;
        bestId = item.pk || item.id;
      }
    });
    return bestId;
  }

  function urlStoryId() {
    var parts = location.pathname.split("/").filter(Boolean);
    for (var i = parts.length - 1; i >= 0; i--) {
      if (/^\d{5,}$/.test(parts[i])) return parts[i];
    }
    return null;
  }

  async function loadStoryPayload(username, type) {
    var cacheKey = type === "highlights" ? "highlights" : "stories";
    var cacheId = type === "highlights" ? location.pathname.split("/").filter(Boolean).pop() : username;
    if (state.GL_dataCache[cacheKey][cacheId]) return state.GL_dataCache[cacheKey][cacheId];
    var payload;
    if (type === "highlights") {
      payload = await getHighlightStories(cacheId);
    } else {
      var userInfo = await getUserId(username);
      var uid = (userInfo.user && (userInfo.user.pk || userInfo.user.id)) || null;
      if (!uid) throw new Error("Cannot resolve user id");
      payload = await getStories(uid);
    }
    state.GL_dataCache[cacheKey][cacheId] = payload;
    return payload;
  }

  async function resolveStoryTarget(payload, urlId) {
    var reel = payload && payload.data && payload.data.reels_media && payload.data.reels_media[0];
    if (!reel) return null;
    var items = normalizeReelItems(reel.items);
    if (!items.length) return null;
    var target = null;
    if (urlId) {
      items.forEach(function (it) {
        if (it.id === urlId) target = it;
      });
    }
    if (!target) {
      var byTs = resolveStoryMediaIdByTimestamp(payload);
      if (byTs) {
        items.forEach(function (it) {
          if (it.id === byTs) target = it;
        });
      }
    }
    if (!target) {
      var countA = $("body > div section._ac0a header._ac0k > ._ac3r ._ac3n ._ac3p[style]").length;
      var countB = $("body > div section:visible > div > div:not([class]) > div > div div.x1ned7t2.x78zum5 div.x1caxmr6").length;
      var countC = 0;
      var base = $("body > div div:not([hidden]) section:visible > div div[style]:not([class]) > div")[0];
      if (base) {
        countC = $(base).find("div div.x1ned7t2.x78zum5 div.x1caxmr6").length;
      }
      var nowIndex = countA || countB || countC;
      if (nowIndex > 0 && nowIndex <= items.length) {
        target = items[nowIndex - 1];
      }
    }
    if (!target) target = items[0];
    return { items: items, target: target };
  }

  function getStoryScopeUsername(type) {
    var username = type === "highlights" ? getHighlightsStoryUsername() : getStoryUsername();
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
    var hasVideo = $("body > div section:visible video[playsinline]").length > 0;
    if (!hasVideo && username) {
      var $img = $(
        "body > div section:visible img[referrerpolicy][class], body > div section:visible img._aa63"
      ).first();
      var srcset = parseSrcset($img.attr("srcset") || "");
      var url = (srcset.length ? srcset[srcset.length - 1].url : null) || $img.attr("src") || "";
      if (/^https?:/i.test(url)) {
        var imgMeta = {
          username: username,
          sourceType: type,
          timestamp: ts,
          shortcode: urlStoryId() || "",
          filetype: "jpg",
        };
        if (isPreview) openNewTab(replaceSameOriginHost(url));
        else await saveFiles(url, imgMeta);
        return;
      }
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
      Toasts.error("No stories found for this account.");
      return;
    }
    var item = t.target;
    var meta = {
      username: username,
      sourceType: type,
      timestamp: item.takenAt || ts,
      shortcode: item.id,
      caption: item.caption || null,
    };
    if (USER_SETTING.FORCE_RESOURCE_VIA_MEDIA && USER_SETTING.PREFER_DASH_MANIFEST && item.id) {
      try {
        var mi = await getMediaInfo(item.id);
        if (mi && mi.status === "ok" && mi.items && mi.items[0]) {
          var mediaItem = mi.items[0];
          var dashOk = await tryDashDownload(mediaItem, meta, isPreview);
          if (dashOk) return;
        }
      } catch (e) {
        if (!USER_SETTING.FALLBACK_TO_BLOB_FETCH_IF_MEDIA_API_THROTTLED) {
          Toasts.error("Media API failed: " + ((e && e.message) || "network error"));
        }
      }
    }
    if (isPreview) openNewTab(replaceSameOriginHost(item.url));
    else await saveFiles(item.url, Object.assign({}, meta, { filetype: item.ext || "mp4", thumbnailURL: item.thumb }));
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
        caption: null,
      };
      await batchDownload(items, meta);
      if (type === "stories" && USER_SETTING.DOWNLOAD_STORY_HIGHLIGHTS) {
        try {
          var userInfo = await getUserId(owner);
          var uid = (userInfo.user && (userInfo.user.pk || userInfo.user.id)) || null;
          if (uid) {
            var tray = await getUserHighlights(uid);
            for (var i = 0; i < tray.length; i++) {
              var hl = await getHighlightStories(tray[i].id);
              var hReel = hl.data && hl.data.reels_media && hl.data.reels_media[0];
              var hItems = normalizeReelItems(hReel ? hReel.items : []);
              if (hItems.length) {
                await batchDownload(hItems, {
                  username: resolveStoryOwner(hl, owner),
                  shortcode: (hReel && hReel.id) || "",
                  sourceType: "highlights",
                  timestamp: Math.floor(Date.now() / 1000),
                  caption: null,
                });
              }
            }
          }
        } catch (e) {
          logger("highlights batch failed:", e && e.message ? e.message : e);
        }
      }
    } catch (e) {
      Toasts.error("Could not load stories: " + ((e && e.message) || "network error"));
    }
  }

  function resolveRawStoryItem(payload) {
    var reel = payload && payload.data && payload.data.reels_media && payload.data.reels_media[0];
    var items = (reel && reel.items) || [];
    if (!items.length) return null;

    var urlId = urlStoryId();
    if (urlId) {
      for (var i = 0; i < items.length; i++) {
        var ids = [items[i].id, items[i].pk].filter(function (id) {
          return id != null;
        }).map(String);
        var baseIds = ids.map(function (id) {
          return id.split("_")[0];
        });
        if (ids.indexOf(String(urlId)) > -1 || baseIds.indexOf(String(urlId)) > -1) return items[i];
      }
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
    var countB = $("body > div section:visible > div > div:not([class]) > div > div div.x1ned7t2.x78zum5 div.x1caxmr6").length;
    var nowIndex = countA || countB;
    if (nowIndex > 0 && nowIndex <= items.length) return items[nowIndex - 1];
    return items[0];
  }

  function extractTaggedProfiles(item, excludeUsername) {
    var profiles = new Map();
    var stickers = item && Array.isArray(item.story_bloks_stickers) ? item.story_bloks_stickers : [];
    stickers.forEach(function (sticker) {
      var username = sticker && sticker.bloks_sticker && sticker.bloks_sticker.sticker_data &&
        sticker.bloks_sticker.sticker_data.ig_mention && sticker.bloks_sticker.sticker_data.ig_mention.username;
      if (typeof username !== "string" || !username) return;
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
      return $(this).children().length === 0 && this.textContent.trim() !== "";
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
      var isSharedHeader = $headers.filter(function () {
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
      if ((!$notNow || !$notNow.length) && $buttons.length === 2) $notNow = $buttons.last();
      if ($notNow && $notNow.length) $notNow.trigger("click");
    });
  }

  function maybeSkipSharedDialog() {
    if (!USER_SETTING.SKIP_SHARED_WITH_YOU_DIALOG || !window.location.search.includes("igsh")) return;
    var tries = 0;
    var timer = setInterval(function () {
      if (!window.location.search.includes("igsh") || ++tries > 20) {
        clearInterval(timer);
        return;
      }
      skipSharedWithYouDialog();
    }, 200);
  }

  function ensureStoryTools($host) {
    if (getComputedStyle($host[0]).position === "static") $host.css("position", "relative");
    var $bar = $host.children(".ignis-storytools").first();
    if (!$bar.length) {
      $bar = $('<div class="ignis-storytools">');
      $host.append($bar);
    }
    return $bar;
  }

  function attachStoryButtons() {
    var $element = findStoryContainer();
    if (!$element) return;
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
    if (!$element) return;
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
    var $host = $(".ignis-sd").first().closest(".ignis-storytools").parent();
    if ($host.find("video").length) attachStoryThumbnailButton();
  }

  function scanHighlightPage() {
    attachHighlightButtons();
    skipStoryConfirm();
    var $host = $(".ignis-hd").first().closest(".ignis-storytools").parent();
    if ($host.find("video").length) attachHighlightThumbnailButton();
  }

  function attachReelBar($main) {
    if (!$main || !$main.length || $main.find(".ignis-rd, .ignis-bar").length) return;
    $main.css("position", "relative");
    $main.append(
      makeButton(SVG.DOWNLOAD, "Download reel", "ignis-rd").css({ right: "40px", top: "15px" }),
      makeButton(SVG.NEW_TAB, "Open reel in new tab", "ignis-rn").css({ right: "40px", top: "51px" })
    );
  }

  function onReelsPage() {
    $("div[aria-busy][tabindex]").children("div").each(function () {
      var $c = $(this);
      if (
        $c.children().length &&
        $c.width() > window.innerWidth * 0.8 &&
        $c.height() > window.innerHeight * 0.8 &&
        $c.find("video").length
      ) {
        attachReelBar($c);
      }
    });
  }

  async function downloadCurrentReel(isPreview) {
    var path = location.pathname.split("/").filter(Boolean);
    var shortcode = null;
    if (path[0] === "reels" && path[1]) shortcode = path[1];
    if (!shortcode) {
      Toasts.error("Cannot resolve reel id.");
      return;
    }
    var loaded = await resolvePostShortcode(shortcode);
    if (!loaded) return;
    var meta = Object.assign({}, loaded.meta, { sourceType: "reels", caption: null });
    var item = loaded.items[0];
    if (!item) return;
    if (isPreview) openNewTab(replaceSameOriginHost(item.url));
    else await downloadResource(item, meta, {});
  }

  function attachAvatarButton() {
    if ($(".ignis-pd").length) return;
    var $img = $("header > *[class]:first-child > *[class]:first-child img[alt]").first();
    if (!$img.length) $img = $("header > *[class]:first-child img[alt]").first();
    if (!$img.length) return;
    var $mount = $img.is("[draggable]") ? $img.parent().parent() : $img.parent().parent().parent();
    if (!$mount.length) $mount = $img.parent().parent();
    if (!$mount.length) return;
    $mount.css("position", "relative");
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
      var userInfo = await getUserId(username);
      var uid = (userInfo.user && (userInfo.user.pk || userInfo.user.id)) || null;
      var url = null;
      if (USER_SETTING.DOWNLOAD_PROFILE_PIC_HD && uid) {
        try {
          url = await getUserHdAvatar(uid, username);
        } catch (e) {
          url = null;
        }
      }
      if (!url && USER_SETTING.DOWNLOAD_PROFILE_PIC_HD && userInfo.user && userInfo.user._hdUrl) {
        url = userInfo.user._hdUrl;
      }
      if (!url) {
        url = (userInfo.user && (userInfo.user.profile_pic_url || userInfo.user.profile_pic_url_hd)) ||
          $("header img[alt]").first().attr("src");
      }
      if (!url) {
        Toasts.error("Cannot find profile picture URL.");
        return;
      }
      await saveFiles(url, {
        username: username,
        sourceType: "avatar",
        timestamp: Math.floor(Date.now() / 1000),
        shortcode: username,
        filetype: "jpg",
        uid: uid,
      });
    } catch (e) {
      Toasts.error("Could not download profile picture: " + ((e && e.message) || "network error"));
    }
  }

  function storyTick() {

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

      if (state.firstStarted && (!state.pageLoaded || location.href !== state.currentURL)) {
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
    var mount = document.querySelector('div[id^="mount"]') || document.body;
    domObserverRoot = mount;
    domObserver = new MutationObserver(function (muts) {

      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) {
          scheduleScan();
          return;
        }
      }
    });
    domObserver.observe(mount, { childList: true, subtree: true });
  }

  function registerBodyHandlers() {
    if (state.bodyEventsRegistered) return;
    state.bodyEventsRegistered = true;

    $body.on("click.ignisEvents", ".ignis-dl", function () {
      var ctx = getPostContextFromButton(this);
      if (!ctx.postPath) {
        Toasts.error("Cannot find the post link.");
        return;
      }
      var postEl = ctx.$article[0] || null;
      if (USER_SETTING.DIRECT_DOWNLOAD_ALL) {
        resolvePostShortcode(ctx.postPath, { post: postEl }).then(function (loaded) {
          if (loaded) batchDownload(loaded.items, loaded.meta);
        });
        return;
      }
      if (USER_SETTING.DIRECT_DOWNLOAD_VISIBLE_RESOURCE) {
        var index = getVisibleNodeIndex(ctx.$article);
        resolvePostShortcode(ctx.postPath, { post: postEl }).then(function (loaded) {
          if (!loaded) return;
          var item = loaded.items[index] || loaded.items[0];
          if (item) downloadResource(item, loaded.meta, {});
        });
        return;
      }
      openPostDialog(ctx.postPath, { post: postEl });
    });

    $body.on("click.ignisEvents", ".ignis-da", function () {
      var ctx = getPostContextFromButton(this);
      if (!ctx.postPath) {
        Toasts.error("Cannot find the post link.");
        return;
      }
      resolvePostShortcode(ctx.postPath, { post: ctx.$article[0] || null }).then(function (loaded) {
        if (loaded) batchDownload(loaded.items, loaded.meta);
      });
    });

    $body.on("click.ignisEvents", ".ignis-nt", function () {
      var ctx = getPostContextFromButton(this);
      if (!ctx.postPath) {
        Toasts.error("Cannot find the post link.");
        return;
      }
      var index = getVisibleNodeIndex(ctx.$article);
      resolvePostShortcode(ctx.postPath, { post: ctx.$article[0] || null }).then(function (loaded) {
        if (!loaded) return;
        var item = loaded.items[index] || loaded.items[0];
        if (item) downloadResource(item, loaded.meta, { preview: true });
      });
    });

    $body.on("click.ignisEvents", ".ignis-th", function () {
      var ctx = getPostContextFromButton(this);
      if (!ctx.postPath) {
        Toasts.error("Cannot find the post link.");
        return;
      }
      var index = getVisibleNodeIndex(ctx.$article);
      resolvePostShortcode(ctx.postPath, { post: ctx.$article[0] || null }).then(function (loaded) {
        if (!loaded) return;
        var item = loaded.items[index] || loaded.items[0];
        if (item && item.thumb) {
          saveFiles(item.thumb, Object.assign({}, loaded.meta, { sourceType: "thumbnail", filetype: "jpg" }));
        }
      });
    });

    $body.on("click.ignisEvents", ".ignis-sd", function () {
      if (USER_SETTING.DIRECT_DOWNLOAD_STORY) downloadStoriesAll("stories");
      else downloadStoryCurrent("stories", false);
    });
    $body.on("click.ignisEvents", ".ignis-sn", function () {
      downloadStoryCurrent("stories", true);
    });
    $body.on("click.ignisEvents", ".ignis-sa", function () {
      downloadStoriesAll("stories");
    });
    $body.on("click.ignisEvents", ".ignis-st", function () {
      downloadStoryThumbnail("stories");
    });

    $body.on("click.ignisEvents", ".ignis-hd", function () {
      if (USER_SETTING.DIRECT_DOWNLOAD_STORY) downloadStoriesAll("highlights");
      else downloadStoryCurrent("highlights", false);
    });
    $body.on("click.ignisEvents", ".ignis-hn", function () {
      downloadStoryCurrent("highlights", true);
    });
    $body.on("click.ignisEvents", ".ignis-ha", function () {
      downloadStoriesAll("highlights");
    });
    $body.on("click.ignisEvents", ".ignis-ht", function () {
      downloadStoryThumbnail("highlights");
    });
    $body.on("click.ignisEvents", ".ignis-tp", function () {
      showTaggedProfiles("stories");
    });
    $body.on("click.ignisEvents", ".ignis-htp", function () {
      showTaggedProfiles("highlights");
    });
    $body.on("click.ignisEvents", ".ignis-sl", function () {
      openStoryBrowser("stories");
    });
    $body.on("click.ignisEvents", ".ignis-hl", function () {
      openStoryBrowser("highlights");
    });

    $body.on("click.ignisEvents", ".ignis-rd", function () {
      downloadCurrentReel(false);
    });
    $body.on("click.ignisEvents", ".ignis-rn", function () {
      downloadCurrentReel(true);
    });

    $body.on("click.ignisEvents", ".ignis-pd", function () {
      downloadAvatar();
    });
  }

  const Router = {
    enter: function () {
      state.firstStarted = true;
      state.currentURL = location.href;
      state.route = null;
      state.GL_storyConfirmSkipped = false;
      var path = location.pathname;
      var blacklist =
        /^\/(challenge\/?.*|qr\/?|accounts\/.*|emails\/.*|language\/?.*?|your_activity\/?.*|settings\/help(\/.*)?|auth_platform\/codeentry\/?.*|consent\/?.*)$/i;
      if (
        blacklist.test(path) ||
        ($("div#splash-screen").length > 0 && !$("div#splash-screen").is(":hidden"))
      ) {
        state.pageLoaded = false;
        return;
      }
      if (path === "/" || path.startsWith("/explore")) {
        state.route = "explore";
      } else if (path.startsWith("/p/") || path.startsWith("/reel/") || /^\/([^/]+)\/(p|reel)\//.test(path)) {
        state.route = "post";
      } else if (path.startsWith("/reels/")) {
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
      this.cleanup();
      maybeSkipSharedDialog();

      if (!domObserver || !domObserverRoot || !domObserverRoot.isConnected) {
        installDomObserver();
      }
      try {
        scanAll();
      } catch (e) {
        logger("router scan error:", e && e.message ? e.message : e);
      }
      if (state.route === "home" || state.route === "explore" || state.route === "post") {

        var follow = [400, 1000, 2500];
        var fi = 0;
        function followScan() {
          try {
            scanAll();
          } catch (e) {

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
      var now = Date.now();
      Object.keys(state.GL_payloadCache).forEach(function (k) {
        var c = state.GL_payloadCache[k];
        if (!c || now - c.ts > POST_CACHE_MAX_AGE) delete state.GL_payloadCache[k];
      });

      var dcCount =
        Object.keys(state.GL_dataCache.stories).length +
        Object.keys(state.GL_dataCache.highlights).length;
      if (dcCount > 30) {
        state.GL_dataCache.stories = {};
        state.GL_dataCache.highlights = {};
      }
      if (Object.keys(state.GL_mediaDataCache).length > 200) {
        state.GL_mediaDataCache = {};
      }
    },
    start: function () {

      var navTimer = null;
      __ignisOnNavigate = function () {
        if (navTimer) return;
        navTimer = setTimeout(function () {
          navTimer = null;
          if (location.href !== state.currentURL) Router.enter();
        }, 60);
      };
    },
  };

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
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(PERSISTENT_CACHE_STORE_NAME)) {
          db.createObjectStore(PERSISTENT_CACHE_STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = function () {
        var db = request.result;
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
        reject(request.error);
      };
      request.onblocked = function () {
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

  function mergeCacheEntries(stored, session) {
    var isPlainObject = function (value) {
      return !!value && typeof value === "object" && !Array.isArray(value);
    };
    if (!isPlainObject(stored)) return session;
    if (!isPlainObject(session)) return stored;
    return Object.assign({}, stored, session);
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
          var readStore = db.transaction(PERSISTENT_CACHE_STORE_NAME, "readonly").objectStore(PERSISTENT_CACHE_STORE_NAME);
          return Promise.all(
            keys.map(function (key) {
              return idbRequest(readStore.get(key));
            })
          ).then(function (records) {
            keys.forEach(function (key, i) {
              if (records[i] !== undefined) {
                stored[key] = records[i].value;
                return;
              }
              var legacyValue = GM_getValue(key);
              if (legacyValue !== undefined) {
                stored[key] = legacyValue;
                migrated.push(key);
              }
            });
            if (!migrated.length) return null;
            var transaction = db.transaction(PERSISTENT_CACHE_STORE_NAME, "readwrite");
            var writeStore = transaction.objectStore(PERSISTENT_CACHE_STORE_NAME);
            var now = Date.now();
            migrated.forEach(function (key) {
              writeStore.put({ id: key, value: stored[key], updatedAt: now });
            });
            return idbTransactionDone(transaction).then(function () {
              migrated.forEach(function (key) {
                GM_setValue(key, {});
              });
              logger("initPersistentCache()", "moved " + migrated.join(", ") + " from GM storage to IndexedDB");
            });
          });
        })
        .catch(function (err) {
          logger("initPersistentCache()", "IndexedDB unavailable, falling back to GM storage", err);
          persistentCacheStore.backend = "gm";
          stored = {};
          keys.forEach(function (key) {
            stored[key] = GM_getValue(key);
          });
        })
        .then(function () {
          if (!persistentCacheStore.backend) persistentCacheStore.backend = "indexeddb";
          keys.forEach(function (key) {
            var field = PERSISTENT_CACHE_BINDINGS[key];
            var session = state[field];
            var hasSessionEntries = !!session && Object.keys(session).length > 0;
            var merged = stored[key] === undefined ? session : mergeCacheEntries(stored[key], session);
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
    persistentCacheStore.flushChain = persistentCacheStore.flushChain.then(writePendingPersistentCache);
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
        batch.forEach(function (key) {
          GM_setValue(key, persistentCacheStore.values.get(key));
        });
      }
      return write
        .then(function () {
          return true;
        })
        .catch(function (err) {
          persistentCacheStore.db = null;
          batch.forEach(function (key) {
            persistentCacheStore.pending.add(key);
          });
          logger("flushPersistentCache()", "write failed, key(s) queued again", err);
          return false;
        });
    });
  }

  function purgeCache() {
    var now = Date.now();
    var changed = false;
    Object.keys(state.GL_imageCache).forEach(function (k) {
      var e = state.GL_imageCache[k];
      if (!e || !e.ts || now - e.ts > IMAGE_CACHE_MAX_AGE) {
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
    if (!mediaId || !url) return;
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
    return entry.url || null;
  }

  function registerPerformanceObserver() {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      var perfObs = new PerformanceObserver(function (list) {
        if (!USER_SETTING.CAPTURE_IMAGE_VIA_MEDIA_CACHE) return;
        list.getEntries().forEach(function (entry) {
          if (entry.initiatorType !== "img") return;
          var u = entry.name || "";
          if (!(u.indexOf("_e35") > -1 || u.indexOf("_e15") > -1 || u.indexOf(".webp?") > -1)) return;
          if (u.indexOf("_e35_s") > -1) return;
          if (/_[sp](\d+)x\1(?!\d)/.test(u)) return;
          var id = decodeMediaIdFromUrl(u);
          if (id && !mediaCache.has(id)) putInCache(id, u);
        });
      });
      perfObs.observe({ entryTypes: ["resource"] });
    } catch (e) {
      logger("PerformanceObserver unavailable:", e && e.message ? e.message : e);
    }
  }

  function quickDownloadFocusedPost() {
    var pa = document.querySelector('a[href^="/p/"]');
    if (!pa) {
      Toasts.info("No post link found on this page.");
      return;
    }
    var href = pa.getAttribute("href") || "";
    var shortcode = href.split("/p/")[1];
    if (!shortcode) return;
    shortcode = shortcode.split("/")[0].split("?")[0];
    var art = pa.closest('[data-snig="canDownload"]');
    resolvePostShortcode(shortcode, { post: art || null }).then(function (loaded) {
      if (!loaded) return;
      var index = 0;
      if (art) index = getVisibleNodeIndex($(art));
      var item = loaded.items[index] || loaded.items[0];
      if (item) {
        downloadResource(item, Object.assign({}, loaded.meta, { sourceType: item.isVideo ? "video" : "photo" }), {});
      }
    });
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
      [getPlatformModifierKey() + " + W", "Settings"],
      [getPlatformModifierKey() + " + S", "Download story"],
      [getPlatformModifierKey() + " + T", "Show tagged profiles"],
      [getPlatformModifierKey() + " + Z", "Debug window"],
      [getPlatformModifierKey() + " + R", "Reload " + NAME],
      [getPlatformModifierKey() + " + Q", "Close dialogs"],
    ];
    var wrap = $('<div class="ignis-ksh">');
    var card = $('<div class="ignis-ksh-card">');
    card.append(
      "<h3>" + NAME + " — Keyboard Shortcuts</h3><table>" +
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
    if (window.__igKS) return;
    window.__igKS = true;
    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
      var k = e.key;
      if (e.shiftKey && k === "?" && USER_SETTING.KEYBOARD_SHORTCUTS_HELP) {
        e.preventDefault();
        toggleShortcutsHelp();
        return;
      }
      if (k === "s" && !e.ctrlKey && !e.metaKey && USER_SETTING.KEYBOARD_DOWNLOAD_S) {
        e.preventDefault();
        quickDownloadFocusedPost();
      }
    });
  }

  function toggleCommandPalette() {
    var existing = document.querySelector(".ignis-palette");
    if (existing) {
      $(document).off("keydown.igpal");
      existing.remove();
      return;
    }
    var actions = [
      { label: "Open Settings", kw: "settings preferences options", fn: function () { showSetting(); } },
      { label: "Download Statistics", kw: "stats usage numbers", fn: function () { showSetting("stats"); } },
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
        },
      },
      { label: "Download All Stories", kw: "save story all batch", fn: function () { downloadStoriesAll("stories"); } },
      {
        label: "Show Tagged Profiles",
        kw: "story highlight mentions tagged profiles",
        fn: function () {
          if (state.route === "story") showTaggedProfiles("stories");
          else if (state.route === "highlights") showTaggedProfiles("highlights");
          else Toasts.info("Open a story or highlight first.");
        },
      },
      { label: "Keyboard Shortcuts", kw: "shortcuts help keys overlay", fn: toggleShortcutsHelp },
      { label: "Close Dialogs", kw: "close modals dismiss", fn: function () { ModalStack.closeTop(); } },
      { label: "Reload " + NAME, kw: "reload restart refresh", fn: reloadScript },
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
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        toggleCommandPalette();
      }
    });
  }

  function installAltHotkeys() {
    $(window).on("keydown.igAlt", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
      if (!e.altKey) return;
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
      } else if (code === 75) {
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
        else Toasts.info("Open a story first, then press " + getPlatformModifierKey() + "+S.");
      }
    });
  }

  function reloadScript() {
    clearInterval(state.GL_repeat);
    state.GL_repeat = null;
    clearTimeout(state.postPoll);
    state.postPoll = null;
    $body.off(".ignisEvents");
    state.bodyEventsRegistered = false;
    $(".ignis-bar, .ignis-storytools, .ignis-sb, .ignis-sb-pos, .ignis-pd, .ignis-ksh, .ignis-palette, .ignis-gd").remove();
    $(".ignis-modal").remove();
    $("[data-snig]").removeAttr("data-snig");
    state.pageLoaded = false;
    state.firstStarted = false;
    state.currentURL = location.href;
    if (domObserver) domObserver.disconnect();
    setTimeout(function () {
      Router.enter();
      installDomObserver();
      scanAll();
    }, 150);
    Toasts.info(NAME + " reloaded.");
  }

  function showAbout() {
    showSetting("about");
  }

  function registerMenuCommand() {
    state.registerMenuIds.forEach(function (id) {
      try {
        GM_unregisterMenuCommand(id);
      } catch (e) {

      }
    });
    state.registerMenuIds = [];
    function add(label, accessKey, fn) {
      try {
        var id = GM_registerMenuCommand(label, fn, accessKey);
        state.registerMenuIds.push(id);
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

  function ignisBoot() {
    $body = $("body");
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
