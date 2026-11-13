  /* ============================================================
     Ignis Pulse — page injection, download flows, router
     ============================================================ */

  // ─── Carousel visible-index detection ──────────────────────────────────
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
        /* ignore */
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

  // ─── Shared IntersectionObserver ───────────────────────────────────────
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

  // ─── Universal post/media detection ────────────────────────────────────
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
        /* never let one anchor break the scan */
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

  // ─── Story item resolution & tagged profiles ───────────────────────────
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

  // ─── Story controls ────────────────────────────────────────────────────
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

  // ─── Reels ─────────────────────────────────────────────────────────────
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

  // ─── Profile avatar ────────────────────────────────────────────────────
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
      // Only structural additions need a rescan; removal-only batches
      // (React teardowns) would otherwise wake the scanner for nothing.
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) {
          scheduleScan();
          return;
        }
      }
    });
    domObserver.observe(mount, { childList: true, subtree: true });
  }

  // ─── Delegated click handlers ──────────────────────────────────────────
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

  // ─── Router ────────────────────────────────────────────────────────────
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
      var now = Date.now();
      Object.keys(state.GL_payloadCache).forEach(function (k) {
        var c = state.GL_payloadCache[k];
        if (!c || now - c.ts > POST_CACHE_MAX_AGE) delete state.GL_payloadCache[k];
      });
      // Story/highlight payloads are re-fetchable; keep them for the session
      // (per-item swipes reuse them) but bound total retention.
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
      // Navigation is delivered by the document-start history hooks
      // (pushState/replaceState wrappers + popstate/hashchange). Coalesce
      // bursts (IG fires several mutations per route change) into one enter.
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
