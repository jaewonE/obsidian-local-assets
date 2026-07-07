# Local assets

[ [English](https://github.com/jaewonE/obsidian-local-assets) | [한국어](https://github.com/jaewonE/obsidian-local-assets/blob/master/README.ko.md) ]

![demo](https://github.com/jaewonE/obsidian-local-assets/blob/master/assets/demo.gif?raw=true)

Local assets keeps files referenced by your notes inside your Obsidian vault. It handles local drag/drop and paste files, then uses the same naming, destination, extension, and cache rules for manually downloaded remote assets.

## Features

- Save dropped or pasted local files with a shared `{note}-{n}.ext` naming pattern.
- Download remote images, PDFs, audio, and video from the current note, current folder, or all Markdown notes.
- Convert Markdown links, Markdown embeds, HTML media tags, raw URLs, and image data URIs into local links.
- Preserve link aliases and embed size metadata when enabled.
- Choose one of four attachment destinations: Obsidian default, same folder as note, vault root, or a custom folder.
- Reuse URL cache entries immediately, then validate remote content in the background and replace changed cached files with a notice.
- Disable cache entirely when every run should download again.
- Review skipped, failed, reused, downloaded, and planned items from the settings tab.

## Commands and Hotkeys

The plugin does not assign default hotkeys. You can assign shortcuts in Obsidian `Settings -> Hotkeys`.

- `Download assets for current note`: localize external assets in the active note.
- `Download assets for current folder`: localize external assets in Markdown notes next to the active note.
- `Download assets for all notes`: localize external assets across the vault.
- `Retry failed asset downloads`: retry URLs recorded as failed in the last operation for the active note.
- `Clear asset cache for current note`: remove URL cache entries still referenced by the active note.
- `Clear asset cache`: remove all URL-to-file mappings.

## Settings

- `Attachment folder`: `Use Obsidian default`, `Same folder as note`, `Vault root`, or `Custom folder`.
- `Allowed local extensions` and `Allowed remote extensions`: comma-separated extension allowlists.
- `Unknown extension fallback`: extension used when URL or content headers do not provide one.
- `Naming pattern`: file name template using `{note}` and `{n}`.
- `Use URL cache`: when enabled, cached files are inserted immediately and remote content is checked in the background; when disabled, metadata is ignored and the plugin downloads again.
- `Conflict strategy`: reuse existing cache with background validation, never overwrite existing cached files, or always create a new file.
- `Verify existing by hash`, `Verify existing by dimensions`, `Hash only when size differs`: local cache validation controls.
- `Max file size`, `Request timeout`, `Concurrency limit`: processing limits.
- `Include images`, `Include PDFs`, `Include audio`, `Include video`: asset type scope.
- `Dry-run preview`: plan downloads and link rewrites without writing files.
- `Include domains` and `Exclude domains`: optional domain filters.

## Development

- Install dependencies: `npm install`
- Lint: `npm run lint`
- Test: `npm test`
- Production build: `npm run build`

## Manual Installation

Copy these files into your vault plugin folder:

- `main.js`
- `manifest.json`
- `styles.css`

## Privacy and Network Access

Local assets runs inside your Obsidian vault. It makes network requests only after you manually run a remote asset command or use the ribbon button; cache background validation is part of that manual processing flow. The plugin does not include telemetry and does not read files outside the vault.

## License

GPL-3.0-only.
