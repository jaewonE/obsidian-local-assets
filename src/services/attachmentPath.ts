import { App, TFile, normalizePath } from "obsidian";

export async function resolveAttachmentFolderPath(app: App, noteFile: TFile): Promise<string> {
	const dummyName = `local-assets-${Date.now()}.tmp`;
	const dummyPath = await app.fileManager.getAvailablePathForAttachment(dummyName, noteFile.path);
	const folderPath = dirname(dummyPath);
	const normalizedFolder = folderPath === "." || folderPath === "/" ? "" : normalizePath(folderPath);

	if (normalizedFolder.length > 0) {
		await ensureFolderExists(app, normalizedFolder);
	}

	return normalizedFolder;
}

export function joinVaultPath(folderPath: string, fileName: string): string {
	if (!folderPath) {
		return normalizePath(fileName);
	}
	return normalizePath(`${folderPath}/${fileName}`);
}

function dirname(filePath: string): string {
	const normalized = normalizePath(filePath);
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash === -1) {
		return ".";
	}
	if (lastSlash === 0) {
		return "/";
	}
	return normalized.slice(0, lastSlash);
}

async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	if (await app.vault.adapter.exists(folderPath)) {
		return;
	}

	const segments = folderPath.split("/").filter((segment) => segment.length > 0);
	let current = "";
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		if (!(await app.vault.adapter.exists(current))) {
			await app.vault.createFolder(current);
		}
	}
}
