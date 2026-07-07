# AGENTS.md - Local assets Runbook

## 1) Project snapshot

- Plugin: `Local assets`
- Type: Obsidian community plugin (`TypeScript` -> bundled `main.js`)
- Manifest id: `local-assets` (treat as stable unless explicit migration)
- Core purpose:
    - Local file rename/save on editor drag-drop and paste
    - Manual remote asset localization + link rewrite in current note

## 2) Non-negotiable invariants

1. Use one shared naming sequence for local + remote assets.
2. Use Obsidian-native attachment path resolution for both flows.
3. Always sanitize settings before save.
4. `unknownExtensionFallback` must be in `allowedLocalExtensions` when local list is non-empty.
5. Keep remote download manual-triggered by default (command/ribbon), not automatic.
6. Keep mobile compatibility unless explicitly changed (`isDesktopOnly: false`).
7. Keep command IDs stable:
    - `download-current-note-assets`
    - `clear-asset-cache`

## 3) Build and validation

```bash
npm install
npm run dev
npm run build
npm run lint
```

- `npm run build` is the required gate.
- If `npm run lint` fails due local eslint dependency issues, do not block functional verification.

## 4) Source map (authoritative)

```text
src/
  main.ts
  features/
    localDrop.ts
    remoteDownload.ts
    linkRewrite.ts
  services/
    attachmentPath.ts
    extensionPolicy.ts
    nameAllocator.ts
    cacheRegistry.ts
  settings/
    types.ts
    defaults.ts
    tab.ts
```

## 5) Ownership by file

### `src/main.ts`

- Lifecycle orchestration only.
- Registers settings tab, commands, ribbon, and local input hooks.
- Persists `PluginData` (`settings`, `registry`, `lastRunLog`).

### `src/features/localDrop.ts`

- Handles `editor-drop` and `editor-paste` local files.
- Filters by allowed extension/type rules.
- Saves with shared allocator and inserts links.

### `src/features/remoteDownload.ts`

- Manual remote link processing for active note.
- Applies domain/type/extension/size policies.
- Reuses cached assets when valid.
- Saves new assets + rewrites links + writes operation log.

### `src/features/linkRewrite.ts`

- Extracts external markdown links/embeds.
- Builds wiki-link replacements.
- Applies replacements safely by reverse index.

### `src/services/attachmentPath.ts`

- Resolves attachment folder via Obsidian behavior.
- Ensures folder exists when needed.

### `src/services/extensionPolicy.ts`

- Extension parsing/normalization/inference.
- Category and domain eligibility checks.
- Settings sanitization and fallback enforcement.

### `src/services/nameAllocator.ts`

- Collects used stems in target folder.
- Applies `{note}` / `{n}` naming template.
- Allocates unique path for both workflows.

### `src/services/cacheRegistry.ts`

- Validates whether cached file can be reused.
- Creates persisted metadata entries for downloads.

### `src/settings/*`

- `types.ts`: data contracts.
- `defaults.ts`: default settings.
- `tab.ts`: settings UI and data-reset actions.

## 6) Settings change protocol (must follow)

For any new setting, update all:

1. `src/settings/types.ts`
2. `src/settings/defaults.ts`
3. `src/services/extensionPolicy.ts` (sanitize/normalize as needed)
4. `src/settings/tab.ts`

Never write settings directly without passing through plugin update/sanitize flow.

## 7) Manual smoke test checklist

1. Local drop/paste: mixed allowed/disallowed extensions.
2. Unknown extension case: fallback applied correctly.
3. Shared numbering across local + remote in same folder.
4. Remote command: downloads + rewrites links in active markdown note.
5. Dry-run mode: reports/plans changes without writing files.
6. Domain include/exclude rules behave as configured.
7. Cache reuse behavior matches conflict strategy + verification toggles.
8. Editor mode restores correctly after remote processing.

## 8) Security and privacy constraints

- Local-first behavior.
- Network only for explicit remote asset localization.
- No telemetry.
- No remote code execution.
- No out-of-vault file access by plugin features.

## 9) Release essentials

1. Bump `manifest.json` version.
2. Update `versions.json` mapping.
3. Run `npm run build`.
4. Validate in vault plugin folder.
5. Release assets: `main.js`, `manifest.json`, `styles.css` (if used).

## 10) References

- Obsidian API: https://docs.obsidian.md
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Developer policies: https://docs.obsidian.md/Developer+policies
