import {
	MarkdownView,
	Notice,
	requestUrl,
	RequestUrlResponse,
	TFile,
	TFolder,
} from "obsidian";
import type LocalAssetSyncPlugin from "../main";
import {
	createRegistryEntry,
	tryReuseRegistryEntry,
} from "../services/cacheRegistry";
import { resolveAttachmentFolderPath } from "../services/attachmentPath";
import {
	detectAssetCategory,
	extensionSet,
	inferExtensionFromContentType,
	inferExtensionFromUrl,
	isCategoryEnabled,
	isDomainAllowed,
	normalizeExtension,
} from "../services/extensionPolicy";
import {
	allocateUniqueAssetPath,
	collectUsedStemsInFolder,
} from "../services/nameAllocator";
import {
	applyReplacements,
	buildDryRunMarkdownLink,
	buildReplacementMarkdown,
	extractExternalLinks,
	ExternalLinkMatch,
	LinkReplacement,
	linkAliasForMatch,
} from "./linkRewrite";
import { DownloadRegistryEntry, OperationLog } from "../settings/types";

interface LinkProcessResult {
	status: "downloaded" | "reused" | "skipped" | "failed";
	replacement?: LinkReplacement;
	registryEntry?: DownloadRegistryEntry;
	url: string;
	detail: string;
}

interface NoteProcessResult {
	file: TFile;
	updatedContent: string;
	changedContent: boolean;
	downloaded: number;
	reused: number;
	skipped: number;
	failed: number;
	registryUpdates: Record<string, DownloadRegistryEntry>;
	skipReasons: string[];
	details: string[];
	failedUrls: string[];
	skippedUrls: string[];
}

interface RemoteFetchSuccess {
	ok: true;
	arrayBuffer: ArrayBuffer;
	contentType: string | null;
	extension: string;
	etag: string | null;
	lastModified: string | null;
}

interface RemoteFetchFailure {
	ok: false;
	status: "skipped" | "failed";
	detail: string;
}

type RemoteFetchResult = RemoteFetchSuccess | RemoteFetchFailure;

export class RemoteDownloadFeature {
	private plugin: LocalAssetSyncPlugin;

	constructor(plugin: LocalAssetSyncPlugin) {
		this.plugin = plugin;
	}

	async processActiveNote(): Promise<void> {
		await this.processActiveMarkdownView("Asset processing");
	}

	async retryFailedAssetsForCurrentNote(): Promise<void> {
		const failedUrls = this.plugin.pluginData.lastRunLog?.failedUrls ?? [];
		if (failedUrls.length === 0) {
			new Notice("No failed remote assets are available to retry.");
			return;
		}
		await this.processActiveMarkdownView("Retry failed assets", new Set(failedUrls));
	}

	async processCurrentFolder(): Promise<void> {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (!(activeFile instanceof TFile)) {
			new Notice("Open a Markdown file first.");
			return;
		}

		const folder = activeFile.parent;
		if (!(folder instanceof TFolder)) {
			new Notice("Could not resolve the current folder.");
			return;
		}

		const files = folder.children.filter(
			(child): child is TFile => child instanceof TFile && child.extension === "md"
		);
		await this.processMarkdownFiles(files, "Current folder asset processing");
	}

	async processAllMarkdownNotes(): Promise<void> {
		await this.processMarkdownFiles(
			this.plugin.app.vault.getMarkdownFiles(),
			"Vault asset processing"
		);
	}

	async clearCacheForCurrentNote(): Promise<void> {
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || !activeView.file) {
			new Notice("Open a Markdown file first.");
			return;
		}

		const links = extractExternalLinks(activeView.editor.getValue());
		let cleared = 0;
		for (const link of links) {
			if (link.source === "remote" && this.plugin.pluginData.registry[link.url]) {
				delete this.plugin.pluginData.registry[link.url];
				cleared++;
			}
		}

