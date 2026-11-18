const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { assemble } = require("../build");
const ROOT = path.resolve(__dirname, ".."),
  code = fs.readFileSync(path.join(ROOT, "ignis.user.js"), "utf8");
const names = [
  "trustedURL",
  "postCode",
  "normalizePostResource",
  "normalizeReelItems",
  "parseSrcset",
  "decodeMediaIdFromUrl",
  "matchesPost",
  "extractPostFromPageJson",
  "getSaveFileName",
  "buildExifPayload",
  "changeExifData",
  "request",
  "batchDownload",
  "state",
  "USER_SETTING",
  "mergeCacheEntries",
  "IMAGE_CACHE_KEY",
  "USER_ID_CACHE_KEY",
  "Stats",
  "resolveRawStoryItem",
];
function harness(extra = {}) {
  const responses = new Map();
  const $ = () => ({
    length: 0,
    filter() {
      return this;
    },
    first() {
      return this;
    },
  });
  const ctx = {
    jQuery: $,
    window: { addEventListener() {} },
    document: {
      querySelectorAll() {
        return [];
      },
    },
    location: new URL("https://www.instagram.com/p/Table/"),
    history: {},
    navigator: {},
    GM_getValue: (k, d) => responses.get(k) ?? d,
    GM_setValue: (k, v) => responses.set(k, v),
    console: { log() {} },
    URL,
    URLSearchParams,
    Date,
    Blob,
    Buffer,
    TextEncoder,
    atob,
    setTimeout,
    clearTimeout,
    ...extra,
  };
  // White-box tests substitute only the boot call. No debugging interface ships in the artifact.
  const anchor = '  if (document.readyState === "loading")';
  assert.equal(code.split(anchor).length, 2);
  vm.runInNewContext(
    code.slice(0, code.lastIndexOf(anchor)) + `globalThis.testAPI={${names.join(",")}};})();`,
    ctx,
  );
  return { api: ctx.testAPI, ctx, responses };
}
const img = "https://scontent.example.cdninstagram.com/a/s320x320/photo.webp?stp=s320x320&sig=abc";
test("committed build preserves literal module text and has one runtime version", () => {
  const a = assemble();
  assert.equal(a.code, code);
  assert.ok(code.includes(`const VERSION = "${a.version}"`));
  assert.equal((code.match(/^\/\/ @version /gm) || []).length, 1);
  assert.ok(!code.includes("__IGNIS_VERSION__"));
  assert.ok(code.includes(fs.readFileSync(path.join(ROOT, "src/part4.js"), "utf8")));
});
test("media/API destinations are distinct; accepted signed URLs are never rewritten", () => {
  const { api: a } = harness();
  assert.equal(a.trustedURL(img), img);
  assert.equal(a.trustedURL(img, false), null);
  for (const u of [
    "https://example.org/p.jpg",
    "http://www.instagram.com/a",
    "ftp://fbcdn.net/a",
    "https://cdninstagram.com.example.org/a",
    "https://user@cdninstagram.com/a",
    "https://cdninstagram.com:444/a",
  ])
    assert.equal(a.trustedURL(u), null);
});
test("permalinks select exact shortcodes and ignore query strings, foreign links and non-post paths", () => {
  const { api: a } = harness();
  for (const p of [
    "/p/Table/?s=1",
    "/user/reel/Table/",
    "/reels/Table/",
    "https://www.instagram.com/p/Table#test",
  ])
    assert.equal(a.postCode(p), "Table");
  for (const p of ["/accounts/login/", "https://example.org/p/Table/", undefined])
    assert.equal(a.postCode(p), null);
});
test("responsive lists and GraphQL dimensions preserve the chosen rendition, signed URL, caption and source index", () => {
  const { api: a } = harness();
  const small = "https://cdninstagram.com/small.jpg";
  const res = a.normalizePostResource({
    owner: { username: "studio", id: "11" },
    code: "AB",
    caption: { text: "study" },
    carousel_media: [
      null,
      {
        image_versions2: { candidates: [null, { width: 20, url: small }, { width: 80, height: 60, url: img }] },
      },
      {
        __typename: "GraphVideo",
        video_resources: [
          { config_width: 80, config_height: 64, src: small },
          { config_width: 320, config_height: 180, src: "https://fbcdn.net/v.mp4" },
        ],
      },
    ],
  });
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].url, img);
  assert.equal(res.items[0]._igSourceIndex, 2);
  assert.equal(res.items[0].ext, "webp");
  assert.equal(res.items[1].width, 320);
  assert.equal(res.uid, "11");
  assert.equal(res.caption, "study");
  assert.equal(a.parseSrcset(`${img} 4x, ${small} 1x`).at(-1).url, img);
});
test("numeric and composite media identities stay intact; page data cannot select an unrelated PK", () => {
  const { api: a, ctx } = harness();
  const key = Buffer.from("12345678901234567890_22").toString("base64url");
  assert.equal(a.decodeMediaIdFromUrl(img + "&ig_cache_key=" + key), "12345678901234567890");
  assert.equal(a.matchesPost({ code: "Other", pk: "1" }, "B"), false);
  assert.equal(a.matchesPost({ pk: "1" }, "B"), true);
  ctx.document.querySelectorAll = () => [
    { textContent: JSON.stringify({ xig_polaris_media: { media: { pk: "2", code: "C" } } }) },
  ];
  assert.equal(a.extractPostFromPageJson("B"), null);
});
test("stories keep video_url, caption objects and compound IDs; explicit misses do not pick the first item", () => {
  const { api: a } = harness();
  const raw = {
    pk: 10121,
    id: "10121_12",
    is_video: true,
    video_url: "https://fbcdn.net/clip.mp4",
    caption: { text: "A" },
  };
  const list = a.normalizeReelItems([null, raw]);
  assert.equal(list.length, 1);
  assert.equal(list[0].caption, "A");
  assert.equal(list[0].ext, "mp4");
  const p = { data: { reels_media: [{ items: [raw, { pk: 10122 }] }] } };
  assert.equal(a.resolveRawStoryItem(p, "10121"), raw);
  assert.equal(a.resolveRawStoryItem(p, "10123"), null);
});
test("API denials and malformed JSON never replay requests; retries:0 means exactly one attempt", async () => {
  for (const [status, text, terminal] of [
    [403, "{}", true],
    [429, "{}", true],
    [200, '{"status":"fail"}', true],
    [200, "not JSON", false],
  ]) {
    let calls = 0;
    const { api: a } = harness({
      fetch: async () => {
        calls++;
        return new Response(text, { status, headers: { "Content-Type": "application/json" } });
      },
    });
    await assert.rejects(
      a.request("https://www.instagram.com/api/", { retries: 0 }),
      (e) => Boolean(e.stopLookup) === terminal,
    );
    assert.equal(calls, 1);
  }
  let tries = 0;
  const { api: a } = harness({
    fetch: async () => {
      tries++;
      throw Error("timed out");
    },
  });
  await assert.rejects(a.request("https://www.instagram.com/api/", { retries: 0 }));
  assert.equal(tries, 1);
});
test("cache hydration drops expired, malformed and off-host entries and enforces its cap", () => {
  const { api: a } = harness();
  const now = Date.now();
  const raw = Object.fromEntries(
    Array.from({ length: 505 }, (_, i) => [String(i + 1), { ts: now - i, url: img }]),
  );
  raw["801"] = { ts: 1, url: img };
  raw["802"] = { ts: now, url: "https://example.org/i" };
  const merged = a.mergeCacheEntries(a.IMAGE_CACHE_KEY, raw, { 500: { ts: now, url: img } });
  assert.equal(Object.keys(merged).length, 500);
  assert.ok(!merged["801"] && !merged["802"]);
  assert.equal(Object.getPrototypeOf(merged), null);
  assert.equal(a.mergeCacheEntries(a.USER_ID_CACHE_KEY, { user: "invalid" }).user, undefined);
});
test("short TIFF ASCII strings are stored inline and valid dates/filenames respect the configured time source", () => {
  const { api: a } = harness();
  const data = a.buildExifPayload({ username: "ab", timestamp: 1609459200, shortcode: "B", index: 4 });
  assert.equal(Buffer.from(data.slice(24, 27)).toString(), "ab\0");
  a.state.fileRenameFormat = "%YEAR%-%INDEX%";
  assert.match(a.getSaveFileName(img, { timestamp: 946728000, index: 3, filetype: "webp" }), /^2000-3\.webp$/);
  a.USER_SETTING.RENAME_PUBLISH_DATE = false;
  assert.equal(
    a.getSaveFileName(img, { timestamp: 946728000, index: 3, filetype: "webp" }),
    `${new Date().getFullYear()}-3.webp`,
  );
});
test("existing JPEG EXIF, XMP and WebP pixels survive metadata handling", async () => {
  const { api: a } = harness();
  const source = fs.readFileSync(path.join(__dirname, "fixtures", "study.jpg"));
  const xmp = Buffer.from([255, 225, 0, 7, 88, 77, 80, 0, 0]);
  const blob = new Blob([source.subarray(0, 2), xmp, source.subarray(2)], { type: "image/jpeg" });
  const meta = { username: "ab", shortcode: "B", timestamp: 1609459200 };
  const out = await a.changeExifData(blob, meta);
  const bytes = Buffer.from(await out.arrayBuffer());
  assert.ok(bytes.includes(xmp));
  assert.ok(bytes.includes(Buffer.from("Exif\0\0")));
  assert.equal(await a.changeExifData(out, meta), out);
  const orig = fs.readFileSync(path.join(__dirname, "fixtures", "study.webp"));
  const web = Buffer.from(await (await a.changeExifData(new Blob([orig]), meta)).arrayBuffer());
  assert.equal(web.readUInt32LE(4), web.length - 8);
  assert.equal(web.subarray(12, 16).toString(), "VP8X");
  assert.ok(web[20] & 8);
  assert.ok(web.includes(orig.subarray(12)));
  assert.ok(web.includes(Buffer.from("EXIF")));
});
test("statistics opt-out stops session and download writes", () => {
  const { api: a, responses } = harness();
  a.USER_SETTING.TRACK_DOWNLOAD_STATS = false;
  a.Stats.session();
  a.Stats.record("photo", 300);
  assert.equal(responses.size, 0);
});
test("same-origin metadata rejects redirected login, HTML bodies and off-origin endpoints; network retry budget is bounded", async () => {
  let n = 0;
  const { api: a } = harness({
    fetch: async () => {
      if (n++ === 0) throw Error("offline");
      return new Response("{}", { headers: { "Content-Type": "application/json" } });
    },
  });
  await a.request("https://www.instagram.com/api/", { retries: 1 });
  assert.equal(n, 2);
  await assert.rejects(a.request("https://i.instagram.com/api/"));
  assert.equal(n, 2);
  for (const r of [
    new Response("", { status: 302 }),
    new Response("sign in", { headers: { "Content-Type": "text/html" } }),
  ]) {
    const { api: a } = harness({ fetch: async () => r });
    await assert.rejects(a.request("https://www.instagram.com/api/"), (e) => e.stopLookup === true);
  }
});
test("TIFF pointers resolve to aligned author, source URL, and date fields", () => {
  const { api: a } = harness();
  const t = Buffer.from(
    a.buildExifPayload({ username: "paper", shortcode: "Study", index: 3, timestamp: 1609459200 }),
  ).subarray(6);
  const read = (base, tag) => {
    for (let i = 0; i < t.readUInt16LE(base); i++) {
      const off = base + 2 + 12 * i;
      if (t.readUInt16LE(off) === tag) return [t.readUInt32LE(off + 8), t.readUInt32LE(off + 4)];
    }
    throw Error("missing tag");
  };
  const [at, n] = read(8, 0x013b);
  assert.equal(t.subarray(at, at + n).toString(), "paper\0");
  const [src, l] = read(8, 0x9c9e);
  assert.equal(src % 2, 0);
  assert.equal(
    t.subarray(src, src + l).toString("utf16le"),
    "https://www.instagram.com/p/Study/?img_index=3\0",
  );
  const [sub] = read(8, 0x8769),
    [date, len] = read(sub, 0x9003);
  assert.equal(date % 2, 0);
  assert.match(t.subarray(date, date + len).toString(), /^20\d\d:\d\d:\d\d \d\d:\d\d:\d\d\x00$/);
});
test("WebP keeps odd padded XMP after EXIF and preserves the source on malformed lengths", async () => {
  const { api: a } = harness(),
    meta = { username: "paper", shortcode: "Study" };
  const raw = fs.readFileSync(path.join(__dirname, "fixtures", "study.webp"));
  const x = Buffer.alloc(18);
  x.write("VP8X");
  x.writeUInt32LE(10, 4);
  x[8] = 4;
  x[12] = 95;
  x[15] = 63;
  const xmp = Buffer.from([88, 77, 80, 32, 3, 0, 0, 0, 65, 66, 67, 0]);
  const b = Buffer.concat([raw.subarray(0, 12), x, raw.subarray(12), xmp]);
  b.writeUInt32LE(b.length - 8, 4);
  const result = Buffer.from(await (await a.changeExifData(new Blob([b]), meta)).arrayBuffer());
  assert.ok(result.subarray(-xmp.length).equals(xmp));
  assert.equal(result[20] & 12, 12);
  assert.ok(result.indexOf("EXIF") < result.indexOf("XMP "));
  b.writeUInt32LE(0xffffffff, 16);
  await assert.rejects(a.changeExifData(new Blob([b]), meta));
});
