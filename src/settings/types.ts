export type ConflictStrategy = "reuse-existing" | "overwrite-never" | "create-new";
export type AttachmentFolderMode = "obsidian-default" | "same-folder" | "vault-root" | "custom";

export interface IntegratedSettings {
	showRibbonIcon: boolean;
	allowedLocalExtensions: string;
	allowedRemoteExtensions: string;
	unknownExtensionFallback: string;
	namingPattern: string;
	attachmentFolderMode: AttachmentFolderMode;
	customAttachmentFolder: string;
	preserveSizeOrAlias: boolean;
	useCache: boolean;
	verifyExistingByHash: boolean;
	verifyExistingByDimensions: boolean;
	hashOnlyWhenSizeDiffers: boolean;
	maxDownloadSizeMB: number;
	requestTimeoutMs: number;
	concurrencyLimit: number;
	includeImages: boolean;
	includePdf: boolean;
	includeAudio: boolean;
	includeVideo: boolean;
	dryRunPreview: boolean;
	conflictStrategy: ConflictStrategy;
	includeDomains: string;
	excludeDomains: string;
}

export interface DownloadRegistryEntry {
	sourceUrl: string;
	filePath: string;
	size: number;
	hash?: string;
	width?: number;
	height?: number;
	contentType?: string;
	etag?: string;
	lastModified?: string;
	savedAt: number;
}

export interface OperationLog {
	runAt: number;
	mode: "dry-run" | "execute";
	summary: string;
	skippedReasons: string[];
	details: string[];
	failedUrls?: string[];
	skippedUrls?: string[];
	changedUrls?: string[];
}

export interface PluginData {
	settings: IntegratedSettings;
	registry: Record<string, DownloadRegistryEntry>;
	lastRunLog: OperationLog | null;
}