		await this.plugin.savePluginData();
		new Notice(`Cleared ${cleared} cache entries referenced by the current note.`);
	}

	private async processActiveMarkdownView(
		label: string,
		urlFilter?: Set<string>
	): Promise<void> {
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || !activeView.file) {
			new Notice("Open a Markdown file first.");
			return;
		}

		if (!this.validateSettings()) {
			return;
		}

		const activeFile = activeView.file;
		const leaf = activeView.leaf;
		const viewState = leaf.getViewState();
		const originalMode = viewState.state?.mode;
		const wasPreview = originalMode === "preview";

		if (wasPreview && viewState.state) {
			viewState.state.mode = "source";
			await leaf.setViewState(viewState);
			await sleep(100);
		}

		try {
			const editor = activeView.editor;
			if (!editor) {
				new Notice("Could not access editor.");
				return;
			}

			const originalContent = editor.getValue();
			const result = await this.processNoteContent(activeFile, originalContent, urlFilter);
			if (!this.plugin.pluginData.settings.dryRunPreview && result.changedContent) {
				editor.setValue(result.updatedContent);
			}
			await this.finishProcessing([result], label);
		} finally {
			if (wasPreview && viewState.state) {
				viewState.state.mode = "preview";
				await leaf.setViewState(viewState);
			}
		}
	}

	private async processMarkdownFiles(files: TFile[], label: string): Promise<void> {
		if (files.length === 0) {
			new Notice("No Markdown files found.");
			return;
		}
		if (!this.validateSettings()) {
			return;
		}

		new Notice(`Local assets: processing ${files.length} notes...`, 5000);
		const results: NoteProcessResult[] = [];
		for (const file of files) {
			const originalContent = await this.plugin.app.vault.cachedRead(file);
			const result = await this.processNoteContent(file, originalContent);
			if (!this.plugin.pluginData.settings.dryRunPreview && result.changedContent) {
				await this.plugin.app.vault.modify(file, result.updatedContent);
			}
			results.push(result);
		}

		await this.finishProcessing(results, label);
	}

	private async processNoteContent(
		activeFile: TFile,
		originalContent: string,
		urlFilter?: Set<string>
	): Promise<NoteProcessResult> {
		const settings = this.plugin.pluginData.settings;
		const remoteAllowed = extensionSet(settings.allowedRemoteExtensions);
		const externalLinks = extractExternalLinks(originalContent).filter(
			(link) => !urlFilter || urlFilter.has(link.url)
		);

		if (externalLinks.length === 0) {
			return createEmptyNoteResult(activeFile, originalContent, "No external asset links found.");
		}

		const attachmentFolderPath = await resolveAttachmentFolderPath(
			this.plugin.app,
			activeFile,
			settings
		);
		const reservedStems = collectUsedStemsInFolder(this.plugin.app, attachmentFolderPath);
		const registryUpdates: Record<string, DownloadRegistryEntry> = {};

		const results = await mapWithConcurrency(
			externalLinks,
			settings.dryRunPreview ? 1 : settings.concurrencyLimit,
			(link) =>
				this.processSingleLink({
					link,
					activeFile,
					attachmentFolderPath,
					remoteAllowed,
					reservedStems,
					registryUpdates,
				})
		);

		const replacements: LinkReplacement[] = [];
		let downloaded = 0;
		let reused = 0;
		let skipped = 0;
		let failed = 0;
		const skipReasons: string[] = [];
		const details: string[] = [];
		const failedUrls: string[] = [];
		const skippedUrls: string[] = [];

		for (const result of results) {
			details.push(`${activeFile.path}: ${result.detail}`);
			if (result.status === "downloaded") {
				downloaded++;
				if (result.replacement) {
					replacements.push(result.replacement);
				}
			} else if (result.status === "reused") {
				reused++;
				if (result.replacement) {
					replacements.push(result.replacement);
				}
			} else if (result.status === "skipped") {
				skipped++;
				skipReasons.push(result.detail);
				skippedUrls.push(result.url);
			} else {
				failed++;
				failedUrls.push(result.url);
			}
		}

		const updatedContent =
			!settings.dryRunPreview && replacements.length > 0
				? applyReplacements(originalContent, replacements)
				: originalContent;

		return {
			file: activeFile,
			updatedContent,
			changedContent: updatedContent !== originalContent,
			downloaded,
			reused,
			skipped,
			failed,
			registryUpdates,
			skipReasons,
			details,
			failedUrls,
			skippedUrls,
		};
	}

	private async processSingleLink(params: {
		link: ExternalLinkMatch;
		activeFile: TFile;
		attachmentFolderPath: string;
		remoteAllowed: Set<string>;
		reservedStems: Set<string>;
		registryUpdates: Record<string, DownloadRegistryEntry>;
	}): Promise<LinkProcessResult> {
		const settings = this.plugin.pluginData.settings;
		const link = params.link;

		if (link.source === "data-uri") {
			return this.processDataUriLink(params);
		}

		if (!isDomainAllowed(link.url, settings.includeDomains, settings.excludeDomains)) {
			return {
				status: "skipped",
				url: link.url,
				detail: `Skipped (domain rule): ${link.url}`,
			};
		}

		const existing = settings.useCache ? this.plugin.pluginData.registry[link.url] : undefined;
		if (existing && settings.conflictStrategy !== "create-new") {
			const reuseResult =
				settings.conflictStrategy === "overwrite-never"
					? this.tryUseExistingFileWithoutValidation(existing)
					: await tryReuseRegistryEntry(this.plugin.app, existing, settings);

			if (reuseResult.reusable && reuseResult.file) {
				if (settings.conflictStrategy === "reuse-existing") {
					this.scheduleBackgroundRefresh({
						url: link.url,
						entry: existing,
						file: reuseResult.file,
						remoteAllowed: params.remoteAllowed,
					});
				}

				return {
					status: "reused",
					url: link.url,
					detail:
						settings.conflictStrategy === "overwrite-never"
							? `Reused cached asset without overwrite: ${link.url}`
							: `Reused cached asset and scheduled background validation: ${link.url}`,
					replacement: this.createReplacement(link, reuseResult.file, params.activeFile),
				};
			}
		}

		if (settings.dryRunPreview) {
			return this.planDryRunDownload(params);
		}

		const fetchResult = await this.fetchRemoteAsset(link.url, params.remoteAllowed);
		if (!fetchResult.ok) {
			return {
				status: fetchResult.status,
				url: link.url,
				detail: fetchResult.detail,
			};
		}

		try {
			const createdFile = await createBinaryWithAllocatedName(this.plugin, {
				activeFile: params.activeFile,
				attachmentFolderPath: params.attachmentFolderPath,
				reservedStems: params.reservedStems,
				extension: fetchResult.extension,
				arrayBuffer: fetchResult.arrayBuffer,
			});

			const registryEntry = await createRegistryEntry({
				app: this.plugin.app,
				sourceUrl: link.url,
				filePath: createdFile.path,
				arrayBuffer: fetchResult.arrayBuffer,
				contentType: fetchResult.contentType,
				etag: fetchResult.etag,
				lastModified: fetchResult.lastModified,
				settings,
			});
			params.registryUpdates[link.url] = registryEntry;

			return {
				status: "downloaded",
				url: link.url,
				detail: `Downloaded: ${link.url} -> ${createdFile.path}`,
				registryEntry,
				replacement: this.createReplacement(link, createdFile, params.activeFile),
			};
		} catch (error) {
			console.error("Local assets: failed to save downloaded asset", error);
			return {
				status: "failed",
				url: link.url,
				detail: `Failed (save error): ${link.url}`,
			};
		}
	}

	private async processDataUriLink(params: {
		link: ExternalLinkMatch;
		activeFile: TFile;
		attachmentFolderPath: string;
		remoteAllowed: Set<string>;
		reservedStems: Set<string>;
		registryUpdates: Record<string, DownloadRegistryEntry>;
	}): Promise<LinkProcessResult> {
		const settings = this.plugin.pluginData.settings;
		const link = params.link;
		const parsed = parseDataUri(link.url);
		if (!parsed) {
			return {
				status: "failed",
				url: link.url,
				detail: "Failed (invalid data URI).",
			};
		}

		const extension = normalizeExtension(
			inferExtensionFromContentType(parsed.contentType) ?? settings.unknownExtensionFallback
		);
		const validationError = this.validateResolvedExtension(
			extension,
			params.remoteAllowed,
			"data URI"
		);
		if (validationError) {
			return { status: "skipped", url: link.url, detail: validationError };
		}

		const maxBytes = settings.maxDownloadSizeMB * 1024 * 1024;
		if (parsed.arrayBuffer.byteLength > maxBytes) {
			return {
				status: "skipped",
				url: link.url,
				detail: "Skipped data URI (over size limit).",
			};
		}

		if (settings.dryRunPreview) {
			return this.planDryRunDownload({
				...params,
				link: {
					...link,
					url: "data-uri",
				},
			});
		}

		try {
			const createdFile = await createBinaryWithAllocatedName(this.plugin, {
				activeFile: params.activeFile,
				attachmentFolderPath: params.attachmentFolderPath,
				reservedStems: params.reservedStems,
				extension,
				arrayBuffer: parsed.arrayBuffer,
			});

			return {
				status: "downloaded",
				url: link.url,
				detail: `Converted data URI -> ${createdFile.path}`,
				replacement: this.createReplacement(link, createdFile, params.activeFile),
			};
		} catch (error) {
			console.error("Local assets: failed to save data URI asset", error);
			return {
				status: "failed",
				url: link.url,
				detail: "Failed (data URI save error).",
			};
		}
	}

	private planDryRunDownload(params: {
		link: ExternalLinkMatch;
		activeFile: TFile;
		attachmentFolderPath: string;
		remoteAllowed: Set<string>;
		reservedStems: Set<string>;
	}): LinkProcessResult {
		const settings = this.plugin.pluginData.settings;
		const urlExtension = params.link.source === "remote" ? inferExtensionFromUrl(params.link.url) : null;
		const simulatedExtension = normalizeExtension(
			urlExtension ?? settings.unknownExtensionFallback
		);
		const validationError = this.validateResolvedExtension(
			simulatedExtension,
			params.remoteAllowed,
			params.link.url
		);
		if (validationError) {
			return {
				status: "skipped",
				url: params.link.url,
				detail: `Skipped dry run: ${validationError}`,
			};
		}

		const allocation = allocateUniqueAssetPath({
			noteBasename: params.activeFile.basename,
			extension: simulatedExtension,
			namingPattern: settings.namingPattern,
			attachmentFolderPath: params.attachmentFolderPath,
			reservedStems: params.reservedStems,
		});
		return {
			status: "downloaded",
			url: params.link.url,
			detail: `Dry run planned: ${params.link.url} -> ${allocation.fileName}`,
			replacement: {
				startIndex: params.link.startIndex,
				endIndex: params.link.endIndex,
				replacementText: buildDryRunMarkdownLink(
					params.link,
					allocation.fileName,
					settings.preserveSizeOrAlias
				),
			},
		};
	}

	private async fetchRemoteAsset(
		url: string,
		remoteAllowed: Set<string>
	): Promise<RemoteFetchResult> {
		const settings = this.plugin.pluginData.settings;
		let response: RequestUrlResponse;
		try {
			response = await promiseWithTimeout(
				requestUrl({ url, throw: false }),
				settings.requestTimeoutMs
			);
		} catch (error) {
			return {
				ok: false,
				status: "failed",
				detail: `Failed (timeout or request error): ${url} (${String(error)})`,
			};
		}

		if (response.status < 200 || response.status >= 300) {
			return {
				ok: false,
				status: "failed",
				detail: `Failed (HTTP ${response.status}): ${url}`,
			};
		}

		const maxBytes = settings.maxDownloadSizeMB * 1024 * 1024;
		const contentLength = Number(getHeader(response, "content-length") ?? "0");
		if (Number.isFinite(contentLength) && contentLength > maxBytes) {
			return {
				ok: false,
				status: "skipped",
				detail: `Skipped (over size limit): ${url}`,
			};
		}

		const arrayBuffer = response.arrayBuffer;
		if (arrayBuffer.byteLength > maxBytes) {
			return {
				ok: false,
				status: "skipped",
				detail: `Skipped (downloaded file too large): ${url}`,
			};
		}

		const contentType = getHeader(response, "content-type");
		const inferredFromHeader = inferExtensionFromContentType(contentType);
		const inferredFromUrl = inferExtensionFromUrl(url);
		const resolvedExtension = normalizeExtension(
			inferredFromHeader ?? inferredFromUrl ?? settings.unknownExtensionFallback
		);
		const validationError = this.validateResolvedExtension(
			resolvedExtension,
			remoteAllowed,
			url
		);
		if (validationError) {
			return { ok: false, status: "skipped", detail: validationError };
		}

		return {
			ok: true,
			arrayBuffer,
			contentType,
			extension: resolvedExtension,
			etag: getHeader(response, "etag"),
			lastModified: getHeader(response, "last-modified"),
		};
	}

	private validateResolvedExtension(
		extension: string,
		remoteAllowed: Set<string>,
		sourceLabel: string
	): string | null {
		const settings = this.plugin.pluginData.settings;
		if (!remoteAllowed.has(extension)) {
			return `Skipped (extension '${extension}' not allowed): ${sourceLabel}`;
		}
		if (!isCategoryEnabled(extension, settings)) {
			return `Skipped (disabled type '${detectAssetCategory(extension)}'): ${sourceLabel}`;
		}
		return null;
	}

	private tryUseExistingFileWithoutValidation(entry: DownloadRegistryEntry): {
		reusable: boolean;
		file?: TFile;
	} {
		const maybeFile = this.plugin.app.vault.getAbstractFileByPath(entry.filePath);
		return maybeFile instanceof TFile ? { reusable: true, file: maybeFile } : { reusable: false };
	}

	private createReplacement(
		link: ExternalLinkMatch,
		file: TFile,
		activeFile: TFile
	): LinkReplacement {
		const settings = this.plugin.pluginData.settings;
		const alias = linkAliasForMatch(link, file.name, settings.preserveSizeOrAlias);
		const generated = this.plugin.app.fileManager.generateMarkdownLink(
			file,
			activeFile.path,
			undefined,
			alias || undefined
		);
		return {
			startIndex: link.startIndex,
			endIndex: link.endIndex,
			replacementText: buildReplacementMarkdown(link, generated, settings.preserveSizeOrAlias),
		};
	}

	private scheduleBackgroundRefresh(params: {
		url: string;
		entry: DownloadRegistryEntry;
		file: TFile;
		remoteAllowed: Set<string>;
	}): void {
		window.setTimeout(() => {
			void this.refreshCachedAssetInBackground(params);
		}, 1000);
	}

	private async refreshCachedAssetInBackground(params: {
		url: string;
		entry: DownloadRegistryEntry;
		file: TFile;
		remoteAllowed: Set<string>;
	}): Promise<void> {
		const currentFile = this.plugin.app.vault.getAbstractFileByPath(params.entry.filePath);
		if (!(currentFile instanceof TFile)) {
			return;
		}

		const fetchResult = await this.fetchRemoteAsset(params.url, params.remoteAllowed);
		if (!fetchResult.ok) {
			console.warn(`Local assets: background cache validation skipped: ${fetchResult.detail}`);
			return;
		}

		const currentBuffer = await this.plugin.app.vault.readBinary(currentFile);
		if (arrayBuffersEqual(currentBuffer, fetchResult.arrayBuffer)) {
			return;
		}

		await this.plugin.app.vault.modifyBinary(currentFile, fetchResult.arrayBuffer);
		const registryEntry = await createRegistryEntry({
			app: this.plugin.app,
			sourceUrl: params.url,
			filePath: currentFile.path,
			arrayBuffer: fetchResult.arrayBuffer,
			contentType: fetchResult.contentType,
			etag: fetchResult.etag,
			lastModified: fetchResult.lastModified,
			settings: this.plugin.pluginData.settings,
		});
		this.plugin.pluginData.registry[params.url] = registryEntry;
		await this.plugin.savePluginData();

		new Notice(`Local assets cache updated: ${currentFile.name}`, 8000);
	}

	private async finishProcessing(results: NoteProcessResult[], label: string): Promise<void> {
		const settings = this.plugin.pluginData.settings;
		let downloaded = 0;
		let reused = 0;
		let skipped = 0;
		let failed = 0;
		const registryUpdates: Record<string, DownloadRegistryEntry> = {};
		const skipReasons: string[] = [];
		const details: string[] = [];
		const failedUrls: string[] = [];
		const skippedUrls: string[] = [];

		for (const result of results) {
			downloaded += result.downloaded;
			reused += result.reused;
			skipped += result.skipped;
			failed += result.failed;
			Object.assign(registryUpdates, result.registryUpdates);
			skipReasons.push(...result.skipReasons);
			details.push(...result.details);
			failedUrls.push(...result.failedUrls);
			skippedUrls.push(...result.skippedUrls);
		}

		if (!settings.dryRunPreview && Object.keys(registryUpdates).length > 0) {
			this.plugin.pluginData.registry = {
				...this.plugin.pluginData.registry,
				...registryUpdates,
			};
		}

		const modeLabel = settings.dryRunPreview ? "Dry run" : label;
		const downloadedLabel = settings.dryRunPreview ? "Planned" : "Downloaded";
		const changedNotes = results.filter((result) => result.changedContent).length;
		const summary = `${modeLabel} complete. Notes changed: ${changedNotes}, ${downloadedLabel}: ${downloaded}, Reused: ${reused}, Skipped: ${skipped}, Failed: ${failed}`;
		new Notice(summary, 8000);

		const lastRunLog: OperationLog = {
			runAt: Date.now(),
			mode: settings.dryRunPreview ? "dry-run" : "execute",
			summary,
			skippedReasons: skipReasons.slice(0, 50),
			details: details.slice(0, 250),
			failedUrls: uniqueValues(failedUrls),
			skippedUrls: uniqueValues(skippedUrls),
			changedUrls: [],
		};
		this.plugin.pluginData.lastRunLog = lastRunLog;
		await this.plugin.savePluginData();
	}

	private validateSettings(): boolean {
		const settings = this.plugin.pluginData.settings;
		const localAllowed = extensionSet(settings.allowedLocalExtensions);
		if (localAllowed.size === 0) {
			new Notice("Allowed local extensions are empty. Fix settings before downloading assets.");
			return false;
		}

		const remoteAllowed = extensionSet(settings.allowedRemoteExtensions);
		if (remoteAllowed.size === 0) {
			new Notice("Allowed remote extensions are empty. Fix settings before downloading assets.");
			return false;
		}

		return true;
	}
}

