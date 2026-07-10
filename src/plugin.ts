import { HabitTrackerSettings, HabitTrackerUserSettingsSnapshot } from "./settings"

export interface OTrackerPlugin {
	getSettings(): HabitTrackerSettings
	saveCodeBlockFunc: (codeBlockData: HabitTrackerUserSettingsSnapshot) => Promise<void>
	saveSettingsFunc: (setter: (settings: HabitTrackerSettings, options: { skipSave: boolean }) => void) => Promise<void>
}
