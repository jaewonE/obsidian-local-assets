import { IntegratedSettings, PluginData } from "./types";

export const DEFAULT_ALLOWED_EXTENSIONS =
	"jpg,jpeg,png,gif,heic,webp,bmp,tiff,svg,pdf,mp4,webm,ogv,mov,mkv,mp3,wav,ogg,m4a";

export const DEFAULT_SETTINGS: IntegratedSettings = {
	showRibbonIcon: true,
	allowedLocalExtensions: DEFAULT_ALLOWED_EXTENSIONS,
	allowedRemoteExtensions: DEFAULT_ALLOWED_EXTENSIONS,
	unknownExtensionFallback: "png",
	namingPattern: "{note}-{n}",
	preserveSizeOrAlias: true,
	verifyExistingByHash: true,
	verifyExistingByDimensions: true,
	hashOnlyWhenSizeDiffers: false,
	maxDownloadSizeMB: 25,
	requestTimeoutMs: 15000,
	concurrencyLimit: 3,
	includeImages: true,
	includePdf: true,
	includeAudio: true,
	includeVideo: true,
	dryRunPreview: false,
	conflictStrategy: "reuse-existing",
	includeDomains: "",
	excludeDomains: "",
};

export const DEFAULT_PLUGIN_DATA: PluginData = {
	settings: DEFAULT_SETTINGS,
	registry: {},
	lastRunLog: null,
};
