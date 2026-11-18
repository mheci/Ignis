"""Offline Chromium integration tests. Only the two hash-pinned @requires are downloaded.

All page/API/CDN requests are intercepted; no Instagram account or data is used.
The release bundle is executed unchanged, not a test export of the IIFE.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
from fetch_deps import ROOT, requires

ORIGIN = "https://www.instagram.com"
CDN = "https://scontent.fixture.cdninstagram.com"
JPG = CDN + "/study.jpg?sig=preserve_s320x320"
WEBP = CDN + "/study.webp?sig=stationery"
VIDEO = CDN + "/picture.mp4?sig=picture"
AUDIO = CDN + "/sound.mp4?sig=sound"
PROGRESSIVE = CDN + "/progressive.mp4?sig=mixed"
FIX = ROOT / "tests" / "fixtures"
STAMP = 1609459200
OWNER = {"username": "studio", "id": "77"}
CAPTION = "A paper study — Cairo."
MPD = f"""<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet mimeType="video/mp4"><Representation bandwidth="900" height="64"><BaseURL>{VIDEO}</BaseURL></Representation></AdaptationSet><AdaptationSet mimeType="audio/mp4"><Representation bandwidth="32000"><BaseURL>{AUDIO}</BaseURL></Representation></AdaptationSet></Period></MPD>"""


def photo(i=1101, url=JPG):
    return {
        "pk": str(i),
        "media_type": 1,
        "image_versions2": {"candidates": [{"url": url, "width": 96, "height": 64}]},
        "taken_at": STAMP,
    }


def movie(manifest=MPD):
    return {
        "pk": "1103",
        "media_type": 2,
        "video_dash_manifest": manifest,
        "video_versions": [{"url": PROGRESSIVE, "width": 96, "height": 64}],
        "image_versions2": {"candidates": [{"url": JPG, "width": 96, "height": 64}]},
        "taken_at": STAMP,
    }


def post(code="Study", children=None):
    return {
        "code": code,
        "user": OWNER,
        "taken_at": STAMP,
        "caption": {"text": CAPTION},
        "carousel_media": children if children is not None else [photo(), photo(1102, WEBP), movie()],
    }


def embedded(p):
    return (
        '<script type="application/json">'
        + json.dumps({"data": {"xdt_api__v1__media__shortcode__web_info": {"items": [p]}}})
        + "</script>"
    )


def article(code="Study", src=JPG):
    return f'<article><header><a href="/studio/">studio</a></header><div class="media"><img width="360" height="240" src="{src}"></div><a href="/p/{code}/"><time datetime="2021-01-01T00:00:00Z">Post</time></a></article>'


def story_body(video=False):
    media = (
        f'<video width="360" height="240" poster="{JPG}"></video>'
        if video
        else f'<img width="360" height="240" src="{WEBP}">'
    )
    return f'<section class="_ac0a"><header><a href="/studio/">studio</a><time datetime="2021-01-01T00:00:04Z">Seen</time></header>{media}</section>'


def html(body):
    return (
        '<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px system-ui;margin:20px}article,.media,section{width:400px}.media{position:relative}a.grid{display:block;width:320px}button{font:inherit}</style></head><body><div id="mount-fixture">'
        + body
        + '</div><input id="editor" aria-label="Site input"></body></html>'
    )


def frame_md5(path):
    return subprocess.check_output(
        [
            "ffmpeg",
            "-v",
            "error",
            "-threads",
            "1",
            "-i",
            str(path),
            "-map",
            "0:v:0",
            "-pix_fmt",
            "rgb24",
            "-f",
            "md5",
            "-",
        ],
        text=True,
    ).strip()


def probe(path):
    return json.loads(
        subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], text=True
        )
    )


class Lab:
    def __init__(self, browser, deps, bundle, seed=None, block_idb=False, deny_storage=False, modern=False):
        self.c = browser.new_context(
            viewport={"width": 1040, "height": 780}, service_workers="block", accept_downloads=True
        )
        self.p = self.c.new_page()
        self.p.set_default_timeout(5500)
        self.errors = []
        self.p.on("pageerror", lambda err: self.errors.append(str(err)))
        self.unexpected = []
        self.api = []
        self.data = post()
        self.story = None
        self.response_status = 200
        self.body = ""
        self.rest = False
        self.c.route("**/*", self.route)
        config = {
            "USE_EXTERNAL_DOWNLOAD_MODE": True,
            "G_RENAME_FORMAT": "%USERNAME%-%SOURCE_TYPE%-%INDEX%",
            **(seed or {}),
        }
        starter = (
            (ROOT / "tests/manager-fixture.js").read_text()
            + "\n"
            + f"""if(!sessionStorage.getItem('seeded')){{for(const [k,v] of Object.entries({json.dumps(config)}))fixture.put(k,v);sessionStorage.setItem('seeded','yes')}}\n"""
        )
        if modern:
            starter += """window.GM={}; for (const [legacy,newName] of Object.entries({GM_getValue:'getValue',GM_setValue:'setValue',GM_deleteValue:'deleteValue',GM_download:'download',GM_openInTab:'openInTab',GM_notification:'notification',GM_registerMenuCommand:'registerMenuCommand',GM_unregisterMenuCommand:'unregisterMenuCommand',GM_xmlhttpRequest:'xmlHttpRequest'})) {const fn=window[legacy];GM[newName]=(...args)=>newName==='download'||newName==='xmlHttpRequest' ? new Promise((res,rej)=>fn({...args[0],onload:res,onerror:rej})) : Promise.resolve().then(()=>fn(...args));delete window[legacy];}delete window.GM_addStyle;\n"""
        if block_idb:
            starter += "Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('No database','SecurityError')}});\n"
        if deny_storage:
            starter += "fixture.storageDenied=true;\n"
        self.c.add_init_script(
            script=starter
            + "\n;document.addEventListener('DOMContentLoaded',function(){\n"
            + "\n".join(d.decode() for d in deps)
            + "\n"
            + bundle
            + "\n},{once:true});"
        )

    def route(self, route):
        q = route.request
        u = urlsplit(q.url)
        if u.hostname == "www.instagram.com" and q.is_navigation_request():
            route.fulfill(content_type="text/html", body=html(self.body))
            return
        if u.hostname == "www.instagram.com" and (
            u.path in ("/studio/", "/graphql/query") or u.path.startswith("/api/v1/")
        ):
            self.api.append({"path": u.path, "method": q.method})
            if u.path == "/studio/":
                route.fulfill(
                    content_type="text/html", body='<meta property="instapp:owner_user_id" content="77">'
                )
                return
            if self.response_status != 200:
                route.fulfill(status=self.response_status, json={"status": "fail"})
                return
            if u.path == "/graphql/query":
                payload = (
                    {"data": {"xdt_api__v1__feed__reels_media": {"reels_media": [self.story]}}}
                    if self.story
                    else {
                        "data": (
                            {}
                            if self.rest
                            else {"xdt_api__v1__media__shortcode__web_info": {"items": [self.data]}}
                        )
                    }
                )
            else:
                payload = {"status": "ok", "items": [self.data]}
            route.fulfill(json=payload)
            return
        if u.hostname == "scontent.fixture.cdninstagram.com":
            name = Path(u.path).name
            if name == "broken.mp4":
                route.fulfill(status=403, content_type="text/html", body="Unavailable")
                return
            if name == "not-media.jpg":
                route.fulfill(content_type="text/html", body="Sign in")
                return
            typ = {".mp4": "video/mp4", ".jpg": "image/jpeg", ".webp": "image/webp"}.get(Path(name).suffix)
            source = FIX / ("picture.mp4" if name == "progressive.mp4" else name)
            if source.is_file():
                route.fulfill(
                    content_type=typ, body=source.read_bytes(), headers={"access-control-allow-origin": "*"}
                )
                return
        self.unexpected.append(q.url)
        route.abort()

    def goto(self, path, body):
        self.body = body
        self.p.goto(ORIGIN + path, wait_until="domcontentloaded")
        self.wait("Object.keys(fixture.menus).length===7")

    def spa(self, path, body):
        self.p.evaluate(
            "([path,body])=>{history.pushState({},'',path);const el=document.createElement('div');el.id='mount-fixture';el.innerHTML=body;document.getElementById(el.id).replaceWith(el)}",
            [path, body],
        )
        self.p.wait_for_timeout(250)

    def menu(self, name):
        self.p.evaluate("k=>fixture.menus[k]()", name)

    def wait(self, js):
        self.p.wait_for_function(js, timeout=6250)

    def saved(self, n):
        self.wait(f"fixture.saved.length==={n}")
        return self.p.evaluate("fixture.saved")

    def close_dialog(self):
        self.p.keyboard.press("Escape")
        expect(self.p.locator(".ignis-modal:not([inert])")).to_have_count(0)

    def done(self):
        assert not self.errors, self.errors
        assert not self.p.evaluate("fixture.errors"), self.p.evaluate("fixture.errors")
        assert not self.unexpected, self.unexpected
        self.c.close()


def carousel_and_settings(launch, ok, out):
    l = launch(seed={"DOWNLOAD_WITH_CAPTION": True})
    p = l.p
    l.goto("/p/Study/?img_index=2", article() + embedded(post()))
    expect(p.locator(".ignis-bar")).to_have_count(1)
    p.locator(".ignis-dl").click()
    expect(p.locator(".ignis-item")).to_have_count(3)
    assert not l.api, l.api
    ok("matching embedded carousel wins over a one-photo DOM without an API request")
    p.locator(".ignis-checkmark").first.focus()
    p.keyboard.press("Space")
    expect(p.locator(".ignis-count")).to_have_text("2/3")
    expect(p.locator(".ignis-checkmark").first).to_have_attribute("aria-checked", "false")
    ok("keyboard selection, count and checkbox state agree")
    p.locator(".ig-act-dl").nth(1).click()
    saved = l.saved(2)
    assert [x["name"] for x in saved] == ["studio-photo-2.webp", "studio-photo-2.txt"]
    assert bytes(saved[1]["bytes"]).decode() == CAPTION
    web = out / "selected.webp"
    web.write_bytes(bytes(saved[0]["bytes"]))
    assert frame_md5(web) == frame_md5(FIX / "study.webp")
    assert b"EXIF" in web.read_bytes()
    ok("WebP and parent-caption sidecar share the selected index; decoded pixels match")
    p.locator(".ig-act-dl").first.click()
    saved = l.saved(4)
    jpg = out / "selected.jpg"
    jpg.write_bytes(bytes(saved[2]["bytes"]))
    assert saved[2]["name"] == "studio-photo-1.jpg" and frame_md5(jpg) == frame_md5(FIX / "study.jpg")
    assert b"Exif\0\0" in jpg.read_bytes()
    ok("JPEG survives EXIF insertion and decodes to identical pixels")
    p.locator(".ig-act-dl").nth(2).click()
    saved = l.saved(6)
    mp4 = out / "merged.mp4"
    mp4.write_bytes(bytes(saved[4]["bytes"]))
    assert saved[4]["name"] == "studio-video-3.mp4" and saved[5]["name"] == "studio-video-3.txt"
    tracks = probe(mp4)["streams"]
    assert {s["codec_name"] for s in tracks} == {"h264", "aac"} and len(tracks) == 2, tracks
    assert 0.4 < float(probe(mp4)["format"]["duration"]) < 0.7
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp4), "-f", "null", "-"], check=True)
    ok("DASH mux produces a decodable two-track H.264/AAC MP4 and matching caption")
    before = p.evaluate("fixture.get('IGNIS_STATS_V1').items")
    p.evaluate("fixture.failNext=true")
    p.locator(".ig-act-dl").nth(2).click()
    expect(p.locator(".ignis-toast-error").last).to_contain_text("Download failed")
    assert (
        p.evaluate("fixture.sent.length") == 7
        and len(l.saved(6)) == 6
        and p.evaluate("fixture.get('IGNIS_STATS_V1').items") == before
    )
    ok("rejected muxed-file handoff neither retries the progressive file nor counts a success")
    p.locator(".ig-act-nt").nth(1).click()
    assert p.evaluate("fixture.tabs.at(-1)") == WEBP
    ok("preview keeps the original CDN authority and signed query")
    l.close_dialog()
    p.locator(".ignis-nt").click()
    assert p.evaluate("fixture.tabs.at(-1)") == WEBP
    ok("toolbar preview respects the permalink slide, not array position zero")
    assert all(x["anonymous"] for x in p.evaluate("fixture.requests"))
    ok("all cross-origin media reads use the anonymous GM boundary")
    l.menu("Hotkey Settings")
    expect(p.locator(".ignis-tab-a")).to_have_attribute("data-tab", "keyboard")
    expect(p.locator(".ignis-row[data-set]")).to_have_count(3)
    row = p.locator("[data-hotkey=downloadStoryHotkeyKeyCode]")
    row.get_by_role("button").click()
    p.keyboard.press("j")
    expect(row.locator("kbd").last).to_have_text("J")
    assert p.evaluate("fixture.get('G_HOTKEY_DOWNLOAD_STORY_KEYCODE')") == 74
    ok("keyboard deep link exposes toggles and writes the canonical rebind key")
    p.locator("[data-set=COMMAND_PALETTE] label").click()
    l.close_dialog()
    p.keyboard.press("Alt+k")
    p.keyboard.press("Control+k")
    expect(p.locator(".ignis-palette")).to_have_count(0)
    ok("disabled palette ignores both shortcut families")
    p.reload(wait_until="domcontentloaded")
    l.wait("!!fixture.menus.Settings")
    l.menu("Hotkey Settings")
    expect(p.locator("[data-hotkey=downloadStoryHotkeyKeyCode] kbd").last).to_have_text("J")
    l.close_dialog()
    ok("story key survives a full page reload")
    l.menu("Command Palette")
    p.locator(".ignis-pal-inp").fill("statistics")
    p.keyboard.press("Enter")
    expect(p.locator(".ignis-tab-a")).to_have_attribute("data-tab", "stats")
    ok("palette opens Statistics, not Downloads")
    l.menu("Reload Script")
    l.menu("Reload Script")
    expect(p.locator(".ignis-modal:not([inert])")).to_have_count(0)
    expect(p.locator(".ignis-dl")).to_have_count(1)
    p.locator(".ignis-dl").click()
    expect(p.locator(".ignis-modal:not([inert])")).to_have_count(1)
    expect(p.locator(".ignis-item")).to_have_count(3)
    l.close_dialog()
    ok("two reloads restore exactly one working toolbar and dismiss the modal stack")
    l.spa("/accounts/login/", article())
    expect(p.locator(".ignis-bar")).to_have_count(0)
    l.spa("/p/Study/", article() + embedded(post()))
    expect(p.locator(".ignis-bar")).to_have_count(1)
    ok("navigation to login tears controls down; replacement mount reattaches them")
    p.locator("#editor").focus()
    p.keyboard.press("s")
    p.keyboard.press("Alt+w")
    expect(p.locator(".ignis-modal:not([inert])")).to_have_count(0)
    assert not p.evaluate("fixture.sent.length")
    ok("site text input retains plain and modified shortcuts")
    l.done()


def batch_and_routes(launch, ok):
    l = launch(seed={"DIRECT_DOWNLOAD_ALL": True, "MODIFY_RESOURCE_EXIF": False})
    p = l.p
    l.rest = True
    l.goto("/p/Study/", article())
    p.locator(".ignis-dl").click()
    l.wait("fixture.notes.length===1")
    assert [x["name"] for x in l.saved(3)] == [
        "studio-photo-1.jpg",
        "studio-photo-2.webp",
        "studio-video-3.mp4",
    ]
    assert [r["path"] for r in l.api] == ["/graphql/query", l.api[1]["path"]] and l.api[1]["path"].endswith(
        "/info/"
    )
    ok("batch waits for complete REST metadata after empty GraphQL and downloads all three items")
    p.evaluate("fixture.failNext=true")
    p.locator(".ignis-dl").click()
    l.wait("fixture.notes.length===2")
    assert "2 of 3" in p.evaluate("fixture.notes.at(-1)") and "1 failed" in p.evaluate("fixture.notes.at(-1)")
    ok("batch summary counts saves and failures rather than attempts")
    # Navigate at the first successful handoff, before the next batch iteration.
    p.locator(".ignis-dl").click()
    l.wait("fixture.saved.length===6")
    l.spa("/accounts/login/", "<p>Login fixture</p>")
    l.wait("fixture.notes.length===3")
    assert "2 skipped" in p.evaluate("fixture.notes.at(-1)") and len(l.saved(6)) == 6
    ok("route change stops the remaining batch and reports skipped items")
    l.done()

    l = launch(seed={"DIRECT_DOWNLOAD_ALL": True})
    p = l.p
    l.response_status = 429
    l.goto("/p/Study/", article())
    p.locator(".ignis-dl").click()
    expect(p.locator(".ignis-toast-error")).to_contain_text("rate limit")
    assert len(l.api) == 1 and not p.evaluate("fixture.sent.length")
    ok("rate-limited post stops after one request with no alternate lookup or file")
    l.done()

    l = launch(
        seed={
            "FORCE_RESOURCE_VIA_MEDIA": False,
            "DIRECT_DOWNLOAD_ALL": True,
            "MODIFY_RESOURCE_EXIF": False,
            "G_RENAME_FORMAT": "%SHORTCODE%-%INDEX%",
        }
    )
    p = l.p
    l.goto("/p/Study/", article())
    p.locator(".ignis-dl").click()
    expect(p.locator(".ignis-hint").first).to_contain_text("only media")
    assert not l.api and not p.evaluate("fixture.sent.length")
    l.close_dialog()
    ok("page-only mode never presents a partial carousel as a completed batch")
    l.spa(
        "/explore/", '<a class="grid" href="/p/First/"><img width="320" height="230" src="' + JPG + '"></a>'
    )
    expect(p.locator(".ignis-gd")).to_have_count(1)
    p.locator(".grid").evaluate(
        "a=>{a.href='/p/Second/';a.querySelector('button').remove();a.dataset.igGrid='1'}"
    )
    expect(p.locator(".ignis-gd")).to_have_count(1)
    p.locator(".grid").evaluate("a=>a.href='/p/Third/'")
    p.locator(".ignis-gd").click()
    p.locator(".ig-act-dl").click()
    l.saved(1)
    l.close_dialog()
    assert p.evaluate("fixture.sent[0].url") == JPG and p.evaluate("fixture.sent[0].name") == "Third-1.jpg"
    ok("recycled and removed grid controls still open a usable page-only post")
    l.spa(
        "/p/Study/",
        article().replace(
            '<img width="360" height="240" src="' + JPG + '">',
            '<ul><li aria-posinset="4"><img width="360" height="240" src="' + WEBP + '"></li></ul>',
        ),
    )
    p.locator(".ignis-nt").click()
    assert p.evaluate("fixture.tabs.at(-1)") == WEBP
    p.locator(".ignis-dl").click()
    p.locator(".ig-act-dl").click()
    assert l.saved(2)[1]["name"] == "Study-4.webp"
    ok("a single virtualized fourth slide retains its source index in previews and filenames")
    l.done()


def dash_and_stories(launch, ok):
    l = launch(seed={"NEW_TAB_HIGHEST_VIDEO": True})
    p = l.p
    guarded = movie(
        MPD.replace(
            '<Representation bandwidth="900"',
            '<SegmentTemplate media="$Number$.mp4"/><Representation bandwidth="900"',
        )
    )
    l.goto("/p/Study/", article() + embedded(post(children=[guarded])))
    p.locator(".ignis-dl").click()
    p.locator(".ig-act-dl").click()
    saved = l.saved(1)
    assert saved[0]["url"] == PROGRESSIVE and not p.evaluate("fixture.requests.length")
    ok("segmented DASH declines the first segment and hands off the progressive file")
    l.close_dialog()
    l.spa(
        "/p/Other/",
        article("Other") + embedded(post("Other", [movie(MPD.replace(VIDEO, CDN + "/broken.mp4"))])),
    )
    p.locator(".ignis-dl").click()
    p.locator(".ig-act-dl").click()
    assert l.saved(2)[1]["url"] == PROGRESSIVE
    ok("unavailable complete DASH stream falls back to an offered progressive file")
    l.done()

    l = launch(seed={"USER_IDS_STORED": {"studio": "77"}})
    p = l.p
    second = movie()
    second.update(
        {
            "id": "1103_77",
            "pk": 1103,
            "story_bloks_stickers": [
                {"bloks_sticker": {"sticker_data": {"ig_mention": {"username": "paper"}}}}
            ],
        }
    )
    l.story = {"id": "77", "user": OWNER, "items": [photo(), second]}
    l.goto("/stories/studio/1103/", story_body(video=True))
    p.locator(".ignis-sn").click()
    l.wait("fixture.tabs.length===1")
    assert p.evaluate("fixture.tabs[0]") == PROGRESSIVE
    p.locator(".ignis-tp").click()
    expect(p.locator("a.ignis-tagged")).to_have_attribute("href", "https://www.instagram.com/paper/")
    l.close_dialog()
    p.locator(".ignis-sl").click()
    expect(p.locator(".ignis-item")).to_have_count(2)
    ok("story preview, tagged profiles and browser agree on the same numeric/composite item")
    l.close_dialog()
    l.spa("/stories/highlights/123/", story_body(video=True))
    l.story["items"][0]["taken_at"] = STAMP - 600
    p.locator(".ignis-htp").click()
    expect(p.locator("a.ignis-tagged")).to_have_text("@paper")
    ok("highlight without item ID matches a nearby taken_at timestamp")
    l.done()

    l = launch()
    p = l.p
    l.goto("/p/Study/", '<div id="splash-screen">Loading</div>' + article() + embedded(post()))
    expect(p.locator(".ignis-bar")).to_have_count(0)
    p.locator("#splash-screen").evaluate("el=>el.remove()")
    expect(p.locator(".ignis-dl")).to_have_count(1)
    ok("removing the splash screen without adding a node boots the post route")
    l.done()
    l = launch(block_idb=True, deny_storage=True)
    p = l.p
    l.goto("/p/Study/", article() + embedded(post()))
    l.menu("Settings")
    expect(p.locator(".ignis-tab-a")).to_have_attribute("data-tab", "download")
    l.close_dialog()
    p.locator(".ignis-dl").click()
    expect(p.locator(".ignis-item")).to_have_count(3)
    ok("settings and media UI boot with both IndexedDB and GM storage denied")
    l.done()


def focused_media_and_profile(launch, ok):
    l = launch(
        seed={
            "G_RENAME_FORMAT": "%SHORTCODE%-%INDEX%",
            "FORCE_RESOURCE_VIA_MEDIA": False,
            "MODIFY_RESOURCE_EXIF": False,
        }
    )
    p = l.p
    l.goto("/", article("First") + '<div style="height:950px"></div>' + article("Second", WEBP))
    p.locator("article").nth(1).scroll_into_view_if_needed()
    p.keyboard.press("Alt+s")
    expect(p.locator(".ignis-toast").last).to_contain_text("Open a story first")
    assert not p.evaluate("fixture.sent.length")
    p.keyboard.press("s")
    assert l.saved(1)[0]["name"] == "Second-1.webp"
    ok("Alt+S is story-only and plain S saves the visible post, not the first feed link")
    reel = (
        lambda code, url: f'<div style="width:280px;height:240px"><a href="/reel/{code}/">Reel</a><video width="260" height="205" src="{url}" preload="none"></video></div>'
    )
    l.spa("/reels/", "<main>" + reel("One", VIDEO) + reel("Two", PROGRESSIVE) + "</main>")
    expect(p.locator(".ignis-rn")).to_have_count(2)
    p.locator(".ignis-rn").nth(1).click()
    assert p.evaluate("fixture.tabs") == [PROGRESSIVE] and p.evaluate("fixture.sent.length") == 1
    ok("narrow multi-reel layout previews the clicked player without initiating a download")
    l.spa(
        "/studio/",
        '<header><div class="outer"><div class="inner"><img alt="studio profile" width="150" height="150" src="'
        + JPG
        + '"></div></div></header>',
    )
    l.menu("Settings")
    p.locator("[data-set=DOWNLOAD_PROFILE_PIC_HD] label").click()
    l.close_dialog()
    p.locator(".ignis-pd").click()
    assert l.saved(2)[1]["url"] == JPG and not l.api
    ok("standard avatar download uses the displayed photo without user-ID or HD lookups")
    l.done()


def storage_and_adapters(launch, ok):
    l = launch(
        seed={
            "G_RENAME_FORMAT": "%UID%-%INDEX%",
            "USER_IDS_STORED": {"studio": "77"},
            "MODIFY_RESOURCE_EXIF": False,
        }
    )
    p = l.p
    l.goto("/p/Study/", article())
    l.wait("fixture.get('USER_IDS_STORED')===undefined")
    record = p.evaluate(
        """async()=>{const req=indexedDB.open('IGNIS');return await new Promise(resolve=>req.onsuccess=()=>{const db=req.result,r=db.transaction('DATA_CACHE').objectStore('DATA_CACHE').get('USER_IDS_STORED');r.onsuccess=()=>{db.close();resolve(r.result)}})}"""
    )
    assert record["value"]["studio"] == "77"
    p.reload(wait_until="domcontentloaded")
    l.wait("!!fixture.menus.Settings")
    l.data["user"] = {"username": "studio"}
    p.locator(".ignis-dl").click()
    p.locator(".ig-act-dl").nth(2).click()
    assert l.saved(1)[0]["name"] == "77-3.mp4" and all(r["path"] != "/studio/" for r in l.api)
    ok(
        "IDB migration is durable across reload; DASH filenames can use cached UID without another profile lookup"
    )
    l.done()
    l = launch(block_idb=True, seed={"G_RENAME_FORMAT": "%UID%-%INDEX%", "MODIFY_RESOURCE_EXIF": False})
    p = l.p
    l.data["user"] = {"username": "studio"}
    l.goto("/p/Study/", article())
    p.evaluate(
        """()=>{const put=fixture.put.bind(fixture);fixture.put=(k,v)=>{if(k==='USER_IDS_STORED' && !fixture.writeFailed){fixture.writeFailed=true;throw Error('Quota')}return put(k,v)}}"""
    )
    p.locator(".ignis-dl").click()
    p.locator(".ig-act-dl").first.click()
    assert l.saved(1)[0]["name"] == "77-1.jpg"
    l.wait("fixture.writeFailed===true")
    p.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))")
    l.wait("fixture.get('USER_IDS_STORED')?.studio==='77'")
    ok("a failed GM fallback write stays queued and a later flush succeeds")
    l.done()
    l = launch(
        modern=True, block_idb=True, seed={"G_RENAME_FORMAT": "%INDEX%", "DOWNLOAD_WITH_CAPTION": True}
    )
    p = l.p
    l.goto("/p/Study/", article() + embedded(post()))
    p.locator(".ignis-dl").click()
    p.locator(".ig-act-dl").first.click()
    files = l.saved(2)
    assert [x["name"] for x in files] == ["1.jpg", "1.txt"]
    l.close_dialog()
    l.menu("Hotkey Settings")
    p.locator("[data-set=KEYBOARD_DOWNLOAD_S] label").click()
    l.wait("fixture.get('KEYBOARD_DOWNLOAD_S')===false")
    ok("Promise-only GM adapter warms settings, fetches media, saves a sidecar and persists edits")
    l.done()
    l = launch(seed={"DOWNLOAD_WITH_CAPTION": True})
    p = l.p
    l.goto("/p/Study/", article() + embedded(post(children=[photo(url=CDN + "/not-media.jpg")])))
    p.locator(".ignis-dl").click()
    p.locator(".ig-act-dl").click()
    expect(p.locator(".ignis-toast-error").last).to_contain_text("did not return media")
    assert not p.evaluate("fixture.sent.length")
    ok("a login HTML body masquerading as an image is never handed off or counted")
    l.done()
    l = launch(seed={"NEW_TAB_HIGHEST_VIDEO": True})
    p = l.p
    only = movie()
    only.pop("video_versions")
    l.goto("/p/Study/", article() + embedded(post(children=[only])))
    p.locator(".ignis-dl").click()
    p.locator(".ig-act-nt").click()
    assert p.evaluate("fixture.tabs") == [VIDEO]
    p.locator(".ig-act-dl").click()
    f = l.saved(1)[0]
    assert f["name"].endswith(".mp4") and f["url"].startswith("blob:")
    ok("DASH-only item survives normalization, with explicit video-only preview and merged save")
    l.done()


def run(browser, deps, bundle, out):
    observations = []

    def ok(name):
        observations.append(name)
        print("PASS:", name, flush=True)

    def launch(**args):
        return Lab(browser, deps, bundle, **args)

    carousel_and_settings(launch, ok, out)
    batch_and_routes(launch, ok)
    dash_and_stories(launch, ok)
    focused_media_and_profile(launch, ok)
    storage_and_adapters(launch, ok)
    return observations


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--chrome",
        default=os.getenv("CHROME_BIN") or shutil.which("google-chrome") or shutil.which("chromium"),
    )
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()
    with tempfile.TemporaryDirectory(prefix="ignis-test-") as tmp, sync_playwright() as w:
        dest = args.out or Path(tmp)
        dest.mkdir(exist_ok=True, parents=True)
        deps = requires(Path(os.getenv("IGNIS_TEST_DEPS", str(Path(tmp) / "deps"))))
        bundle = (ROOT / "ignis.user.js").read_text()
        b = w.chromium.launch(executable_path=args.chrome, headless=True, args=["--disable-dev-shm-usage"])
        obs = run(b, deps, bundle, dest)
        report = {"browser": b.version, "bundle": hashlib.sha256(bundle.encode()).hexdigest(), "passed": obs}
        (dest / "checks.json").write_text(json.dumps(report, indent=2) + "\n")
        b.close()
        print(len(obs), "browser scenarios passed.")


if __name__ == "__main__":
    main()
