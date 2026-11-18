"""Opt-in real-site verification: fresh Tampermonkey profile, no credentials or intercepted requests.
Install a local build, click the requested reel and first carousel item by pointer,
keep browser download files and record ffprobe/full-decoder evidence. A login wall,
rate limit, ambiguous target or missing transfer is a non-pass, never a forced click.
"""

import argparse, hashlib, json, re, subprocess, tempfile
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
from manager_smoke import TM
from browser import ROOT, probe

REEL = "https://www.instagram.com/reels/DfvCzPKMgF5/"
IMAGE = "https://www.instagram.com/p/DfobfqegNMK/?e=b1c3f069-ae14-48a3-a0fb-a917533b1b2f&g=5"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--chrome", required=True)
    ap.add_argument("--extension", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    ext = args.extension.resolve()
    raw = (ROOT / "ignis.user.js").read_bytes()
    ver = re.search(rb"^// @version\s+(\S+)", raw, re.M)[1].decode()
    result = {
        "version": ver,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "manager": json.loads((ext / "manifest.json").read_text())["version"],
        "networkInterception": False,
        "targets": [],
    }
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as w:
        staged = Path(tmp) / "ignis.user.js"
        staged.write_bytes(raw)
        c = w.chromium.launch_persistent_context(
            str(Path(tmp) / "profile"),
            executable_path=args.chrome,
            headless=False,
            accept_downloads=True,
            viewport={"width": 1150, "height": 795},
            ignore_default_args=[
                "--disable-extensions",
                "--disable-component-extensions-with-background-pages",
                "--disable-background-networking",
                "--disable-component-update",
            ],
            args=[
                f"--load-extension={ext}",
                f"--disable-extensions-except={ext}",
                "--disable-dev-shm-usage",
                "--renderer-process-limit=2",
            ],
        )
        result["browser"] = c.browser.version
        try:
            admin = c.new_page()
            admin.goto("chrome://extensions/?id=" + TM)
            allow = admin.locator("#allow-user-scripts").first.locator("cr-toggle").first
            allow.wait_for(timeout=18000)
            if not allow.evaluate("n=>n.checked"):
                allow.click()
            opt = f"chrome-extension://{TM}/options.html"
            admin.goto(opt + "#nav=utils")
            admin.get_by_text("Utilities", exact=True).first.click()
            with c.expect_page(timeout=22000) as prompted:
                admin.locator("input[type=file]").last.set_input_files(staged)
            ask = prompted.value
            ask.wait_for_url(lambda u: "/ask.html" in u)
            ask.wait_for_function("()=>document.body?.innerText.includes('IGNIS')", timeout=30000)
            ask.get_by_role("button", name=re.compile("^(Install|Update|Reinstall)$")).last.click(
                timeout=15000
            )
            listing = c.new_page()
            listing.goto(opt + "#nav=dashboard")
            line = listing.locator("tr").filter(has_text="IGNIS").last
            line.locator('[title="Enabled"]').wait_for(timeout=25000)
            expect(line).to_contain_text(ver)
            for tab in c.pages:
                if tab != listing:
                    tab.close()
            for kind, url in [("reel", REEL), ("image", IMAGE)]:
                page = c.new_page()
                page.set_default_timeout(10000)
                record = {"kind": kind, "url": url, "downloadVerified": False}
                result["targets"].append(record)
                try:
                    resp = page.goto(url, wait_until="domcontentloaded", timeout=35000)
                    record["http"] = resp.status if resp else None
                    assert resp and resp.ok and urlsplit(page.url).path == urlsplit(url).path
                    buttons = page.locator(".ignis-rd:visible" if kind == "reel" else ".ignis-dl:visible")
                    buttons.first.wait_for(timeout=18000)
                    page.wait_for_timeout(1100)
                    x = page.locator(
                        '[role="dialog"] button:has(svg[aria-label="Close"]),[role="dialog"] [role="button"]:has(svg[aria-label="Close"])'
                    ).first
                    if x.count() and x.is_visible():
                        x.click(timeout=4500)
                    if kind == "reel":
                        eligible = buttons.evaluate_all(
                            """ns=>ns.map((b,i)=>{const h=b.parentElement,v=h.querySelector('video'),r=v?.getBoundingClientRect(),links=[...h.querySelectorAll('a[href]')].map(a=>a.pathname).filter(p=>/^\\/(?:p|reels?)\\/[^/]+/.test(p));return r&&r.top<innerHeight/2&&r.bottom>innerHeight/2&&r.right>0&&r.left<innerWidth&&(!links.length||links.includes(location.pathname))?i:-1}).filter(i=>i>=0)"""
                        )
                        assert len(eligible) == 1, "Ambiguous reel on this surface"
                        button = buttons.nth(eligible[0])
                    else:
                        assert buttons.count() == 1, "Ambiguous post toolbar"
                        buttons.click()
                        items = page.locator(".ignis-item .ig-act-dl")
                        items.first.wait_for()
                        record["offeredItems"] = items.count()
                        button = items.first
                    record["receivesPointer"] = button.evaluate(
                        "b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}"
                    )
                    assert record["receivesPointer"]
                    with page.expect_download(timeout=100000) as transfer:
                        button.click(timeout=8000)
                        record["clicked"] = True
                    download = transfer.value
                    name = "download-" + kind + Path(download.suggested_filename).suffix
                    destination = args.out / name
                    download.save_as(destination)
                    media = probe(destination)
                    streams = media["streams"]
                    video = next(s for s in streams if s["codec_type"] == "video")
                    assert video["width"] > 0 and video["height"] > 0
                    if kind == "reel":
                        assert (
                            any(s["codec_type"] == "audio" for s in streams)
                            and float(media["format"]["duration"]) > 0
                        )
                    subprocess.run(
                        [
                            "ffmpeg",
                            "-nostdin",
                            "-xerror",
                            "-v",
                            "error",
                            "-threads",
                            "1",
                            "-i",
                            str(destination),
                            "-f",
                            "null",
                            "-",
                        ],
                        check=True,
                        timeout=140,
                    )
                    record.update(
                        downloadVerified=True,
                        fullDecode=True,
                        media=name,
                        bytes=destination.stat().st_size,
                        width=video["width"],
                        height=video["height"],
                        codecs=[s["codec_name"] for s in streams],
                        duration=media["format"].get("duration"),
                        sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
                    )
                except Exception as e:
                    record["error"] = str(e).split("Call log:")[0][:300]
                finally:
                    page.close()
                    (args.out / "verified.json").write_text(json.dumps(result, indent=2) + "\n")
                print(kind, "decoded" if record["downloadVerified"] else "not verified", flush=True)
        finally:
            c.close()
    return 0 if len(result["targets"]) == 2 and all(r["downloadVerified"] for r in result["targets"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
