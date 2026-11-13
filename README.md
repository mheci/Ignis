# IGNIS

IGNIS is a userscript that downloads media straight from Instagram pages. One click saves posts, carousels, reels, stories, highlights, HD profile pictures, captions (.txt), and EXIF metadata. DASH video and audio are merged into a single MP4, so a download is always one file, not two.

It runs entirely in your browser. Network requests go only to Instagram and its CDN hosts.

> Personal project, experimental. Anything can change or break without notice.

## Install

1. Install a userscript manager: Tampermonkey, Violentmonkey, or Greasemonkey.
2. Open [this install link](https://github.com/mheci/Ignis/releases/latest/download/ignis.user.js) in the manager and confirm the install.

3. The script activates automatically on instagram.com pages.

Updates are automatic. The script declares `@updateURL`/`@downloadURL` pointing at that same link, so your manager compares the `@version` header and prompts you when a new build is out. Nothing installs without your confirmation.

## Features

- One-click downloads: posts, carousels, reels, stories, highlights
- Media browser for stories and highlights, with per-item selection
- Tagged-profile lookup for stories and highlights
- HD profile pictures and video thumbnails
- Captions exported as `.txt`
- EXIF metadata (artist, post URL, date) on photos
- DASH merge: highest-quality video plus audio in a single MP4, with fallback to the progressive MP4
- Direct download modes without dialogs, plus an external-download mode for very large files
- Configurable filename templates with a live preview editor
- IndexedDB-backed media and user-ID caches
- A local download-statistics dashboard (Settings, Statistics tab), stored only in your browser
- Command palette (Ctrl+K, Cmd+K, or Alt+K) for quick access to every action

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `S` | Download the focused post |
| `Alt+W` | Open settings |
| `Alt+T` | Show tagged profiles in stories/highlights |
| `Alt+S` | Download a story |
| `Ctrl+K` / `Cmd+K` / `Alt+K` | Command palette |
| `Alt+Z` | Debug view |
| `Alt+R` | Reload |
| `Shift+?` | Shortcut help |

Open Settings from the userscript manager menu or with `Alt+W`. The Downloads and Keyboard tabs hold most options; right-click the *Auto Rename Files* row in Settings to edit the filename template.

## Development

`src/` holds six ordered parts (userscript header, media detection, download engine, UI, page injection, boot). `build.js` concatenates them into the single `ignis.user.js`, stripping comments:

```sh
node build.js          # emits ./ignis.user.js
node --check ignis.user.js
```

`build.js` also accepts an output path as a second argument. A GitHub Actions workflow rebuilds the userscript on every push, and a release is published when the `@version` header changes.

## Disclaimer

This project is independent and unaffiliated with Instagram. All processing is local; network requests go only to Instagram and CDN hosts. Download content only when you have the right to do so.

## License

GPL-3.0-only - see [LICENSE](LICENSE).