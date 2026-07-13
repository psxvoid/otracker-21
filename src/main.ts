// TODO Add integration tests with jest
import { Plugin, setIcon, App, PluginSettingTab, Setting, MarkdownRenderChild, EventRef, TFile, TAbstractFile, Vault } from 'obsidian'
import HabitTracker from './HabitTracker.svelte'
import HabitTrackerError from './HabitTrackerError.svelte'
import { getDateAsString, isValidCSSColor } from './utils'
import { DebugLog } from './utils/debugHelpers'

import {
	format,
	parse,
} from 'date-fns'
import { ClickMode, DEFAULT_SETTINGS, HabitTrackerMergedSettings, HabitTrackerSettings, HabitTrackerUserSettingsSnapshot, mergeSettings, setMinHabitNameWidthPx, SnapshotMode } from './settings'
import { StringUtils } from './utils/StringUtils'
import { saveCodeBlock } from './utils/ObsidianCodeBlock'
import { VaultEventType } from './utils/ObsidianHelpers'
import { getFrontmatter } from './HabitLoader'
import { HabitLightSnapshot } from './core/Snapshot'

type Destroyable = { $destroy: () => void }

class SvelteMarkdownRenderChild extends MarkdownRenderChild {
	private component?: Destroyable

	constructor(
		containerEl: HTMLElement,
		private createComponent: (target: HTMLElement) => Destroyable,
	) {
		super(containerEl)
	}

	onload() {
		this.component = this.createComponent(this.containerEl)
	}

	onunload() {
		this.component?.$destroy()
		this.component = undefined
		this.containerEl.empty()
	}
}

const getDailyNoteFormat = (app: App) => {

	const dailyNotesPlugin = (app as any).internalPlugins?.plugins["daily-notes"]?.instance

	if (typeof dailyNotesPlugin.getFormat === 'function') {
		const dailyNoteFormat = dailyNotesPlugin.getFormat()

		if (typeof dailyNoteFormat === 'string') {
			return dailyNoteFormat
		}

		return 'YYYY-MM-DD'
	}

}

const getCurrentDailyNoteDate = (app: App, sourcePath: string, logger: DebugLog): { success: false, errorMessage: string, exception?: unknown } | { success: true, date: Date } => {
	const dailyNotesPlugin = (app as any).internalPlugins?.plugins["daily-notes"]?.instance

	if (typeof dailyNotesPlugin.getCurrentFileDateTimestamp === 'function') {
		const dailyNoteTimestamp = dailyNotesPlugin.getCurrentFileDateTimestamp() // ?: use format + ctx.sourceFile.baseName

		if (typeof dailyNoteTimestamp === 'number') {
			return {
				success: true,
				date: new Date(dailyNoteTimestamp)
			}
		}
	}

	logger.debugLog(() => `Unable to get daily note date from daily note plugin. Trying with a specific format.`)
	let dailyNoteDateFormatDebug: string | undefined

	try {
		const dailyNoteDateFormat = getDailyNoteFormat(app)
		dailyNoteDateFormatDebug = dailyNoteDateFormat

		if (typeof dailyNoteDateFormat !== 'string') {
			throw new Error("Unable to get daily note date format.")
		}

		const sourceFile = app.vault.getFileByPath(sourcePath)

		if (sourceFile != null) {
			const fileNameWithoutExtension = sourceFile.basename
			const dailyNoteDate = parse(fileNameWithoutExtension, dailyNoteDateFormat, new Date())

			if (!(dailyNoteDate instanceof Date)) {
				throw new Error("Unable to parse daily note date with date-fns.")
			}

			return {
				success: true,
				date: dailyNoteDate
			}
		}
	} catch (error: unknown) {
		return { success: false, errorMessage: `Date parse exception (format: ${dailyNoteDateFormatDebug}).`, exception: error }
	}

	return { success: false, errorMessage: 'Unable to get a daily note date (not a daily note?).' }
}

export default class HabitTracker21 extends Plugin {
	settings: HabitTrackerSettings;
	private logger: DebugLog = new DebugLog(() => this.settings, () => 'Plugin');
	private disposeRefs: (() => void)[] = []

