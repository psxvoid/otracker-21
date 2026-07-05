export const enum ClickMode {
	ClickIncreasesTickCount = 'tick-increment',
	ClickToggleTick = 'tick-toggle'
}

export function setMinHabitNameWidthPx(widthPx: number): void {
	const queryTarget = () => document.querySelector('.block-language-habittracker') as HTMLElement

	const waitForTarget = () => {
		const target = queryTarget()

		if (target == null) {
			setTimeout(waitForTarget, 150)
			return
		}

		target.style.setProperty(
			'--habit-name-min-width',
			`${widthPx}px`);
	}

	waitForTarget()
}

export interface HabitTrackerSettings {
	path: string;
	daysToShow: number;
	debug: boolean;
	matchLineLength: boolean;
	defaultColor: string;
	showStreaks: boolean;
	openDailyNoteOnClick: boolean;
	gapStyle: string;
	updateCheckEnabled: boolean;
	useDailyNoteDate: boolean;
	clickMode: ClickMode;
	habitOrderField: string;
	minHabitNameWidthPx: number;
}

export interface HabitTrackerUserSettings extends Omit<HabitTrackerSettings, 'defaultColor' | 'clickMode' | 'updateCheckEnabled'> {
	color: string;
}

export interface HabitTrackerMergedSettings extends HabitTrackerUserSettings {
	clickMode: ClickMode
}

export const DEFAULT_SETTINGS: HabitTrackerSettings = {
	path: '',
	daysToShow: 21,
	debug: false,
	matchLineLength: true,
	defaultColor: '',
	showStreaks: true,
	openDailyNoteOnClick: true,
	gapStyle: 'default',
	updateCheckEnabled: false,
	useDailyNoteDate: true,
	clickMode: ClickMode.ClickIncreasesTickCount,
	habitOrderField: 'habitOrder',
	minHabitNameWidthPx: 120,
}

export function mergeSettings(globalSettings: HabitTrackerSettings, userSettings: Partial<HabitTrackerUserSettings>): HabitTrackerMergedSettings {
	const rawMerged = {
		...globalSettings,
		...userSettings,
		color: userSettings.color ?? globalSettings.defaultColor,
		defaultColor: undefined,
		updateCheckEnabled: undefined
	}

	delete rawMerged.defaultColor
	delete rawMerged.updateCheckEnabled

	return rawMerged
}
