# Changelog

## 1.3.0

- Added manual import support for Markdown local-file embeds and links using absolute paths, escaped paths, and Obsidian `app://` file paths.
- Applied the existing attachment destination, naming, allowed type, and size-limit rules when importing supported local files into the vault.
- Documented the explicit local-path access used by the desktop import workflow in English and Korean.

## 1.2.0

- Added configurable attachment destinations: Obsidian default, same folder as note, vault root, and custom folder.
- Added explicit URL cache control with background remote validation for reused cache entries.
- Added current-folder, all-notes, retry-failed, and current-note cache clearing commands.
- Improved link extraction for Markdown links, Markdown embeds, HTML media tags, raw URLs, data URI images, and code block exclusion.
- Improved local drop/paste handling for skipped files, file size limits, and operation logging.
- Added operation report copying, pure service tests, updated bilingual documentation, and the standard root `styles.css` release asset.

## 1.1.0

- Initial GitHub release of Local assets.
- Added local drop and paste asset saving with shared note-based naming.
- Added manual remote asset localization for images, PDFs, audio, and video.
- Added cache-aware link rewriting, dry-run preview, domain filters, and download controls.
- Added English and Korean documentation, demo asset, and GPL-3.0-only licensing.