	async onload() {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor('habittracker', async (src, el, ctx) => {
			// const trackingPixel = document.createElement('img')
			// trackingPixel.setAttribute('src', 'https://bit.ly/habitttracker21-140')
			// if (el.parentElement) el.parentElement.appendChild(trackingPixel)
			// TODO make this dynamic and add it to HabitTracker.svelte

			this.logger.debugLog(() => 'Loading')

			const parseDailyNoteDate = (mergedSettings: HabitTrackerMergedSettings): { parsed: false } | { parsed: true, date: Date } => {
				if (!mergedSettings.useDailyNoteDate) {
					return { parsed: false }
				}

				const dateParseResult = getCurrentDailyNoteDate(this.app, ctx.sourcePath, this.logger)

				if (dateParseResult.success) {
					return { parsed: true, date: dateParseResult.date }
				}

				this.logger.debugLog(() => dateParseResult.errorMessage)

				if (dateParseResult.exception != null) {
					this.logger.debugLog(() => `Parse exception ${dateParseResult.exception}`)
				}

				return { parsed: false }
			}



			let userSettings: Partial<HabitTrackerSettings> = {}
			try {
				userSettings = JSON.parse(src);

				const mergedSettings = mergeSettings(this.settings, userSettings)
				setMinHabitNameWidthPx(mergedSettings.minHabitNameWidthPx)

				const dailyNoteDateParseResult = parseDailyNoteDate(mergedSettings)
				const today = dailyNoteDateParseResult.parsed ? dailyNoteDateParseResult.date : new Date();

				this.logger.debugLog(() => `Global settings: ${JSON.stringify(this.settings)}`);
				this.logger.debugLog(() => `Tracker settings: ${JSON.stringify(userSettings)}`);
				this.logger.debugLog(() => `Today is ${format(today, 'yyyy-MM-dd')}`);
				ctx.addChild(new SvelteMarkdownRenderChild(el, (target) => new HabitTracker({
					target,
					props: {
						app: this.app,
						userSettings,
						globalSettings: {
							...this.settings,
							...(dailyNoteDateParseResult.parsed
								? { lastDisplayedDate: getDateAsString(today) }
								: {})
						},
						pluginName: this.manifest.name,
						plugin: {
							getSettings: () => this.settings,
							saveCodeBlockFunc: async (codeBlockData: HabitTrackerUserSettingsSnapshot): Promise<void> => {
								await saveCodeBlock(this.app, ctx, codeBlockData)
							},
							saveSettingsFunc: async (setter: (settings: HabitTrackerSettings, options: { skipSave: boolean }) => void): Promise<void> => {
								const options = { skipSave: false }

								setter(this.settings, options)

								if (options.skipSave) {
									return
								}

								await this.saveSettings();
							},
						}
					}
				})))
			} catch (error) {
				ctx.addChild(new SvelteMarkdownRenderChild(el, (target) => new HabitTrackerError({
					target,
					props: {
						error,
						src,
						pluginName: this.manifest.name,
						app: this.app,
						globalSettings: this.settings
					}
				})))
				this.logger.debugError(() => `Received invalid settings`, error as Error)
			}
		})

		// Add hover action bars to habit tracker code blocks
		this.addHoverActionBars()

		// Check for updates in background (after a short delay)
		if (this.settings.updateCheckEnabled) {
			setTimeout(() => this.checkForUpdatesBackground(), 5000)
		}

		// Add the settings tab
		this.addSettingTab(new HabitTrackerSettingTab(this.app, this));

		const globalSnapshotBaseHandler = async (
			file: TAbstractFile,
			morph: (habit: HabitLightSnapshot, file: TFile) => Promise<HabitLightSnapshot>,
			) => {
			if (typeof this.settings?.snapshots?.length === 'number' && file instanceof TFile) {
				let hasSnapshotUpdates = false
				const updatedSnapshots = await Promise.all(this.settings.snapshots.map(async x => {
					let hasHabitUpdates = false
					const habitsToUpdate = await Promise.all(x.habits.map(async habit => {
						const updatedHabit = await morph(habit, file)

						if (updatedHabit !== habit) {
							hasSnapshotUpdates = true
							hasHabitUpdates = true

							return updatedHabit
						}

						return habit
					}))

					return !hasHabitUpdates
						? x
						: {
							...x,
							habits: habitsToUpdate
						}
				}))

				if (hasSnapshotUpdates) {
					this.settings.snapshots = updatedSnapshots
					await this.saveSettings()
				}
			}
		}

		const onRenameHandler = async (abstractFile: TAbstractFile, oldPath?: string) => globalSnapshotBaseHandler(
			abstractFile,
			async (habit, tFile) => habit.path !== oldPath
				? habit
				: {
					...habit,
					basename: tFile.basename,
					path: tFile.path,
				})

		const onModifyHandler = async (abstractFile: TAbstractFile) => globalSnapshotBaseHandler(
			abstractFile,
			async (habit, file) => {
				if (habit.path !== file.path) {
					return habit
				}

				const fm = await getFrontmatter(file, this.logger.scoped(() => 'get-fm-on-mod'), this.app, true, 1)

				let frontmatterChanges: Partial<HabitLightSnapshot> | undefined

				if (fm.title !== habit.title) {
					frontmatterChanges = frontmatterChanges ?? {}
					frontmatterChanges.title = fm.title
				}

				return frontmatterChanges == null
					? habit
					: {
						...habit,
						...frontmatterChanges
					}
			})

		const subscribeToVaultEvents = (target: VaultEventType, handler: (file: TAbstractFile, oldPath?: string) => unknown) => {
			const eventRef = this.app.vault.on(target as 'rename', handler)
			return () => this.app.vault.offref(eventRef)
		}

		subscribeToVaultEvents('rename', onRenameHandler)
		subscribeToVaultEvents('modify', onModifyHandler)
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		setMinHabitNameWidthPx(this.settings.minHabitNameWidthPx)
	}

