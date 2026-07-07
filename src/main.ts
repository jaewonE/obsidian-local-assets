import { Notice, Plugin } from "obsidian";
import { registerLocalDropFeature } from "./features/localDrop";
import { RemoteDownloadFeature } from "./features/remoteDownload";
import { DEFAULT_PLUGIN_DATA, DEFAULT_SETTINGS } from "./settings/defaults";
import { LocalAssetSyncSettingTab } from "./settings/tab";
import { IntegratedSettings, PluginData } from "./settings/types";
import { sanitizeSettings } from "./services/extensionPolicy";

export default class LocalAssetSyncPlugin extends Plugin {
	pluginData: PluginData = {
		...DEFAULT_PLUGIN_DATA,
		settings: { ...DEFAULT_PLUGIN_DATA.settings },
		registry: {},
		lastRunLog: null,
	};
	private remoteDownloadFeature!: RemoteDownloadFeature;
	private ribbonIconEl?: HTMLElement;

	async onload(): Promise<void> {
		await this.loadPluginData();

		this.remoteDownloadFeature = new RemoteDownloadFeature(this);
		this.addSettingTab(new LocalAssetSyncSettingTab(this.app, this));

		registerLocalDropFeature(this);

		this.addCommand({
			id: "download-current-note-assets",
			name: "Download assets for current note",
			callback: () => {
				void this.remoteDownloadFeature.processActiveNote();
			},
		});

		this.addCommand({
			id: "download-current-folder-assets",
			name: "Download assets for current folder",
			callback: () => {
				void this.remoteDownloadFeature.processCurrentFolder();
			},
		});

		this.addCommand({
			id: "download-vault-assets",
			name: "Download assets for all notes",
			callback: () => {
				void this.remoteDownloadFeature.processAllMarkdownNotes();
			},
		});

		this.addCommand({
			id: "retry-failed-assets",
			name: "Retry failed asset downloads",
			callback: () => {
				void this.remoteDownloadFeature.retryFailedAssetsForCurrentNote();
			},
		});

		this.addCommand({
			id: "clear-current-note-asset-cache",
			name: "Clear asset cache for current note",
			callback: () => {
				void this.remoteDownloadFeature.clearCacheForCurrentNote();
			},
		});

		this.addCommand({
			id: "clear-asset-cache",
			name: "Clear asset cache",
			callback: async () => {
				await this.clearRegistry();
				new Notice("Local asset cache cleared.");
			},
		});

		this.updateRibbonIcon();
	}

	onunload(): void {
		this.removeRibbonIcon();
	}

	async loadPluginData(): Promise<void> {
		const loadedData = (await this.loadData()) as Partial<PluginData> | null;
		const mergedSettings: IntegratedSettings = {
			...DEFAULT_SETTINGS,
			...(loadedData?.settings ?? {}),
		};
		const sanitized = sanitizeSettings(mergedSettings);

		this.pluginData = {
			settings: sanitized.settings,
			registry: loadedData?.registry ?? {},
			lastRunLog: loadedData?.lastRunLog ?? null,
		};

		for (const warning of sanitized.warnings) {
			new Notice(warning, 5000);
		}

		await this.savePluginData();
	}

	async savePluginData(): Promise<void> {
		await this.saveData(this.pluginData);
	}

	async updateSettings(patch: Partial<IntegratedSettings>): Promise<void> {
		const nextSettings: IntegratedSettings = {
			...this.pluginData.settings,
			...patch,
		};
		const sanitized = sanitizeSettings(nextSettings);
		this.pluginData.settings = sanitized.settings;

		await this.savePluginData();
		this.updateRibbonIcon();

		for (const warning of sanitized.warnings) {
			new Notice(warning, 4000);
		}
	}

	async clearRegistry(): Promise<void> {
		this.pluginData.registry = {};
		await this.savePluginData();
	}

	async clearLastRunLog(): Promise<void> {
		this.pluginData.lastRunLog = null;
		await this.savePluginData();
	}

	updateRibbonIcon(): void {
		this.removeRibbonIcon();
		if (!this.pluginData.settings.showRibbonIcon) {
			return;
		}

		this.ribbonIconEl = this.addRibbonIcon(
			"download",
			"Download local assets for current note",
			() => {
				void this.remoteDownloadFeature.processActiveNote();
			}
		);
	}

	private removeRibbonIcon(): void {
		if (this.ribbonIconEl) {
			this.ribbonIconEl.remove();
			this.ribbonIconEl = undefined;
		}
	}
}
