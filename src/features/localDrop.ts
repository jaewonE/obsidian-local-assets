import {
	Editor,
	MarkdownFileInfo,
	MarkdownView,
	Notice,
	TFile,
} from "obsidian";
import type LocalAssetSyncPlugin from "../main";
import { resolveAttachmentFolderPath } from "../services/attachmentPath";
import {
	extensionSet,
	inferExtensionFromFilename,
	isCategoryEnabled,
	normalizeExtension,
} from "../services/extensionPolicy";
import {
	allocateUniqueAssetPath,
	collectUsedStemsInFolder,
} from "../services/nameAllocator";

export function registerLocalDropFeature(plugin: LocalAssetSyncPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on("editor-drop", async (evt, editor, info) => {
			const files = getFilesFromDragEvent(evt);
			await handleLocalFileInput(plugin, evt, editor, info, files);
		})
	);

	plugin.registerEvent(
		plugin.app.workspace.on("editor-paste", async (evt, editor, info) => {
			const files = getFilesFromClipboardEvent(evt);
			await handleLocalFileInput(plugin, evt, editor, info, files);
		})
	);
}

async function handleLocalFileInput(
	plugin: LocalAssetSyncPlugin,
	event: DragEvent | ClipboardEvent,
	editor: Editor,
	info: MarkdownView | MarkdownFileInfo,
	files: File[]
): Promise<void> {
	if (files.length === 0) {
		return;
	}

	const activeFile = getActiveFile(info);
	if (!activeFile) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	const settings = plugin.pluginData.settings;
	const allowedLocal = extensionSet(settings.allowedLocalExtensions);
	if (allowedLocal.size === 0) {
		new Notice("Allowed local extensions are empty. Update settings before dropping or pasting files.");
		return;
	}

	const maxBytes = settings.maxDownloadSizeMB * 1024 * 1024;
	const planned: Array<{ file: File; extension: string }> = [];
	const skippedReasons: string[] = [];

	for (const file of files) {
		const fromName = inferExtensionFromFilename(file.name);
		const resolvedExtension = normalizeExtension(fromName ?? settings.unknownExtensionFallback);
		if (!resolvedExtension) {
			skippedReasons.push(`Skipped local file '${file.name}' (missing extension).`);
			continue;
		}
		if (!allowedLocal.has(resolvedExtension)) {
			skippedReasons.push(
				`Skipped local file '${file.name}' (disallowed extension '${resolvedExtension}').`
			);
			continue;
		}
		if (!isCategoryEnabled(resolvedExtension, settings)) {
			skippedReasons.push(`Skipped local file '${file.name}' (asset type disabled).`);
			continue;
		}
		if (file.size > maxBytes) {
			skippedReasons.push(`Skipped local file '${file.name}' (over size limit).`);
			continue;
		}
		planned.push({ file, extension: resolvedExtension });
	}

	if (planned.length === 0) {
		new Notice(`No local files were imported. Skipped: ${skippedReasons.length}`);
		plugin.pluginData.lastRunLog = {
			runAt: Date.now(),
			mode: "execute",
			summary: `Local file import complete. Created: 0, Skipped: ${skippedReasons.length}, Failed: 0`,
			skippedReasons: skippedReasons.slice(0, 50),
			details: skippedReasons.slice(0, 200),
			skippedUrls: [],
			failedUrls: [],
		};
		await plugin.savePluginData();
		return;
	}

	const attachmentFolderPath = await resolveAttachmentFolderPath(plugin.app, activeFile, settings);
	const reservedStems = collectUsedStemsInFolder(plugin.app, attachmentFolderPath);
	const createdLinks: string[] = [];
	let createdCount = 0;
	let failedCount = 0;
	const details: string[] = [...skippedReasons];

	for (const item of planned) {
		try {
			const data = await item.file.arrayBuffer();
			const createdFile = await createBinaryWithAllocatedName(plugin, {
				activeFile,
				attachmentFolderPath,
				reservedStems,
				extension: item.extension,
				data,
			});
			createdLinks.push(plugin.app.fileManager.generateMarkdownLink(createdFile, activeFile.path));
			createdCount++;
			details.push(`Imported local file '${item.file.name}' -> ${createdFile.path}`);
		} catch (error) {
			console.error("Local assets: failed to process local file", error);
			details.push(`Failed local file '${item.file.name}': ${String(error)}`);
			failedCount++;
		}
	}

	if (createdLinks.length > 0) {
		editor.replaceSelection(createdLinks.join("\n"));
	}

	if (createdCount > 0 || failedCount > 0) {
		new Notice(
			`Local files processed. Created: ${createdCount}, Skipped: ${skippedReasons.length}, Failed: ${failedCount}`
		);
	}

	plugin.pluginData.lastRunLog = {
		runAt: Date.now(),
		mode: "execute",
		summary: `Local file import complete. Created: ${createdCount}, Skipped: ${skippedReasons.length}, Failed: ${failedCount}`,
		skippedReasons: skippedReasons.slice(0, 50),
		details: details.slice(0, 200),
		skippedUrls: [],
		failedUrls: [],
	};
	await plugin.savePluginData();
}

function getActiveFile(info: MarkdownView | MarkdownFileInfo): TFile | null {
	const maybeFile = (info as MarkdownView).file ?? (info as MarkdownFileInfo).file;
	return maybeFile instanceof TFile ? maybeFile : null;
}

function getFilesFromDragEvent(event: DragEvent): File[] {
	if (!event.dataTransfer) {
		return [];
	}
	const files: File[] = [];
	for (const item of Array.from(event.dataTransfer.items)) {
		if (item.kind !== "file") {
			continue;
		}
		const file = item.getAsFile();
		if (file) {
			files.push(file);
		}
	}
	return files;
}

function getFilesFromClipboardEvent(event: ClipboardEvent): File[] {
	if (!event.clipboardData) {
		return [];
	}
	const files: File[] = [];
	for (const item of Array.from(event.clipboardData.items)) {
		if (item.kind !== "file") {
			continue;
		}
		const file = item.getAsFile();
		if (file) {
			files.push(file);
		}
	}
	return files;
}

async function createBinaryWithAllocatedName(
	plugin: LocalAssetSyncPlugin,
	params: {
		activeFile: TFile;
		attachmentFolderPath: string;
		reservedStems: Set<string>;
		extension: string;
		data: ArrayBuffer;
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
			const created = await plugin.app.vault.createBinary(allocation.fullPath, params.data);
			return created;
		} catch (error) {
			lastError = error;
			if (!isPathExistsError(error)) {
				throw error;
			}
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error("Could not create a unique local file path.");
}

function isPathExistsError(error: unknown): boolean {
	return String(error).toLowerCase().includes("exists");
}