	async saveSettings() {
		this.logger.debugLog(() => 'Saving settings...');
		await this.saveData(this.settings);

		setMinHabitNameWidthPx(this.settings.minHabitNameWidthPx)

		// Refresh all habit tracker instances when settings change
		this.refreshAllHabitTrackers();
	}

	refreshAllHabitTrackers() {
		// Dispatch a single event at the document level that all components can listen to
		this.logger.debugLog(() => 'Dispatching refresh event with settings...');
		const refreshEvent = new CustomEvent('habit-tracker-refresh', {
			detail: { settings: this.settings }
		});
		document.dispatchEvent(refreshEvent);
		this.logger.debugLog(() => ' Refresh event dispatched...');
	}

	addHoverActionBars() {
		// Use event delegation to handle hover on habit tracker code blocks
		document.addEventListener('mouseover', (e) => {
			const target = e.target as HTMLElement
			if (!target || typeof target.closest !== 'function') return

			const codeBlock = target.closest('.cm-lang-habittracker') as HTMLElement

			if (codeBlock && !codeBlock.querySelector('.ht21-action-bar')) {
				// Check for updates when creating new action bars
				if (this.settings.updateCheckEnabled) {
					this.checkForUpdatesBackground()
				}

				const actionBar = this.createActionBar(codeBlock)
				codeBlock.appendChild(actionBar)
			}
		})

		// Clean up action bars when mouse leaves
		document.addEventListener('mouseleave', (e) => {
			const target = e.target as HTMLElement
			if (!target || typeof target.closest !== 'function') return

			const codeBlock = target.closest('.cm-lang-habittracker') as HTMLElement

			if (codeBlock) {
				// Small delay to prevent flickering when moving between elements
				setTimeout(() => {
					if (!codeBlock.matches(':hover')) {
						const actionBar = codeBlock.querySelector('.ht21-action-bar')
						actionBar?.remove()
					}
				}, 100)
			}
		})
	}

