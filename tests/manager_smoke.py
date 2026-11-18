"""Optional installed-manager smoke. Use Chrome for Testing + an official unpacked
Tampermonkey extension. A fresh temporary profile is removed on exit. No login.
"""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit
import re
import tempfile
from playwright.sync_api import expect, sync_playwright
from browser import ROOT, ORIGIN, CDN, FIX, CAPTION, article, embedded, post, html, probe, frame_md5

TM = "dhdgffkkebhmkfjojejmpbldmpobfkfo"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome", required=True)
    ap.add_argument("--extension", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument(
        "--site", action="store_true", help="Also open the unmodified, signed-out Instagram login page"
    )
    args = ap.parse_args()
    out = args.out
    out.mkdir(exist_ok=True, parents=True)
    ext = args.extension.resolve()
    bundle = ROOT / "ignis.user.js"
    opt = f"chrome-extension://{TM}/options.html"
    ver = re.search(r"^// @version\s+(\S+)", bundle.read_text(), re.M)[1]
    with tempfile.TemporaryDirectory(prefix="ignis-manager-") as prof, sync_playwright() as w:
        c = w.chromium.launch_persistent_context(
            prof,
            executable_path=args.chrome,
            headless=False,
            viewport={"width": 1150, "height": 795},
            accept_downloads=True,
            ignore_default_args=[
                "--disable-extensions",
                "--disable-component-extensions-with-background-pages",
                "--disable-background-networking",
                "--disable-component-update",
            ],
            args=[f"--load-extension={ext}", f"--disable-extensions-except={ext}", "--disable-dev-shm-usage"],
        )
        try:
            p = c.new_page()
            p.goto("chrome://extensions/?id=" + TM)
            toggle = p.locator("#allow-user-scripts").first.locator("cr-toggle").first
            toggle.wait_for(timeout=18000)
            if not toggle.evaluate("n=>n.checked"):
                toggle.click()
            p.goto(opt + "#nav=utils")
            p.get_by_text("Utilities", exact=True).first.click()
            with c.expect_page(timeout=22000) as prompt:
                p.locator("input[type=file]").last.set_input_files(str(bundle))
            ask = prompt.value
            ask.wait_for_url(lambda u: "/ask.html" in u)
            ask.wait_for_function("()=>document.body?.innerText.includes('IGNIS')", timeout=30000)
            ask.get_by_role("button", name=re.compile("^(Install|Reinstall|Update)$")).last.click(
                timeout=12000
            )
            listing = c.new_page()
            listing.goto(opt + "#nav=dashboard")
            line = listing.locator("tr").filter(has_text="IGNIS").last
            line.locator('[title="Enabled"]').wait_for(timeout=25000)
            expect(line).to_contain_text(ver)
            print("PASS: installed and enabled", ver, flush=True)
            evidence = {
                "manager": "Tampermonkey " + json.loads((ext / "manifest.json").read_text())["version"],
                "browser": c.browser.version,
                "version": ver,
                "sha256": hashlib.sha256(bundle.read_bytes()).hexdigest(),
                "fixture": {},
                "liveSignedOut": None,
            }
            page = c.new_page()
            page.set_default_timeout(9000)
            page.route(
                ORIGIN + "/p/Study/",
                lambda r: r.fulfill(content_type="text/html", body=html(article() + embedded(post()))),
            )

            def fixture_media(route):
                name = Path(urlsplit(route.request.url).path).name
                typ = {".mp4": "video/mp4", ".webp": "image/webp", ".jpg": "image/jpeg"}.get(
                    Path(name).suffix
                )
                if name not in {"picture.mp4", "sound.mp4", "study.webp", "study.jpg"}:
                    route.abort()
                    return
                route.fulfill(
                    content_type=typ,
                    body=(FIX / name).read_bytes(),
                    headers={"access-control-allow-origin": "*"},
                )

            c.route(CDN + "/**", fixture_media)
            page.goto(ORIGIN + "/p/Study/", wait_until="domcontentloaded")
            page.locator(".ignis-dl").click(timeout=20000)
            expect(page.locator(".ignis-item")).to_have_count(3)
            with page.expect_download() as download:
                page.locator(".ig-act-cap").first.click()
            assert (
                download.value.suggested_filename.endswith(".txt")
                and Path(download.value.path()).read_text() == CAPTION
            )
            with page.expect_download(timeout=18000) as media:
                page.locator(".ig-act-dl").nth(1).click()
            assert media.value.suggested_filename.endswith(".webp") and frame_md5(
                media.value.path()
            ) == frame_md5(FIX / "study.webp")
            with page.expect_download(timeout=18000) as video:
                page.locator(".ig-act-dl").nth(2).click()
            tracks = probe(video.value.path())["streams"]
            assert video.value.suggested_filename.endswith(".mp4") and {s["codec_name"] for s in tracks} == {
                "h264",
                "aac",
            }
            page.keyboard.press("Escape")
            page.keyboard.press("Alt+w")
            expect(page.locator(".ignis-hero")).to_contain_text(ver)
            page.keyboard.press("Escape")
            page.keyboard.press("Alt+r")
            page.locator(".ignis-dl").click()
            expect(page.locator(".ignis-modal:not([inert]) .ignis-item")).to_have_count(3)
            page.wait_for_function(
                "()=>{const m=document.querySelector('.ignis-modal-in:not([inert])');return m && getComputedStyle(m).opacity==='1'}"
            )
            page.screenshot(path=out / "installed-post.jpg", animations="disabled", type="jpeg", quality=80)
            evidence["fixture"] = {
                "bundleInjectedByManager": True,
                "carouselItems": 3,
                "verifiedWebPPixels": True,
                "mergedMP4Tracks": [s["codec_name"] for s in tracks],
                "downloadedCaptionBytes": len(CAPTION.encode()),
                "settings": True,
                "reloadToolbar": True,
            }
            print(
                "PASS: actual manager injection, WebP pixels, H.264/AAC MP4, caption, settings and post-reload toolbar",
                flush=True,
            )
            if args.site:
                live = c.new_page()
                site = {"url": ORIGIN + "/accounts/login/", "mediaDownloadsTested": False}
                evidence["liveSignedOut"] = site
                try:
                    response = live.goto(site["url"], wait_until="domcontentloaded", timeout=35000)
                    site["httpStatus"] = response.status if response else None
                    live.locator("body").click(position={"x": 4, "y": 4}, timeout=3500)
                    live.keyboard.press("Alt+w")
                    expect(live.locator(".ignis-hero")).to_contain_text(ver, timeout=15000)
                    site["settingsOpened"] = True
                    site["postToolbars"] = live.locator(".ignis-bar").count()
                    site["pageTitle"] = live.title()
                    live.screenshot(path=out / "signed-out-settings.jpg", type="jpeg", quality=75)
                except Exception as exc:
                    site["settingsOpened"] = False
                    site["reason"] = str(exc).split("\n")[0][:240]
                print("Signed-out observation:", json.dumps(site), flush=True)
            (out / "manager.json").write_text(json.dumps(evidence, indent=2) + "\n")
        finally:
            c.close()


if __name__ == "__main__":
    main()
