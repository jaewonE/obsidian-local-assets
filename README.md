# Local assets

[ [English](https://github.com/jaewonE/obsidian-local-assets) | [한국어](https://github.com/jaewonE/obsidian-local-assets/blob/master/README.ko.md) ]

![demo](https://github.com/jaewonE/obsidian-local-assets/blob/master/assets/demo.gif?raw=true)

Local assets is an Obsidian plugin that unifies two workflows into one consistent system:
- Rename and save local files added by drag/drop or paste.
- Download remote assets (images, PDF, audio, video) in the current note and convert links to local wikilinks.

It uses one shared naming policy, one attachment-path policy, and one extension policy to prevent conflicts.

## Core behavior

- Local drop/paste files are saved with a shared pattern like `{note}-{n}.ext`.
- Remote links are processed manually through a command or ribbon button.
- Remote assets are cached by URL and can be reused based on settings.
- Link rewrites preserve embed size/alias metadata when enabled.
- Unknown extension fallback is validated against allowed local extensions.

## Commands

- `download-current-note-assets`: Download and localize remote assets in the active note.
- `clear-asset-cache`: Clear cached URL-to-file mappings.

## Main settings

- `allowedLocalExtensions`: Extensions allowed for local drop/paste.
- `allowedRemoteExtensions`: Extensions allowed for remote downloads.
- `unknownExtensionFallback`: Used when extension inference fails. Must be in `allowedLocalExtensions`.
- `namingPattern`: Filename template with `{note}` and `{n}` tokens.
- `preserveSizeOrAlias`: Preserve `|width` or alias metadata on rewritten links.
- `verifyExistingByHash`, `verifyExistingByDimensions`, `hashOnlyWhenSizeDiffers`: Cache reuse verification behavior.
- `includeImages`, `includePdf`, `includeAudio`, `includeVideo`: Type scope toggles.
- `dryRunPreview`: Preview rewrite and naming behavior without writing files.
- `conflictStrategy`: `reuse-existing`, `overwrite-never`, or `create-new`.
- `includeDomains`, `excludeDomains`: Domain allow/deny filtering for remote downloads.
- `maxDownloadSizeMB`, `requestTimeoutMs`, `concurrencyLimit`: Download controls.

## Architecture

- `src/main.ts`: Plugin lifecycle, command registration, settings persistence, ribbon setup.
- `src/features/localDrop.ts`: Handles `editor-drop` and `editor-paste` for local files.
- `src/features/remoteDownload.ts`: Manual remote asset processing and link rewrites.
- `src/features/linkRewrite.ts`: External-link parsing and replacement helpers.
- `src/services/attachmentPath.ts`: Obsidian-native attachment folder resolution.
- `src/services/nameAllocator.ts`: Shared filename allocation and naming preview.
- `src/services/extensionPolicy.ts`: Extension parsing, validation, domain and type filtering.
- `src/services/cacheRegistry.ts`: Cache verification and metadata generation.
- `src/settings/*`: Types, defaults, and settings tab UI.

## Development

- Install dependencies: `npm install`
- Watch mode: `npm run dev`
- Production build: `npm run build`
- Lint: `npm run lint`

## Manual test checklist

- Drop and paste local files with mixed allowed/disallowed extensions.
- Run remote download command on notes containing image/PDF/audio/video links.
- Confirm naming sequence is shared across local and remote workflows.
- Confirm unknown-extension URLs use fallback extension.
- Toggle dry-run and verify no files are written in dry-run mode.

## Release artifacts

Copy these files into your vault plugin folder:
- `main.js`
- `manifest.json`

## Privacy and network access

Local assets runs inside your Obsidian vault. It only makes network requests when you manually run the remote asset download command or click the ribbon button. It does not include telemetry and does not read files outside the vault.

## License

GPL-3.0-only.