	// TODO could we do this with Svelte?
	createActionBar(codeBlock) {
		const actionBar = document.createElement('div')
		actionBar.className = 'ht21-action-bar'

		// Check for version mismatch between manifest and localStorage
		const storedVersion = localStorage.getItem('habit-tracker-update-available')
		const currentVersion = this.manifest.version
		// TODO add some debugging code here too

		// Show dot if there's a stored version that's different from current
		const hasUpdate = storedVersion && storedVersion !== currentVersion

		const updateDot = hasUpdate ? '<span class="ht21-update-dot"></span>' : ''
		const tooltipText = hasUpdate ? 'New version available' : 'Check for updates'

		actionBar.innerHTML = `
			<span class="ht21-action-bar__title">${this.manifest.name}</span>
			<div class="ht21-action-bar__buttons">
				<button class="clickable-icon ht21-action-bar__btn--update" aria-label="${tooltipText}" style="position: relative;"><span class="ht21-btn-text">Updates</span>${updateDot}</button>
				<button class="clickable-icon ht21-action-bar__btn--edit" aria-label="Edit this block"><span class="ht21-btn-text">Edit this block</span></button>
				<button class="clickable-icon ht21-action-bar__btn--settings" aria-label="Plugin Settings"><span class="ht21-btn-text">Plugin Settings</span></button>
			</div>
		`

		// Add event listeners
		const settingsBtn = actionBar.querySelector('.ht21-action-bar__btn--settings')
		const updateBtn = actionBar.querySelector('.ht21-action-bar__btn--update')
		const editBtn = actionBar.querySelector('.ht21-action-bar__btn--edit')

		// Add Obsidian icons
		if (settingsBtn) setIcon(settingsBtn as HTMLElement, 'settings')
		if (updateBtn) setIcon(updateBtn as HTMLElement, 'download')
		if (editBtn) setIcon(editBtn as HTMLElement, 'lucide-code-2')

		settingsBtn?.addEventListener('click', () => this.openSettings())
		updateBtn?.addEventListener('click', () => {
			// Clear update status when clicked
			localStorage.removeItem('habit-tracker-update-available')
			localStorage.removeItem('habit-tracker-last-update-check')

			if (hasUpdate) {
				this.openCommunityPlugins()
			} else {
				this.checkForUpdates()
			}
		})
		editBtn?.addEventListener('click', () => this.editBlock(codeBlock))

		return actionBar
	}

	openSettings() {
		// Open settings and navigate to this plugin's settings page
		(this.app as any).setting.open();
		(this.app as any).setting.openTabById(this.manifest.id);
	}

	openCommunityPlugins() {
		// Open the specific plugin page in Community Plugins
		window.open('obsidian://show-plugin?id=habit-tracker-21');
	}

	async checkForUpdates() {
		await this.performUpdateCheck()
	}

	async checkForUpdatesBackground() {
		const lastCheck = localStorage.getItem('habit-tracker-last-update-check')
		const now = Date.now()
		const dayInMs = 24 * 60 * 60 * 1000

		// Only check once per day for background checks
		if (lastCheck && (now - parseInt(lastCheck)) < dayInMs) {
			return
		}

		await this.performUpdateCheck()
	}

	async performUpdateCheck() {
		try {
			// Check GitHub releases for updates
			const response = await fetch('https://api.github.com/repos/zincplusplus/habit-tracker/releases/latest')
			if (!response.ok) throw new Error('Failed to fetch')

			const latestRelease = await response.json()
			const latestVersion = latestRelease.tag_name.replace('v', '')
			const currentVersion = this.manifest.version

			// Store check timestamp
			localStorage.setItem('habit-tracker-last-update-check', Date.now().toString())

			this.logger.debugLog(() => 'Update check - latestVersion:')
			this.logger.debugLog(() => 'Update check - currentVersion:')
			const isNewer = this.isNewerVersion(latestVersion, currentVersion)
			this.logger.debugLog(() => 'Update check - isNewerVersion result:')

			if (isNewer) {
				localStorage.setItem('habit-tracker-update-available', latestVersion)
				this.logger.debugLog(() => `Update check - Stored update available: ${latestVersion}`)
			} else {
				this.logger.debugLog(() => 'Update check - No update needed')
				localStorage.removeItem('habit-tracker-update-available')
			}
		} catch (error) {
			this.logger.debugError(() => 'Update check failed')
		}
	}

