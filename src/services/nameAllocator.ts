import { App } from "obsidian";
import { joinVaultPath } from "./attachmentPath";
import { normalizeExtension } from "./extensionPolicy";

export interface NameAllocationInput {
	noteBasename: string;
	extension: string;
	namingPattern: string;
	attachmentFolderPath: string;
	reservedStems: Set<string>;
}

export interface NameAllocationResult {
	stem: string;
	fileName: string;
	fullPath: string;
	counter: number;
}

export function collectUsedStemsInFolder(app: App, attachmentFolderPath: string): Set<string> {
	const usedStems = new Set<string>();
	for (const file of app.vault.getFiles()) {
		const parentPath = file.parent?.path ?? "";
		if (parentPath === attachmentFolderPath) {
			usedStems.add(file.basename);
		}
	}
	return usedStems;
}

export function allocateUniqueAssetPath(input: NameAllocationInput): NameAllocationResult {
	const safeExtension = normalizeExtension(input.extension);
	const safeBasename = sanitizeFileName(input.noteBasename) || "note";

	for (let counter = 1; counter <= 99999; counter++) {
		const stem = renderNameStem(input.namingPattern, safeBasename, counter);
		if (input.reservedStems.has(stem)) {
			continue;
		}

		input.reservedStems.add(stem);
		const fileName = `${stem}.${safeExtension}`;
		return {
			stem,
			fileName,
			fullPath: joinVaultPath(input.attachmentFolderPath, fileName),
			counter,
		};
	}

	throw new Error("Could not allocate a unique file name after 99999 attempts.");
}

export function renderNamingPreview(pattern: string, noteBasename: string): string {
	const safeBasename = sanitizeFileName(noteBasename) || "note";
	const previewStem = renderNameStem(pattern, safeBasename, 1);
	return `${previewStem}.png`;
}

function renderNameStem(pattern: string, noteBasename: string, counter: number): string {
	const withNote = pattern.split("{note}").join(noteBasename);
	const withTokens = withNote.split("{n}").join(String(counter));
	const sanitized = sanitizeFileName(withTokens).trim();
	if (!sanitized) {
		return `${noteBasename}-${counter}`;
	}
	return sanitized;
}

export function sanitizeFileName(value: string): string {
	return value
		.trim()
		.replace(/[\\/:*?"<>|#%&{}]/g, "_")
		.replace(/\[/g, "_")
		.replace(/\]/g, "_")
		.replace(/\s+/g, " ");
}
