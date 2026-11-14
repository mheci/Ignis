# IGNIS

IGNIS is a userscript for downloading media from Instagram pages. It saves posts, carousels, reels, stories, highlights, profile pictures, captions, and EXIF metadata. DASH video and audio are merged into one MP4.

It runs in your browser. Network requests go only to Instagram and its CDN hosts.

## Install

1. Install Tampermonkey, Violentmonkey, or Greasemonkey.
2. Open the [latest release](https://github.com/mheci/Ignis/releases/latest) and install `ignis.user.js`.
3. Open [instagram.com](https://www.instagram.com/).

If you installed an older build, reinstall from the latest release. The version reset to 1.0.0, so userscript managers will not offer it as an update.

The script declares `@updateURL` and `@downloadURL` in its header. Your manager compares `@version` and asks before installing a new build.

## Features

- Downloads for posts, carousels, reels, stories, and highlights.
- One MP4 for DASH video and audio.
- HD profile pictures and video thumbnails.
- Captions exported as `.txt`.
- EXIF metadata with the post URL, date, and author.
- Story and highlight media browser with per-item selection.
- Tagged-profile list for stories and highlights.
- Direct downloads, external download mode, and filename templates.
- IndexedDB cache for image URLs and user ids.
- Local download statistics.
- Command palette and configurable keyboard shortcuts.

## Use

A post toolbar offers download, open in new tab, download all, and thumbnail actions. Stories and highlights get a toolbar with download, browse, tagged profiles, and thumbnail actions.

Open Settings from the userscript manager menu or press `Alt+W`. The Downloads tab holds most options. The Keyboard tab rebinds hotkeys. The Statistics tab shows local counts. Click the Auto Rename Files row to edit the filename template.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `S` | Download the first post on the page |
| `Alt+W` | Open settings |
| `Alt+T` | Show tagged profiles |
| `Alt+S` | Download a story |
| `Ctrl+K`, `Cmd+K`, `Alt+K` | Command palette |
| `Alt+Z` | Debug view |
| `Alt+R` | Reload |
| `Shift+?` | Shortcut help |

Shortcuts are disabled while typing in a field.

## Development

`src/` holds six ordered parts. `build.js` joins them into `ignis.user.js`, strips comments, and normalizes line endings.

```sh
node build.js
node --check ignis.user.js
```

Run both before committing. The `Build and Release` workflow runs the same checks on every pull request and push to `main`. It fails when the committed `ignis.user.js` is stale. On `main`, a version change creates a stable release without release notes.

Dependabot checks GitHub Actions weekly. `main` requires the `build` check, linear history, and squash merges. Merged branches are deleted automatically.

## Privacy

IGNIS does not send data anywhere. Network requests go only to Instagram and its CDN hosts. Statistics and caches stay in your browser.

## Disclaimer

IGNIS is independent and unaffiliated with Instagram. Download only content you have the right to use.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
