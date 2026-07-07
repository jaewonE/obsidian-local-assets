import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type LocalAssetSyncPlugin from "../main";
import { renderNamingPreview } from "../services/nameAllocator";
import { IntegratedSettings } from "./types";

export class LocalAssetSyncSettingTab extends PluginSettingTab {
	plugin: LocalAssetSyncPlugin;

	constructor(app: App, plugin: LocalAssetSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.addHeading(containerEl, "Local assets settings");

		this.addToggleSetting(
			containerEl,
			"Show ribbon icon",
			"Show or hide the download button in the ribbon.",
			"showRibbonIcon"
		);

		new Setting(containerEl)
				.setName("Allowed local extensions")
				.setDesc("Comma-separated extensions for dropped or pasted local files.")
				.addText((text) =>
					text
						.setValue(this.plugin.pluginData.settings.allowedLocalExtensions)
						.onChange(async (value) => {
						await this.plugin.updateSettings({ allowedLocalExtensions: value });
						this.display();
					})
			);

		new Setting(containerEl)
				.setName("Allowed remote extensions")
				.setDesc("Comma-separated extensions for downloaded remote assets.")
				.addText((text) =>
					text
						.setValue(this.plugin.pluginData.settings.allowedRemoteExtensions)
						.onChange(async (value) => {
						await this.plugin.updateSettings({ allowedRemoteExtensions: value });
						this.display();
					})
			);

		new Setting(containerEl)
				.setName("Unknown extension fallback")
				.setDesc("Used when extension cannot be inferred. Must be in allowed local extensions.")
				.addText((text) =>
					text
						.setValue(this.plugin.pluginData.settings.unknownExtensionFallback)
						.onChange(async (value) => {
						await this.plugin.updateSettings({ unknownExtensionFallback: value });
						this.display();
					})
			);

		new Setting(containerEl)
				.setName("Naming pattern")
				.setDesc("Use {note} and {n}. Example: {note}-{n}.")
				.addText((text) =>
					text
						.setValue(this.plugin.pluginData.settings.namingPattern)
						.onChange(async (value) => {
						await this.plugin.updateSettings({ namingPattern: value });
						this.display();
					})
			);

		const sampleNote = this.app.workspace.getActiveFile()?.basename ?? "note";
		containerEl.createEl("p", {
			text: `Naming preview: ${renderNamingPreview(
				this.plugin.pluginData.settings.namingPattern,
				sampleNote
			)}`,
		});

		this.addToggleSetting(
			containerEl,
			"Preserve size/alias",
			"Preserve size or alias metadata when rewriting links.",
			"preserveSizeOrAlias"
		);

		this.addToggleSetting(
			containerEl,
			"Verify existing by hash",
			"Reuse cached files only if content hash validation succeeds.",
			"verifyExistingByHash"
		);

		this.addToggleSetting(
			containerEl,
			"Verify existing by dimensions",
			"Reuse cached image files only if dimensions match metadata.",
			"verifyExistingByDimensions"
		);

		this.addToggleSetting(
			containerEl,
			"Hash only when size differs",
			"Skip hash check when file size already matches cached metadata.",
			"hashOnlyWhenSizeDiffers"
		);

		this.addNumberSetting(
			containerEl,
			"Max download size (MB)",
			"Skip remote files larger than this size.",
			"maxDownloadSizeMB"
		);

		this.addNumberSetting(
			containerEl,
			"Request timeout (ms)",
			"Timeout for each remote download request.",
			"requestTimeoutMs"
		);

		this.addNumberSetting(
			containerEl,
			"Concurrency limit",
			"Maximum number of concurrent download workers.",
			"concurrencyLimit"
		);

		this.addHeading(containerEl, "File type scope");
		this.addToggleSetting(containerEl, "Include images", "Process image assets.", "includeImages");
		this.addToggleSetting(containerEl, "Include PDFs", "Process PDF assets.", "includePdf");
		this.addToggleSetting(containerEl, "Include audio", "Process audio assets.", "includeAudio");
		this.addToggleSetting(containerEl, "Include video", "Process video assets.", "includeVideo");

		this.addHeading(containerEl, "Processing behavior");
		this.addToggleSetting(
			containerEl,
			"Dry-run preview",
			"Preview file naming and link changes without downloading or writing files.",
			"dryRunPreview"
		);

			new Setting(containerEl)
				.setName("Conflict strategy")
				.setDesc("How to handle links that already exist in cache.")
				.addDropdown((dropdown) =>
				dropdown
					.addOption("reuse-existing", "Reuse existing")
					.addOption("overwrite-never", "Overwrite never")
					.addOption("create-new", "Create new")
					.setValue(this.plugin.pluginData.settings.conflictStrategy)
					.onChange(async (value) => {
						await this.plugin.updateSettings({
							conflictStrategy: value as IntegratedSettings["conflictStrategy"],
						});
					})
			);

		new Setting(containerEl)
				.setName("Include domains")
				.setDesc("Optional comma-separated whitelist. Leave empty to allow all domains.")
				.addText((text) =>
					text
						.setValue(this.plugin.pluginData.settings.includeDomains)
						.onChange(async (value) => {
						await this.plugin.updateSettings({ includeDomains: value });
						this.display();
					})
			);

		new Setting(containerEl)
				.setName("Exclude domains")
				.setDesc("Optional comma-separated denylist.")
				.addText((text) =>
					text
						.setValue(this.plugin.pluginData.settings.excludeDomains)
						.onChange(async (value) => {
						await this.plugin.updateSettings({ excludeDomains: value });
						this.display();
					})
			);

		new Setting(containerEl)
			.setName("Clear local asset cache")
			.setDesc("Reset URL-to-file mappings so remote links can be downloaded again.")
			.addButton((button) =>
				button.setButtonText("Clear cache").onClick(async () => {
					await this.plugin.clearRegistry();
					new Notice("Local asset cache cleared.");
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Clear operation log")
			.setDesc("Clear the last run summary and detailed skip/failure notes.")
			.addButton((button) =>
				button.setButtonText("Clear log").onClick(async () => {
					await this.plugin.clearLastRunLog();
					new Notice("Operation log cleared.");
					this.display();
				})
			);

		this.addHeading(containerEl, "Last operation log");
		const lastRun = this.plugin.pluginData.lastRunLog;
		if (!lastRun) {
			containerEl.createEl("p", { text: "No operation has been run yet." });
		} else {
			containerEl.createEl("p", {
				text: `${new Date(lastRun.runAt).toLocaleString()} (${lastRun.mode})`,
			});
			containerEl.createEl("p", { text: lastRun.summary });
			if (lastRun.skippedReasons.length > 0) {
				this.addHeading(containerEl, "Skipped reasons");
				for (const reason of lastRun.skippedReasons.slice(0, 20)) {
					containerEl.createEl("p", { text: `- ${reason}` });
				}
			}
		}
	}

	private addHeading(containerEl: HTMLElement, name: string): void {
		new Setting(containerEl).setName(name).setHeading();
	}

	private addToggleSetting(
		containerEl: HTMLElement,
		name: string,
		description: string,
		key: keyof IntegratedSettings
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(description)
			.addToggle((toggle) =>
				toggle
					.setValue(Boolean(this.plugin.pluginData.settings[key]))
					.onChange(async (value) => {
						await this.plugin.updateSettings({ [key]: value } as Partial<IntegratedSettings>);
					})
			);
	}

	private addNumberSetting(
		containerEl: HTMLElement,
		name: string,
		description: string,
		key: keyof IntegratedSettings
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(description)
			.addText((text) =>
				text
					.setValue(String(this.plugin.pluginData.settings[key]))
					.onChange(async (value) => {
						const parsed = Number(value);
						await this.plugin.updateSettings({ [key]: parsed } as Partial<IntegratedSettings>);
					})
			);
	}
}