async function createBinaryWithAllocatedName(
	plugin: LocalAssetSyncPlugin,
	params: {
		activeFile: TFile;
		attachmentFolderPath: string;
		reservedStems: Set<string>;
		extension: string;
		arrayBuffer: ArrayBuffer;
	}
): Promise<TFile> {
	let lastError: unknown = null;
	for (let attempt = 0; attempt < 8; attempt++) {
		const allocation = allocateUniqueAssetPath({
			noteBasename: params.activeFile.basename,
			extension: params.extension,
			namingPattern: plugin.pluginData.settings.namingPattern,
			attachmentFolderPath: params.attachmentFolderPath,
			reservedStems: params.reservedStems,
		});

		try {
			return await plugin.app.vault.createBinary(allocation.fullPath, params.arrayBuffer);
		} catch (error) {
			lastError = error;
			if (!String(error).toLowerCase().includes("exists")) {
				throw error;
			}
		}
	}
	throw lastError instanceof Error
		? lastError
		: new Error("Could not create a unique path for downloaded asset.");
}

function createEmptyNoteResult(
	file: TFile,
	content: string,
	detail: string
): NoteProcessResult {
	return {
		file,
		updatedContent: content,
		changedContent: false,
		downloaded: 0,
		reused: 0,
		skipped: 0,
		failed: 0,
		registryUpdates: {},
		skipReasons: [],
		details: [`${file.path}: ${detail}`],
		failedUrls: [],
		skippedUrls: [],
	};
}

