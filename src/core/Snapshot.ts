import { StringUtils } from "src/utils/StringUtils";
import { HabitData } from "./HabitData";
import { compact, EntryType, HabitEntry, parseEntry, serializeEntry, unpack } from "./HabitEntry";
import { App, TFile } from "obsidian";

export interface HabitLightSnapshot {
	// TODO: add support for advanced URI plugin identity
	basename: string
	path: string

	title?: string
	firstPassOrder: number
	secondPassOrder?: number
}

export interface HabitFullSnapshot extends HabitLightSnapshot {
	entries: readonly string[]
}

/**
 * Terminology:
 * - local snapshot = snapshot is stored in the owning code-block
 * - global snapshot = snapshot is stored in the plugin's settings (at least part of it)
 */
export const enum SnapshotType {
	/**
	 * Stores all habits and their entries in the local snapshot. Each tick/untick rebuilds the snapshot and writes it onto a disk.
	 */
	LocalFull,

	/**
	 * Stores habits (links to them) in the plugin settings allowing to reuse them between many code blocks.
	 * Code blocks only store an ID of a snapshot, allowing to preserve integrity after habits move/delete operations.
	 */
	GlobalLight,
}

export interface SnapshotJson {
	type: SnapshotType,
}

export interface LocalFullCodeBlockSnapshotJson {
	type: SnapshotType.LocalFull
	version: number
	habits: readonly HabitFullSnapshot[]
}

export interface GlobalLightCodeBlockSnapshotJson {
	type: SnapshotType.GlobalLight
	version: number
}

export interface GlobalLightSettingSnapshotJson {
	type: SnapshotType.GlobalLight
	version: number,
	habits: readonly HabitLightSnapshot[]
}

export type CodeBlockJSON = LocalFullCodeBlockSnapshotJson | GlobalLightCodeBlockSnapshotJson
export type SettingJSON = GlobalLightSettingSnapshotJson

function toLightSnapshot(habit: HabitData, habitName: string): HabitLightSnapshot {
	const title = !StringUtils.isNullOrWhiteSpace(habitName) && habitName !== habit.file.basename
		? habitName
		: !StringUtils.isNullOrWhiteSpace(habit.title) && habit.title !== habit.file.basename
		? habit.title
		: ''

	const { firstPassOrder, secondPassOrder } = habit

	const { path, basename } = habit.file

	return {
		path,
		basename,

		title,
		firstPassOrder,
		secondPassOrder,
	}
}

function toFullSnapshot(habit: HabitData, habitName: string, entryData: readonly HabitEntry[]): HabitFullSnapshot {
	const entries = compact(entryData).map(x => serializeEntry(x))

	return {
		...(toLightSnapshot(habit, habitName)),
		entries,
	}
}

function toHabitData(habitSnapshot: HabitLightSnapshot, app: App): HabitData {
	const file = app.vault.getFileByPath(habitSnapshot.path) ?? app.metadataCache.getFirstLinkpathDest(
				habitSnapshot.basename,
				habitSnapshot.path
		) ?? { path: habitSnapshot.path, basename: habitSnapshot.basename } as TFile

	if (!(file instanceof TFile)) {
		Object.setPrototypeOf(file, TFile)
	}

	return {
		file,
		title: habitSnapshot.title,
		firstPassOrder: habitSnapshot.firstPassOrder,
		secondPassOrder: habitSnapshot.secondPassOrder,
	}
}

function getStringHashCode(value: string, initValue: number = 13): number {
	let hashCode = initValue * value.length

	for (let j = 0; j < value.length; j++) {
		hashCode += value.charCodeAt(j) * 23
	}

	return hashCode
}

function computeHabitDataHashCode(habits: readonly HabitData[]): number {
	let hashCode = 3 * habits.length

	for (let i = 0; i < habits.length; i++) {
		const { file, firstPassOrder, secondPassOrder } = habits[i]

		let pathHashCode = 13 * file.basename.length + firstPassOrder * 17 + (secondPassOrder ?? 0) * 19
		for (let j = 0; j < file.basename.length; j++) {
			pathHashCode += file.basename.charCodeAt(j) * 23
		}

		hashCode += pathHashCode
	}

	return hashCode
}

function computeHabitEntryHashCode(habitName: string, entries: readonly HabitEntry[]): number {
	let hashCode = 7 * entries.length + getStringHashCode(habitName, 13)

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i]
		const { type, date } = entry

		hashCode += Number(date)

		if (type === EntryType.Counter || type === EntryType.CounterRange) {
			const { counter } = entry
			hashCode += 29 * counter
		}

		if (type === EntryType.CounterRange) {
			const { range } = entry
			hashCode += 31 * range
		}
	}

	return hashCode
}

