# Runtime and media verification

## What the repair caught

| Path | Reproduced failure | Regression check |
| --- | --- | --- |
| Manager startup | An enabled install could do nothing: the final `@require` ends in a semicolon-less conditional CommonJS export. Concatenation made the userscript IIFE part of that condition. | A leading statement separator, execution after document construction, and a fixture that concatenates the exact dependency bytes **without inserting a protective semicolon**. Separate installed-manager smoke below. |
| In-page reload | After a reload the toolbar was present but clicking it opened zero dialogs. | Reload twice, click once, require exactly one working dialog and three expected items. Navigate through login and replace the mount. |
| Keyboard settings | The manager’s hotkey menu opened Downloads. Clicking Keyboard revealed zero setting toggles. Rebinding a story used a key that boot did not read. | Deep-link to Keyboard, assert all three toggles, rebind and reload the document. Test Statistics, text fields and modified shortcuts. |
| Download identity | One visible photo could stand in for a whole carousel; previews rewrote signed hosts. Story/tag paths used different item-selection logic. | Match embedded/remote records to the shortcode; test partial DOM, virtualized slides, reused links, composite story IDs and timestamp-based highlights. |
| File handoff and transforms | Manager errors could count as successful saves. A DASH result could get a photo filename. Rewriting APP1 or an incorrectly padded WebP could discard metadata or produce invalid bytes. | Reject a handoff; inspect counters and batch totals. Compare decoded image pixels; inspect TIFF offsets, XMP and RIFF lengths. Demux and decode the actual merged file and verify both streams. |
| Release channel | An old or different installer containing the text `@version` could pass the public-channel check. | Exercise the release script against a local Git remote with no GitHub writes. Both published URLs must return the exact built bytes. |

## Automated checks

The browser suite executes the checked-in bundle with the real, digest-pinned jQuery and Mediabunny. Playwright intercepts *all* page/API/CDN traffic for the synthetic Instagram origin. Its GM boundary can reject, cancel or record a handoff. The Chromium suite is not a live Instagram test and is not a substitute for installing a manager.

On Linux x86-64, with Chrome/Chromium, FFmpeg/FFprobe, and Python 3.12 or 3.13:

```sh
node build.js && node --test tests/core.test.cjs
python3 tests/release_test.py
python3 -m venv .venv
.venv/bin/python -m pip install --only-binary=:all: --require-hashes -r tests/requirements-browser.txt
.venv/bin/python tests/browser.py --out /tmp/ignis-results
```

`--chrome /path/to/chrome` selects a browser. `--out` retains the actual JPEG, WebP, two-track MP4 and a JSON list of successful scenarios. The first run needs to fetch the two pinned dependencies; set `IGNIS_TEST_DEPS` to a private cache directory to reuse their checked bytes. The test images, half-second color video and tone are generated fixtures, not downloaded Instagram content.

The tests distinguish manager-reported completion from a browser download handoff. They cover the Promise-based `GM.*` adapter in addition to callback `GM_*` APIs, but do not claim that every manager/browser combination was installed and tested.

## Installed-manager smoke (optional)

Use Chrome for Testing and a local copy of the official Tampermonkey extension. The helper launches a **new temporary browser profile**, enables userscripts there, installs the exact local file through the extension's UI, verifies the enabled version, and requires a working toolbar. No page injection helper or GM stubs are used in this test. Only the post HTML and CDN media are synthetic.

```sh
xvfb-run -a .venv/bin/python tests/manager_smoke.py \
  --chrome /path/to/chrome-for-testing/chrome \
  --extension /path/to/unpacked/tampermonkey \
  --out /tmp/ignis-manager
```

On the candidate, Tampermonkey **5.5.1** in Chrome for Testing **158.0.8127.36** delivered a caption with matching bytes, a WebP with identical decoded pixels, and an MP4 containing H.264 **and** AAC. Settings and the post toolbar still worked after reload. The helper saves a screenshot and a receipt containing the installer SHA-256.

`--site` separately tries an unmodified signed-out login document. The verification environment could not load that document (`net::ERR_HTTP_RESPONSE_CODE_FAILURE`); **no live Instagram download or authenticated story, highlight, avatar or reel is certified here**. Before releasing, a maintainer can use their own normal browser session and media they own to confirm current Instagram markup and API responses. No credentials or session exports are required by these tests.
