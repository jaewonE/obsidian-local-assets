import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type LocalAssetSyncPlugin from "../main";
import { renderNamingPreview } from "../services/nameAllocator";
import { AttachmentFolderMode, IntegratedSettings } from "./types";

export class LocalAssetSyncSettingTab extends PluginSettingTab {
	plugin: LocalAssetSyncPlugin;

	constructor(app: App, plugin: LocalAssetSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.pluginData.settings;
		containerEl.empty();

		this.addHeading(containerEl, "Local assets settings");

		this.addToggleSetting(
			containerEl,
			"Show ribbon icon",
			"Show or hide the download button in the ribbon.",
			"showRibbonIcon"
		);

		this.addHeading(containerEl, "Attachment destination");
		new Setting(containerEl)
			.setName("Attachment folder")
			.setDesc("Choose exactly where imported files are saved.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("obsidian-default", "Use Obsidian default")
					.addOption("same-folder", "Same folder as note")
					.addOption("vault-root", "Vault root")
					.addOption("custom", "Custom folder")
					.setValue(settings.attachmentFolderMode)
					.onChange(async (value) => {
						await this.plugin.updateSettings({
							attachmentFolderMode: value as AttachmentFolderMode,
						});
						this.display();
					})
			);

		if (settings.attachmentFolderMode === "custom") {
			this.addTextSetting(
				containerEl,
				"Custom attachment folder",
				"Vault-relative folder path used only when Attachment folder is set to Custom folder.",
				"customAttachmentFolder"
			);
		}

		this.addHeading(containerEl, "Naming and file types");
		this.addTextSetting(
			containerEl,
			"Allowed local extensions",
			"Comma-separated extensions for dropped or pasted local files.",
			"allowedLocalExtensions"
		);
		this.addTextSetting(
			containerEl,
			"Allowed remote extensions",
			"Comma-separated extensions for downloaded remote assets.",
			"allowedRemoteExtensions"
		);
		this.addTextSetting(
			containerEl,
			"Unknown extension fallback",
			"Used when extension cannot be inferred. Must be in allowed local extensions.",
			"unknownExtensionFallback"
		);
		this.addTextSetting(
			containerEl,
			"Naming pattern",
			"Use {note} and {n}. Example: {note}-{n}.",
			"namingPattern"
		);

		const sampleNote = this.app.workspace.getActiveFile()?.basename ?? "note";
		containerEl.createEl("p", {
			text: `Naming preview: ${renderNamingPreview(settings.namingPattern, sampleNote)}`,
		});

		this.addToggleSetting(
			containerEl,
			"Preserve size/alias",
			"Preserve embed size or link alias metadata when rewriting links.",
			"preserveSizeOrAlias"
		);

		this.addHeading(containerEl, "Cache behavior");
		this.addToggleSetting(
			containerEl,
			"Use URL cache",
			"Enabled: cached files are inserted immediately, then remote content is checked in the background; matching downloads are discarded and changed downloads replace the cached file with a notice. Disabled: every run downloads again even when metadata exists.",
			"useCache"
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

		new Setting(containerEl)
			.setName("Conflict strategy")
			.setDesc(
				"Reuse existing performs background validation when cache is enabled. Overwrite never reuses existing files without replacing them. Create new always saves another file."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("reuse-existing", "Reuse existing")
					.addOption("overwrite-never", "Overwrite never")
					.addOption("create-new", "Create new")
					.setValue(settings.conflictStrategy)
					.onChange(async (value) => {
						await this.plugin.updateSettings({
							conflictStrategy: value as IntegratedSettings["conflictStrategy"],
						});
					})
			);

		this.addHeading(containerEl, "Remote processing");
		this.addNumberSetting(
			containerEl,
			"Max file size (MB)",
			"Skip local or remote files larger than this size.",
			"maxDownloadSizeMB",
			1,
			200
		);
		this.addNumberSetting(
			containerEl,
			"Request timeout (ms)",
			"Timeout for each remote download request.",
			"requestTimeoutMs",
			1000,
			120000
		);
		this.addNumberSetting(
			containerEl,
			"Concurrency limit",
			"Maximum number of concurrent download workers per note.",
			"concurrencyLimit",
			1,
			8
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

		this.addHeading(containerEl, "Domain filters");
		this.addTextSetting(
			containerEl,
			"Include domains",
			"Optional comma-separated whitelist. Leave empty to allow all domains.",
			"includeDomains"
		);
		this.addTextSetting(
			containerEl,
			"Exclude domains",
			"Optional comma-separated denylist.",
			"excludeDomains"
		);

		this.addHeading(containerEl, "Maintenance");
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

		this.renderLastRunLog(containerEl);
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

	private addTextSetting(
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
						await this.plugin.updateSettings({ [key]: value } as Partial<IntegratedSettings>);
					})
			);
	}

	private addNumberSetting(
		containerEl: HTMLElement,
		name: string,
		description: string,
		key: keyof IntegratedSettings,
		min: number,
		max: number
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(description)
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = String(min);
				text.inputEl.max = String(max);
				text
					.setValue(String(this.plugin.pluginData.settings[key]))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (!Number.isFinite(parsed)) {
							return;
						}
						await this.plugin.updateSettings({ [key]: parsed } as Partial<IntegratedSettings>);
					});
			});
	}

	private renderLastRunLog(containerEl: HTMLElement): void {
		this.addHeading(containerEl, "Last operation log");
		const lastRun = this.plugin.pluginData.lastRunLog;
		if (!lastRun) {
			containerEl.createEl("p", { text: "No operation has been run yet." });
			return;
		}

		containerEl.createEl("p", {
			text: `${new Date(lastRun.runAt).toLocaleString()} (${lastRun.mode})`,
		});
		containerEl.createEl("p", { text: lastRun.summary });

		const reportLines = [
			`${new Date(lastRun.runAt).toISOString()} (${lastRun.mode})`,
			lastRun.summary,
			...lastRun.details,
		];
		new Setting(containerEl)
			.setName("Copy operation report")
			.setDesc("Copy the summary and detailed processing notes.")
			.addButton((button) =>
				button.setButtonText("Copy report").onClick(async () => {
					await navigator.clipboard.writeText(reportLines.join("\n"));
					new Notice("Operation report copied.");
				})
			);

		if (lastRun.skippedReasons.length > 0) {
			this.addHeading(containerEl, "Skipped reasons");
			for (const reason of lastRun.skippedReasons.slice(0, 20)) {
				containerEl.createEl("p", { text: `- ${reason}` });
			}
		}

		if (lastRun.details.length > 0) {
			this.addHeading(containerEl, "Details");
			for (const detail of lastRun.details.slice(0, 50)) {
				containerEl.createEl("p", { text: `- ${detail}` });
			}
		}
	}
}
