  /* ============================================================
     Ignis Lens — media detection & extraction
     ============================================================ */

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

  // Universal media-item normalizer. Handles every shape Instagram uses:
  // GraphQL (GraphImage/GraphVideo/GraphSidecar), Media-API items
  // (query_id / carousel_media), and story/highlight reel items.
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

  // Story / highlight reel normalizer (reels_media[0].items)
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

  /* ============================================================
     Ignis Fetch — API layer (timeouts, retries, safe parsing)
     ============================================================ */

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
        /* ignore payloads that are not valid JSON */
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

  // ─── User ID resolution ────────────────────────────────────────────────
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
        /* skip malformed script */
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