	isNewerVersion(latest: string, current: string): boolean {
		const parseVersion = (v: string) => v.split('.').map(Number)
		const latestParts = parseVersion(latest)
		const currentParts = parseVersion(current)

		for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
			const l = latestParts[i] || 0
			const c = currentParts[i] || 0
			if (l > c) return true
			if (l < c) return false
		}
		return false
	}

	editBlock(codeBlock) {
		// Find the edit button at the same DOM level as the action bar
		const editButton = codeBlock.querySelector('.edit-block-button')

		if (editButton) {
			editButton.click()
		} else {
			// throw an error ehre, also visible to the user, maybe notice???
		}
	}

	onunload() {
		for(const dispose of this.disposeRefs) {
			try {
				dispose()
			} catch(error: unknown) {
				const errorMessage = error instanceof Error
					? `${error.message}\nStack: ${error?.stack}`
					: String(error)

				this.logger.debugError(() => `Dispose error: ${errorMessage}`)
			}
		}
		// window.location.reload();
	}
}

class HabitTrackerSettingTab extends PluginSettingTab {
	plugin: HabitTracker21;

	constructor(app: App, plugin: HabitTracker21) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h3', { text: `${this.plugin.manifest.name} Settings` });

		// General Settings Section
		let generalHeader = containerEl.createEl('h4', { text: 'General Settings' });
		generalHeader.style.marginBottom = '0';
		const generalDesc = containerEl.createEl('div', {
			cls: 'setting-item-description',
			text: 'These apply to all trackers and can be overridden either in the codeblock or in the habit tracker file.'
		});
		generalDesc.style.marginBottom = '15px';
		generalDesc.style.fontSize = '0.85em';
		generalDesc.style.color = 'var(--text-muted)';