function parseDataUri(dataUri: string): { arrayBuffer: ArrayBuffer; contentType: string | null } | null {
	const commaIndex = dataUri.indexOf(",");
	if (!dataUri.startsWith("data:") || commaIndex === -1) {
		return null;
	}

	const metadata = dataUri.slice(5, commaIndex);
	const payload = dataUri.slice(commaIndex + 1);
	const metadataParts = metadata.split(";").filter((part) => part.length > 0);
	const contentType = metadataParts[0]?.includes("/") ? metadataParts[0].toLowerCase() : null;
	const isBase64 = metadataParts.some((part) => part.toLowerCase() === "base64");

	try {
		if (isBase64) {
			const binary = window.atob(payload);
			const bytes = new Uint8Array(binary.length);
			for (let index = 0; index < binary.length; index++) {
				bytes[index] = binary.charCodeAt(index);
			}
			return { arrayBuffer: bytes.buffer, contentType };
		}

		const decoded = decodeURIComponent(payload);
		const bytes = new TextEncoder().encode(decoded);
		return { arrayBuffer: bytes.buffer, contentType };
	} catch {
		return null;
	}
}

function getHeader(response: RequestUrlResponse, key: string): string | null {
	const target = key.toLowerCase();
	for (const [headerKey, headerValue] of Object.entries(response.headers)) {
		if (headerKey.toLowerCase() === target) {
			return headerValue;
		}
	}
	return null;
}

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	const workerCount = Math.max(1, Math.min(limit, items.length));

	const workers = Array.from({ length: workerCount }, async () => {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex++;
			const item = items[currentIndex];
			if (item === undefined) {
				break;
			}
			results[currentIndex] = await mapper(item, currentIndex);
		}
	});

	await Promise.all(workers);
	return results;
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = window.setTimeout(() => {
			reject(new Error(`Request timed out after ${timeoutMs}ms.`));
		}, timeoutMs);

		promise
			.then((value) => {
				window.clearTimeout(timer);
				resolve(value);
			})
			.catch((error) => {
				window.clearTimeout(timer);
				reject(error instanceof Error ? error : new Error(String(error)));
			});
	});
}

function arrayBuffersEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
	if (left.byteLength !== right.byteLength) {
		return false;
	}

	const leftBytes = new Uint8Array(left);
	const rightBytes = new Uint8Array(right);
	for (let index = 0; index < leftBytes.length; index++) {
		if (leftBytes[index] !== rightBytes[index]) {
			return false;
		}
	}
	return true;
}

function uniqueValues(values: string[]): string[] {
	return Array.from(new Set(values));
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}
