import {
	MarkdownView,
	Notice,
	requestUrl,
	RequestUrlResponse,
	TFile,
} from "obsidian";
import type LocalAssetSyncPlugin from "../main";
import { createRegistryEntry, tryReuseRegistryEntry } from "../services/cacheRegistry";
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
	buildReplacementMarkdown,
	extractExternalLinks,
	ExternalLinkMatch,
	LinkReplacement,
} from "./linkRewrite";
import { DownloadRegistryEntry, OperationLog } from "../settings/types";

interface LinkProcessResult {
	status: "downloaded" | "reused" | "skipped" | "failed";
	replacement?: LinkReplacement;
	registryEntry?: DownloadRegistryEntry;
	url: string;
	detail: string;
}

export class RemoteDownloadFeature {
	private plugin: LocalAssetSyncPlugin;

	constructor(plugin: LocalAssetSyncPlugin) {
		this.plugin = plugin;
	}

	async processActiveNote(): Promise<void> {
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || !activeView.file) {
			new Notice("Open a Markdown file first.");
			return;
		}
		const activeFile = activeView.file;

		const settings = this.plugin.pluginData.settings;
		const localAllowed = extensionSet(settings.allowedLocalExtensions);
		if (localAllowed.size === 0) {
			new Notice("Allowed local extensions are empty. Fix settings before downloading assets.");
			return;
		}

		const remoteAllowed = extensionSet(settings.allowedRemoteExtensions);
		if (remoteAllowed.size === 0) {
			new Notice("Allowed remote extensions are empty. Fix settings before downloading assets.");
			return;
		}

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
			const externalLinks = extractExternalLinks(originalContent);
			if (externalLinks.length === 0) {
				new Notice("No external links found in the current note.");
				return;
			}

			const attachmentFolderPath = await resolveAttachmentFolderPath(this.plugin.app, activeFile);
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

