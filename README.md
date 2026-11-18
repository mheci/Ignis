# IGNIS

IGNIS adds media download controls to Instagram posts, carousels, reels, stories, highlights, and profile pictures. It runs in the browser and uses the media available to your current session.

## Install

1. Install a userscript manager. Tampermonkey is the reference manager; allow user scripts if your browser asks.
2. Open the [latest stable installer](https://github.com/mheci/Ignis/releases/latest/download/ignis.user.js) and review the permissions in your manager.
3. Open [Instagram](https://www.instagram.com/). Open **Settings** from the manager menu or with `Alt+W`.

Automatic updates use the stable release channel, not a development branch. If you still have a build from before the version reset to 1.0.0 and your manager thinks it is newer, reinstall from the stable link once.

## Downloading

- **Posts and carousels:** Open **Download** to select items. Metadata is matched to the clicked post. If only the on-page media is available, the dialog says so; a direct “all” action asks before saving that incomplete list.
- **Stories and highlights:** Download the current item or use **Browse** to pick an item. **Tagged profiles** uses the same active-item selection as the download. Ignis does not guess the first story when the active one cannot be identified.
- **Reels and video:** Preview normally opens the offered progressive video. **Prefer DASH Manifest** can combine complete MP4 video and audio tracks without re-encoding. Segmented, protected, oversized or unsupported tracks are not assembled; an offered progressive file is used if available. The optional highest-video preview can be silent.
- **Photos, captions and filenames:** Image downloads keep their original pixels. Optional JPEG/WebP tagging adds author, publish date and post link when no EXIF block is present; existing EXIF and unrelated metadata are left alone. If a post has a caption, it can be saved as a UTF-8 `.txt` file. Click the **Auto Rename Files** label to edit the template. `%INDEX%` is the one-based source position, not the order in which you selected items.
- **Large files:** External download mode uses the manager's direct download API when it does not need to alter the file or add a caption. Muxing and tagging need memory. A batch reports saved, failed and skipped items and stops queuing when you leave the page. A browser-link download is a handoff; the script cannot observe a subsequent OS save-dialog cancellation.

### Shortcuts

| Default | Action |
| --- | --- |
| `S` | Download the focused post, or the most visible post, at its current slide |
| `Alt+W` | Settings |
| `Alt+S` | Download on the active story/highlight route |
| `Alt+T` | Tagged profiles |
| `Ctrl+K` / `Cmd+K` / `Alt+K` | Command palette |
| `Alt+Z` | Debug window |
| `Alt+R` | Reload Ignis controls |
| `Esc` / `Alt+Q` | Close the current dialog |
| `Shift+?` | Shortcut help |

The Keyboard tab rebinds settings, story and debug hotkeys and controls the optional shortcuts. Shortcuts do not intercept typing in site inputs, textareas, selects or editable fields.

## Requests and storage

Ignis has no telemetry or backend. Metadata requests stay on the Instagram page's origin and use the browser's existing session. Privileged media reads are limited to HTTPS on Instagram, `cdninstagram.com`, and `fbcdn.net` hosts. Media URLs are validated, not rewritten. A manager can also contact GitHub for installation/updates and the two SHA-256-pinned `@require` URLs for jQuery and Mediabunny.

Settings and optional statistics use manager storage. Bounded image-URL and user-ID caches prefer IndexedDB, with manager storage and then in-memory operation if storage is unavailable. Disabling **Track Download Statistics** stops new session and download counts; **Reset statistics** removes earlier counts. The **Fetch via Media API** toggle lets posts use page-only extraction; story lists, tags and HD avatar lookups can still require Instagram metadata. Login, permission, and rate-limit responses are not retried through another endpoint.

Instagram can change its markup and metadata endpoints independently. This is not a way to access private or protected media without permission. Download only content you have the right to use. Ignis is independent of Instagram.

## Development and verification

`src/part1.js` through `src/part6.js` are ordered fragments of one userscript closure. Edit the sources, then regenerate the checked-in installer. The build preserves comments, regexes and template literals and stamps the runtime version from the userscript header. No npm dependencies are required to build.

```sh
node build.js
node --check ignis.user.js
node --test tests/core.test.cjs
python3 tests/release_test.py
git diff --exit-code -- ignis.user.js # after staging/committing the generated bundle
```

The required `build` check also runs Chromium against deterministic page/API fixtures and decodes the files produced. See [verification and test instructions](docs/verification.md), including a separate real-manager smoke test. A successful push to `main` can publish a new stable version. PRs only test. The release job refuses version collisions, stale main runs and channel downgrades and compares the exact bytes at both public download URLs.

GPL-3.0-only. See [LICENSE](LICENSE).