function getKey(file: TFile): string {
	return file.path
}

export class Snapshot {
	private _habits: readonly HabitData[] = []
	private readonly habitEntries: Map<string, readonly HabitEntry[]> = new Map()
	private readonly habitEntriesHashCodes: Map<string, number> = new Map()
	private readonly habitNames: Map<string, string> = new Map()
	private _habitsHashCode: number = 0
	private _entriesHashCode: number = 0
	private parsed: boolean = false

	constructor(private readonly mode: SnapshotType) {
	}

	get hashCode(): number {
		return this._habitsHashCode + this._entriesHashCode
	}

	get isParsed(): boolean {
		return this.parsed
	}

	get type(): SnapshotType {
		return this.mode
	}

	get habits(): readonly HabitData[] {
		return this._habits
	}

	public getEntriesForFile(file: TFile): readonly HabitEntry[] {
		return this.habitEntries.get(getKey(file)) ?? []
	}

	equals(other: Snapshot): boolean {
		if (other == null) {
			return false
		}

		if (other === this) {
			return true
		}

		return this.hashCode === other.hashCode
	}

	setHabits(habits: readonly HabitData[]): void {
		this._habits = habits
		this._habitsHashCode = computeHabitDataHashCode(habits)
	}

	setEntries(habitFile: TFile, entries: readonly HabitEntry[]): void {
		const key = getKey(habitFile)
		this.habitEntries.set(key, entries)
		this.habitEntriesHashCodes.set(
			key,
			computeHabitEntryHashCode(this.habitNames.get(key) ?? '', entries)
		)

		this._entriesHashCode = 0
		for (const entryHashCode of this.habitEntriesHashCodes.values()) {
			this._entriesHashCode += entryHashCode
		}
	}

	setHabitTitle(file: TFile, title?: string) {
		if (title == null || StringUtils.isNullOrWhiteSpace(title) || title === file.basename) {
			return
		}

		this.habitNames.set(getKey(file), title)

		// recalculate hash codes
		this.setEntries(file, this.habitEntries.get(getKey(file)) ?? [])
	}

	toLocalFullJSON(): LocalFullCodeBlockSnapshotJson {
		const habits = this._habits.map(habit => toFullSnapshot(
			habit,
			this.habitNames.get(getKey(habit.file)) ?? habit.file.basename,
			this.habitEntries.get(getKey(habit.file)) ?? []
		))

		return {
			habits,
			version: this.hashCode,
			type: SnapshotType.LocalFull,
		}
	}

	toGlobalLightJSON(): {
		codeBlockJson: GlobalLightCodeBlockSnapshotJson,
		settingsJson: GlobalLightSettingSnapshotJson,
	} {
		const habits = this._habits.map(habit => toLightSnapshot(
			habit,
			this.habitNames.get(getKey(habit.file)) ?? habit.file.basename,
		))

		const version = this.hashCode

		return {
			codeBlockJson: {
				version,
				type: SnapshotType.GlobalLight
			},
			settingsJson: {
				habits,
				version,
				type: SnapshotType.GlobalLight,
			}
		}
	}

	static parseLocal(snapshot: LocalFullCodeBlockSnapshotJson, app: App): Snapshot {
		const parsedSnapshot = new Snapshot(SnapshotType.LocalFull)
		parsedSnapshot.parsed = true

		const habits: HabitData[] = []
		for (const habit of snapshot.habits) {
			const parsedHabit = toHabitData(habit, app)
			habits.push(parsedHabit)
			const entries = unpack(habit.entries.map(x => parseEntry(x)))
			parsedSnapshot.setEntries(parsedHabit.file, entries)
		}

		parsedSnapshot.setHabits(habits)

		return parsedSnapshot
	}

	static parseGlobalLight(snapshot: GlobalLightSettingSnapshotJson, app: App): Snapshot {
		const parsedSnapshot = new Snapshot(SnapshotType.GlobalLight)
		parsedSnapshot.parsed = true

		const habits: HabitData[] = []
		for (const habit of snapshot.habits) {
			const parsedHabit = toHabitData(habit, app)
			habits.push(parsedHabit)
		}

		parsedSnapshot.setHabits(habits)

		return parsedSnapshot
	}
}

