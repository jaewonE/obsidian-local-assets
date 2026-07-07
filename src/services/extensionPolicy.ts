import { DEFAULT_SETTINGS } from "../settings/defaults";
import { IntegratedSettings } from "../settings/types";

export type AssetCategory = "image" | "pdf" | "audio" | "video" | "other";

const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/svg+xml": "svg",
	"image/bmp": "bmp",
	"image/tiff": "tiff",
	"application/pdf": "pdf",
	"audio/mpeg": "mp3",
	"audio/mp3": "mp3",
	"audio/wav": "wav",
	"audio/ogg": "ogg",
	"audio/x-m4a": "m4a",
	"audio/mp4": "m4a",
	"video/mp4": "mp4",
	"video/webm": "webm",
	"video/ogg": "ogv",
	"video/quicktime": "mov",
	"video/x-matroska": "mkv",
};

const IMAGE_EXTENSIONS = new Set([
	"jpg",
	"jpeg",
	"png",
	"gif",
	"heic",
	"webp",
	"bmp",
	"tif",
	"tiff",
	"svg",
]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogv", "mov", "mkv"]);
const PDF_EXTENSIONS = new Set(["pdf"]);

export interface SettingsSanitizeResult {
	settings: IntegratedSettings;
	warnings: string[];
}

export function normalizeExtension(extension: string): string {
	return extension.trim().replace(/^\./, "").toLowerCase();
}

export function parseCsvValues(raw: string): string[] {
	return raw
		.split(",")
		.map((value) => value.trim().toLowerCase())
		.filter((value) => value.length > 0);
}

export function parseExtensionList(raw: string): string[] {
	const deduped = new Set<string>();
	for (const value of parseCsvValues(raw)) {
		const normalized = normalizeExtension(value);
		if (normalized.length > 0) {
			deduped.add(normalized);
		}
	}
	return Array.from(deduped);
}

export function extensionSet(raw: string): Set<string> {
	return new Set(parseExtensionList(raw));
}

export function isExtensionAllowed(extension: string, rawList: string): boolean {
	const normalized = normalizeExtension(extension);
	if (!normalized) {
		return false;
	}
	return extensionSet(rawList).has(normalized);
}

export function inferExtensionFromFilename(fileName: string): string | null {
	const lastDot = fileName.lastIndexOf(".");
	if (lastDot <= 0 || lastDot === fileName.length - 1) {
		return null;
	}
	const normalized = normalizeExtension(fileName.slice(lastDot + 1));
	return normalized.length > 0 ? normalized : null;
}

export function inferExtensionFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		return inferExtensionFromFilename(parsed.pathname);
	} catch {
		return null;
	}
}

export function inferExtensionFromContentType(contentType: string | null): string | null {
	if (!contentType) {
		return null;
	}
	const baseToken = contentType.split(";")[0];
	if (!baseToken) {
		return null;
	}
	const baseType = baseToken.trim().toLowerCase();
	return CONTENT_TYPE_TO_EXTENSION[baseType] ?? null;
}

export function detectAssetCategory(extension: string): AssetCategory {
	const normalized = normalizeExtension(extension);
	if (IMAGE_EXTENSIONS.has(normalized)) {
		return "image";
	}
	if (PDF_EXTENSIONS.has(normalized)) {
		return "pdf";
	}
	if (AUDIO_EXTENSIONS.has(normalized)) {
		return "audio";
	}
	if (VIDEO_EXTENSIONS.has(normalized)) {
		return "video";
	}
	return "other";
}

export function isCategoryEnabled(extension: string, settings: IntegratedSettings): boolean {
	const category = detectAssetCategory(extension);
	if (category === "image") {
		return settings.includeImages;
	}
	if (category === "pdf") {
		return settings.includePdf;
	}
	if (category === "audio") {
		return settings.includeAudio;
	}
	if (category === "video") {
		return settings.includeVideo;
	}
	return false;
}

export function isDomainAllowed(url: string, includeDomainsRaw: string, excludeDomainsRaw: string): boolean {
	let host = "";
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		return false;
	}

	const includeDomains = parseCsvValues(includeDomainsRaw);
	const excludeDomains = parseCsvValues(excludeDomainsRaw);

	for (const excluded of excludeDomains) {
		if (host === excluded || host.endsWith(`.${excluded}`)) {
			return false;
		}
	}

	if (includeDomains.length === 0) {
		return true;
	}

	for (const included of includeDomains) {
		if (host === included || host.endsWith(`.${included}`)) {
			return true;
		}
	}

	return false;
}

export function sanitizeSettings(input: IntegratedSettings): SettingsSanitizeResult {
	const warnings: string[] = [];
	const sanitized: IntegratedSettings = { ...input };

	const localExtensions = parseExtensionList(sanitized.allowedLocalExtensions);
	sanitized.allowedLocalExtensions = localExtensions.join(",");

	const remoteExtensions = parseExtensionList(sanitized.allowedRemoteExtensions);
	sanitized.allowedRemoteExtensions =
		remoteExtensions.length > 0
			? remoteExtensions.join(",")
			: sanitized.allowedLocalExtensions;

	let fallback = normalizeExtension(sanitized.unknownExtensionFallback);
	if (!fallback) {
		fallback = DEFAULT_SETTINGS.unknownExtensionFallback;
		warnings.push("Unknown extension fallback was empty and reset to default.");
	}
	if (localExtensions.length > 0 && !localExtensions.includes(fallback)) {
		const firstAllowed = localExtensions[0];
		if (firstAllowed) {
			fallback = firstAllowed;
			warnings.push(
				`Unknown extension fallback must be in allowed local extensions. Changed to '${fallback}'.`
			);
		}
	}
	sanitized.unknownExtensionFallback = fallback;

	const namingPattern = sanitized.namingPattern.trim() || DEFAULT_SETTINGS.namingPattern;
	sanitized.namingPattern = namingPattern.includes("{n}")
		? namingPattern
		: `${namingPattern}-{n}`;
	if (!namingPattern.includes("{n}")) {
		warnings.push("Naming pattern must include '{n}'. '-{n}' was appended automatically.");
	}

	sanitized.maxDownloadSizeMB = normalizeNumber(
		sanitized.maxDownloadSizeMB,
		1,
		200,
		DEFAULT_SETTINGS.maxDownloadSizeMB
	);
	sanitized.requestTimeoutMs = normalizeNumber(
		sanitized.requestTimeoutMs,
		1000,
		120000,
		DEFAULT_SETTINGS.requestTimeoutMs
	);
	sanitized.concurrencyLimit = normalizeNumber(
		sanitized.concurrencyLimit,
		1,
		8,
		DEFAULT_SETTINGS.concurrencyLimit
	);

	sanitized.includeDomains = parseCsvValues(sanitized.includeDomains).join(",");
	sanitized.excludeDomains = parseCsvValues(sanitized.excludeDomains).join(",");

	if (!isConflictStrategy(sanitized.conflictStrategy)) {
		sanitized.conflictStrategy = DEFAULT_SETTINGS.conflictStrategy;
	}

	return { settings: sanitized, warnings };
}

function normalizeNumber(value: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) {
		return fallback;
	}
	const rounded = Math.round(value);
	if (rounded < min) {
		return min;
	}
	if (rounded > max) {
		return max;
	}
	return rounded;
}

function isConflictStrategy(
	value: IntegratedSettings["conflictStrategy"]
): value is IntegratedSettings["conflictStrategy"] {
	return value === "reuse-existing" || value === "overwrite-never" || value === "create-new";
}