		new Setting(containerEl)
			.setName('Default path')
			.setDesc('Default path for habits (folder or file). Can be overridden with "path" in code blocks.')
			.addDropdown(dropdown => {
				// Get all folders in the vault
				const folders = this.app.vault.getAllLoadedFiles()
					.filter(file => 'children' in file && file.children !== undefined) // Only folders
					.map(folder => folder.path)
					.sort();

				// Add each folder as an option
				folders.forEach(folderPath => {
					dropdown.addOption(folderPath, folderPath);
				});

				// Set current value
				dropdown.setValue(this.plugin.settings.path);

				// Handle changes
				dropdown.onChange(async (value) => {
					this.plugin.settings.path = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Days to show')
			.setDesc('Number of days to display in the habit tracker. Can be overridden with "daysToShow" in code blocks.')
			.addText(text => text
				.setValue(this.plugin.settings.daysToShow.toString())
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.daysToShow = numValue;
						await this.plugin.saveSettings();
					}
				}))
			.then(setting => {
				// Add number input attributes
				const inputEl = setting.controlEl.querySelector('input') as HTMLInputElement;
				if (inputEl) {
					inputEl.type = 'number';
					inputEl.min = '1';
					inputEl.step = '1';
				}
			});

		new Setting(containerEl)
			.setName('Default color')
			.setDesc('Default habit color (hex, RGB, or CSS color name). Can be overridden with "color" in code blocks or habit frontmatter.')
			.addText(text => text
				.setValue(this.plugin.settings.defaultColor)
				.setPlaceholder('#4CAF50 or green')
				.onChange(async (value) => {
					// Only save valid colors or empty string
					if (!value || isValidCSSColor(value)) {
						this.plugin.settings.defaultColor = value;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Default custom order field')
			.setDesc('Determines which habit frontmatter field will store a custom habit order (updated via drag and drop). Can be overridden with "habitOrderField" in code block.')
			.addText(text => text
				.setValue(this.plugin.settings.habitOrderField)
				.setPlaceholder('habitOrder')
				.onChange(async (value) => {
					if (typeof value === 'string' && !StringUtils.isNullOrWhiteSpace(value)) {
						this.plugin.settings.habitOrderField = value;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Infer last date')
			.setDesc('Infer last date to display from a daily note base name. Should match "daily notes" core plugin format or "YYYY-MM-DD."')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useDailyNoteDate)
				.onChange(async (value) => {
					this.plugin.settings.useDailyNoteDate = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show streaks')
			.setDesc('Display streak indicators and counts. Can be overridden with "showStreaks" in code blocks.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showStreaks)
				.onChange(async (value) => {
					this.plugin.settings.showStreaks = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Gap style')
			.setDesc('How gap days are displayed in streaks. Can be overridden with "gapStyle" in code blocks.')
			.addDropdown(dropdown => dropdown
				.addOption('default', 'Default')
				.addOption('faded', 'Faded')
				.setValue(this.plugin.settings.gapStyle)
				.onChange(async (value) => {
					this.plugin.settings.gapStyle = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Click mode')
			.setDesc('Changes how clicking on habits is interpreted.\nDefault = clicking increments the tick counter, shift+click = unticks.\nToggle = clicking toggles tick, shift+click increments the tick counter. ')
			.addDropdown(dropdown => dropdown
				.addOption(ClickMode.ClickIncreasesTickCount, 'Default')
				.addOption(ClickMode.ClickToggleTick, 'Toggle')
				.setValue(this.plugin.settings.clickMode)
				.onChange(async (value) => {
					this.plugin.settings.clickMode = value as ClickMode;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Open daily note on date click')
			.setDesc('Click a date in the header row to open the corresponding daily note. Requires the Daily Notes core plugin or Periodic Notes community plugin.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.openDailyNoteOnClick)
				.onChange(async (value) => {
					this.plugin.settings.openDailyNoteOnClick = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Match line length')
			.setDesc('Make habit tracker match the width of the readable line length. Can be overridden with "matchLineLength" in code blocks.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.matchLineLength)
				.onChange(async (value) => {
					this.plugin.settings.matchLineLength = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Snapshot Mode')
			.setDesc('Save snapshots of habits in the code block. It allows to restore a habit view even when original habit files are deleted, moved, etc (preservation).')
			.addDropdown(dropdown => dropdown
				.addOption('disabled', 'Disabled')
				.addOption('full-snapshot', 'Full in Code Block')
				.addOption('global-light', 'Global Light')
				.setValue(this.plugin.settings.snapshotMode)
				.onChange(async (value) => {
					this.plugin.settings.snapshotMode = value as SnapshotMode;
					await this.plugin.saveSettings();
				}));

		type MinNameWidthSetting =  Setting & { setDescMinNameWidth: (widthPx: number) => Setting }
		const minNameWidthSetting: MinNameWidthSetting = new Setting(containerEl) as MinNameWidthSetting;
		minNameWidthSetting.setDescMinNameWidth = (widthPx: number) => {
			minNameWidthSetting.setDesc(`Sets the minimum habit-name-cell width in pixels. Current value: ${widthPx} pixels.`)
			return minNameWidthSetting
		}
		minNameWidthSetting
			.setName('Min name width')
			.setDescMinNameWidth(this.plugin.settings.minHabitNameWidthPx)
			.addSlider(slider =>
				slider
					.setLimits(75, 300, 25)
					.setValue(this.plugin.settings.minHabitNameWidthPx)
					.onChange(async value => {
						this.plugin.settings.minHabitNameWidthPx = value;
						minNameWidthSetting.setDescMinNameWidth(value)
						await this.plugin.saveSettings();
					})
			)


		// Troubleshooting Section
		const troubleshootingHeader = containerEl.createEl('h4', { text: 'Troubleshooting' });
		troubleshootingHeader.style.marginTop = '30px';

		new Setting(containerEl)
			.setName('Debug mode')
			.setDesc('Enable debug output to console. Can be overridden with "debug" in code blocks.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debug)
				.onChange(async (value) => {
					this.plugin.settings.debug = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Reset settings')
			.setDesc('Reset all settings to their default values')
			.addButton(button => button
				.setButtonText('Reset to defaults')
				.setWarning()
				.onClick(async () => {
					// Reset to default settings
					this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
					await this.plugin.saveSettings();
					// Refresh the settings display
					this.display();
				}));
	}
}
