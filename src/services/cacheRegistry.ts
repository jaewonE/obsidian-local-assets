import { App, TFile } from "obsidian";
import { DownloadRegistryEntry, IntegratedSettings } from "../settings/types";
import { inferExtensionFromContentType } from "./extensionPolicy";

interface ReuseResult {
	reusable: boolean;
	file?: TFile;
	reason?: string;
}

export async function tryReuseRegistryEntry(
	app: App,
	entry: DownloadRegistryEntry,
	settings: IntegratedSettings
): Promise<ReuseResult> {
	const maybeFile = app.vault.getAbstractFileByPath(entry.filePath);
	if (!(maybeFile instanceof TFile)) {
		return { reusable: false, reason: "cached file missing" };
	}

	const file = maybeFile;
	const sizeChanged = file.stat.size !== entry.size;
	if (sizeChanged && !settings.verifyExistingByHash) {
		return { reusable: false, reason: "file size changed" };
	}
	if (sizeChanged && !settings.hashOnlyWhenSizeDiffers) {
		return { reusable: false, reason: "file size changed" };
	}

	if (!settings.verifyExistingByHash && !settings.verifyExistingByDimensions) {
		return { reusable: true, file };
	}

	const buffer = await app.vault.readBinary(file);

	if (settings.verifyExistingByDimensions && entry.width && entry.height) {
		const mimeType = contentTypeForFile(file, entry.contentType);
		if (mimeType.startsWith("image/")) {
			try {
				const dimensions = await getImageDimensions(buffer, mimeType);
				if (
					dimensions.width !== entry.width ||
					dimensions.height !== entry.height
				) {
					return { reusable: false, reason: "image dimensions changed" };
				}
			} catch {
				return { reusable: false, reason: "failed to validate image dimensions" };
			}
		}
	}

	if (settings.verifyExistingByHash && entry.hash) {
		const sameSize = file.stat.size === entry.size;
		if (!settings.hashOnlyWhenSizeDiffers || !sameSize) {
			const hash = await sha256(buffer);
			if (hash !== entry.hash) {
				return { reusable: false, reason: "content hash changed" };
			}
		}
	}

	return { reusable: true, file };
}

export async function createRegistryEntry(params: {
	app: App;
	sourceUrl: string;
	filePath: string;
	arrayBuffer: ArrayBuffer;
	contentType: string | null;
	etag?: string | null;
	lastModified?: string | null;
	settings: IntegratedSettings;
}): Promise<DownloadRegistryEntry> {
	const entry: DownloadRegistryEntry = {
		sourceUrl: params.sourceUrl,
		filePath: params.filePath,
		size: params.arrayBuffer.byteLength,
		contentType: params.contentType ?? undefined,
		etag: params.etag ?? undefined,
		lastModified: params.lastModified ?? undefined,
		savedAt: Date.now(),
	};

	if (params.settings.verifyExistingByHash) {
		entry.hash = await sha256(params.arrayBuffer);
	}

	if (params.settings.verifyExistingByDimensions) {
		const mimeType = normalizedContentType(params.contentType);
		if (mimeType?.startsWith("image/")) {
			try {
				const { width, height } = await getImageDimensions(params.arrayBuffer, mimeType);
				entry.width = width;
				entry.height = height;
			} catch {
				// Dimensions are optional for non-standard image files.
			}
		}
	}

	return entry;
}

function contentTypeForFile(file: TFile, storedContentType?: string): string {
	const fromStored = normalizedContentType(storedContentType ?? null);
	if (fromStored) {
		return fromStored;
	}
	const ext = file.extension.toLowerCase();
	if (ext === "svg") {
		return "image/svg+xml";
	}
	if (ext === "pdf") {
		return "application/pdf";
	}
	const inferred = inferExtensionFromContentType(storedContentType ?? null);
	if (inferred) {
		return guessedMimeFromExtension(inferred);
	}
	return `image/${ext}`;
}

function normalizedContentType(contentType: string | null): string | null {
	if (!contentType) {
		return null;
	}
	const baseToken = contentType.split(";")[0];
	if (!baseToken) {
		return null;
	}
	return baseToken.trim().toLowerCase();
}

function guessedMimeFromExtension(extension: string): string {
	switch (extension) {
		case "pdf":
			return "application/pdf";
		case "svg":
			return "image/svg+xml";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "gif":
			return "image/gif";
		case "webp":
			return "image/webp";
		case "bmp":
			return "image/bmp";
		case "tif":
		case "tiff":
			return "image/tiff";
		case "mp3":
			return "audio/mpeg";
		case "wav":
			return "audio/wav";
		case "ogg":
			return "audio/ogg";
		case "m4a":
			return "audio/mp4";
		case "mp4":
			return "video/mp4";
		case "webm":
			return "video/webm";
		case "ogv":
			return "video/ogg";
		case "mov":
			return "video/quicktime";
		case "mkv":
			return "video/x-matroska";
		default:
			return "application/octet-stream";
	}
}

export async function sha256(buffer: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	const bytes = new Uint8Array(digest);
	return Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function getImageDimensions(
	buffer: ArrayBuffer,
	mimeType: string
): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const blob = new Blob([buffer], { type: mimeType });
		const objectUrl = URL.createObjectURL(blob);
		const image = new Image();

		image.onload = () => {
			resolve({ width: image.width, height: image.height });
			URL.revokeObjectURL(objectUrl);
		};
		image.onerror = () => {
			reject(new Error("Could not load image for dimension check."));
			URL.revokeObjectURL(objectUrl);
		};

		image.src = objectUrl;
	});
}
