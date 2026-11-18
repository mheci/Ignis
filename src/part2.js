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