			for (const result of results) {
				details.push(result.detail);
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
				} else {
					failed++;
				}
			}

			if (!settings.dryRunPreview && replacements.length > 0) {
				editor.setValue(applyReplacements(originalContent, replacements));
			}

			if (!settings.dryRunPreview && downloaded > 0) {
				this.plugin.pluginData.registry = {
					...this.plugin.pluginData.registry,
					...registryUpdates,
				};
			}

			const modeLabel = settings.dryRunPreview ? "Dry run" : "Asset processing";
			const downloadedLabel = settings.dryRunPreview ? "Planned" : "Downloaded";
			const summary = `${modeLabel} complete. ${downloadedLabel}: ${downloaded}, Reused: ${reused}, Skipped: ${skipped}, Failed: ${failed}`;
			new Notice(summary, 7000);

			const lastRunLog: OperationLog = {
				runAt: Date.now(),
				mode: settings.dryRunPreview ? "dry-run" : "execute",
				summary,
				skippedReasons: skipReasons.slice(0, 50),
				details: details.slice(0, 200),
			};
			this.plugin.pluginData.lastRunLog = lastRunLog;
			await this.plugin.savePluginData();
			} finally {
			if (wasPreview && viewState.state) {
				viewState.state.mode = "preview";
				await leaf.setViewState(viewState);
			}
		}
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

		if (!isDomainAllowed(link.url, settings.includeDomains, settings.excludeDomains)) {
			return {
				status: "skipped",
				url: link.url,
				detail: `Skipped (domain rule): ${link.url}`,
			};
		}

		const urlExtension = inferExtensionFromUrl(link.url);
		if (urlExtension) {
			if (!params.remoteAllowed.has(urlExtension)) {
				return {
					status: "skipped",
					url: link.url,
					detail: `Skipped (disallowed extension '${urlExtension}'): ${link.url}`,
				};
			}
			if (!isCategoryEnabled(urlExtension, settings)) {
				return {
					status: "skipped",
					url: link.url,
					detail: `Skipped (disabled type '${detectAssetCategory(urlExtension)}'): ${link.url}`,
				};
			}
		}

		const existing = this.plugin.pluginData.registry[link.url];
		if (existing && settings.conflictStrategy !== "create-new") {
			if (settings.conflictStrategy === "overwrite-never") {
				const existingFile = this.plugin.app.vault.getAbstractFileByPath(existing.filePath);
				if (existingFile instanceof TFile) {
					return {
						status: "reused",
						url: link.url,
						detail: `Reused (overwrite-never): ${link.url}`,
						replacement: {
							startIndex: link.startIndex,
							endIndex: link.endIndex,
							replacementText: buildReplacementMarkdown(
								link,
								existingFile.name,
								settings.preserveSizeOrAlias
							),
						},
					};
				}
			}

			const reuseResult = await tryReuseRegistryEntry(this.plugin.app, existing, settings);
			if (reuseResult.reusable && reuseResult.file) {
				return {
					status: "reused",
					url: link.url,
					detail: `Reused cached asset: ${link.url}`,
					replacement: {
						startIndex: link.startIndex,
						endIndex: link.endIndex,
						replacementText: buildReplacementMarkdown(
							link,
							reuseResult.file.name,
							settings.preserveSizeOrAlias
						),
					},
				};
			}
		}

		if (settings.dryRunPreview) {
			const simulatedExtension = normalizeExtension(urlExtension ?? settings.unknownExtensionFallback);
			if (!params.remoteAllowed.has(simulatedExtension)) {
				return {
					status: "skipped",
					url: link.url,
					detail: `Skipped dry run (disallowed extension '${simulatedExtension}'): ${link.url}`,
				};
			}
			if (!isCategoryEnabled(simulatedExtension, settings)) {
				return {
					status: "skipped",
					url: link.url,
					detail: `Skipped dry run (disabled type '${detectAssetCategory(simulatedExtension)}'): ${link.url}`,
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
				url: link.url,
				detail: `Dry run planned: ${link.url} -> ${allocation.fileName}`,
				replacement: {
					startIndex: link.startIndex,
					endIndex: link.endIndex,
					replacementText: buildReplacementMarkdown(
						link,
						allocation.fileName,
						settings.preserveSizeOrAlias
					),
				},
			};
		}

		let response: RequestUrlResponse;
		try {
			response = await promiseWithTimeout(
				requestUrl({ url: link.url, throw: false }),
				settings.requestTimeoutMs
			);
		} catch (error) {
			return {
				status: "failed",
				url: link.url,
				detail: `Failed (timeout or request error): ${link.url} (${String(error)})`,
			};
		}

		if (response.status < 200 || response.status >= 300) {
			return {
				status: "failed",
				url: link.url,
				detail: `Failed (HTTP ${response.status}): ${link.url}`,
			};
		}

		const maxBytes = settings.maxDownloadSizeMB * 1024 * 1024;
		const contentLength = Number(getHeader(response, "content-length") ?? "0");
		if (Number.isFinite(contentLength) && contentLength > maxBytes) {
			return {
				status: "skipped",
				url: link.url,
				detail: `Skipped (over size limit): ${link.url}`,
			};
		}

		const arrayBuffer = response.arrayBuffer;
		if (arrayBuffer.byteLength > maxBytes) {
			return {
				status: "skipped",
				url: link.url,
				detail: `Skipped (downloaded file too large): ${link.url}`,
			};
		}

		const contentType = getHeader(response, "content-type");
		const inferredFromHeader = inferExtensionFromContentType(contentType);
		const resolvedExtension = normalizeExtension(
			inferredFromHeader ?? urlExtension ?? settings.unknownExtensionFallback
		);

		if (!params.remoteAllowed.has(resolvedExtension)) {
			return {
				status: "skipped",
				url: link.url,
				detail: `Skipped (extension '${resolvedExtension}' not allowed): ${link.url}`,
			};
		}
		if (!isCategoryEnabled(resolvedExtension, settings)) {
			return {
				status: "skipped",
				url: link.url,
				detail: `Skipped (asset type disabled): ${link.url}`,
			};
		}

		try {
			const createdFile = await createBinaryWithAllocatedName(this.plugin, {
				activeFile: params.activeFile,
				attachmentFolderPath: params.attachmentFolderPath,
				reservedStems: params.reservedStems,
				extension: resolvedExtension,
				arrayBuffer,
			});

			const registryEntry = await createRegistryEntry({
				app: this.plugin.app,
				sourceUrl: link.url,
				filePath: createdFile.path,
				arrayBuffer,
				contentType,
				settings,
			});
			params.registryUpdates[link.url] = registryEntry;

			return {
				status: "downloaded",
				url: link.url,
				detail: `Downloaded: ${link.url} -> ${createdFile.name}`,
				registryEntry,
				replacement: {
					startIndex: link.startIndex,
					endIndex: link.endIndex,
					replacementText: buildReplacementMarkdown(
						link,
						createdFile.name,
						settings.preserveSizeOrAlias
					),
				},
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

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}
