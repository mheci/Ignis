  /* ============================================================
     Ignis Forge — download engine
     ============================================================ */

  function gmFetch(raw, responseType) {
    const url = trustedURL(raw);
    if (!url) return Promise.reject(new Error("Unsupported media link"));
    if (!manager.xhr) return Promise.reject(new Error("This userscript manager cannot fetch media"));
    return new Promise((resolve, reject) => {
      let handle;
      const limit = 128 * 1024 * 1024;
      const opts = {
        method: "GET",
        url,
        responseType,
        anonymous: true,
        redirect: "error",
        timeout: 60000,
        onprogress(ev) {
          if (responseType === "arraybuffer" && Math.max(ev.total || 0, ev.loaded || 0) > limit) {
            reject(new Error("DASH track is too large for in-memory merging"));
            handle?.abort?.();
          }
        },
        onload(res) {
          if (res.status < 200 || res.status >= 300)
            return reject(
              Object.assign(new Error("Media returned HTTP " + res.status), {
                canTryAlternate: res.status === 404 || res.status === 410
              })
            );
          if (!trustedURL(res.finalUrl || url)) return reject(new Error("Unsupported media redirect"));
          const type =
            /^content-type:\s*([^;\r\n]+)/im.exec(res.responseHeaders || "")?.[1] || res.response?.type || "";
          if (
            type &&
            !/^(image\/(?:jpe?g|webp|avif|png|gif)|(?:video|audio)\/[\w.+-]+|application\/(?:octet-stream|mp4|binary))$/i.test(
              type.trim()
            )
          )
            return reject(new Error("Server did not return media"));
          if (!(res.response?.size > 0 || res.response?.byteLength > 0))
            return reject(new Error("Empty media response"));
          if (responseType === "arraybuffer" && res.response.byteLength > limit)
            return reject(new Error("DASH track is too large for in-memory merging"));
          resolve(res.response);
        },
        onerror: () => reject(Object.assign(new Error("Media request failed"), { canTryAlternate: true })),
        ontimeout: () => reject(Object.assign(new Error("Media request timed out"), { canTryAlternate: true })),
        onabort: () => reject(new Error("Media request cancelled"))
      };
      handle = manager.xhr(opts);
      // Promise-only managers need not call the legacy callbacks.
      if (handle?.then)
        handle.then((r) => {
          if (r) opts.onload(r);
        }, reject);
    });
  }
  function fetchArrayBuffer(url) {
    return gmFetch(url, "arraybuffer");
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
        merged = new Blob([await muxDashVideoAudioToMp4(v, a)], { type: "video/mp4" });
      } catch (e) {
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
