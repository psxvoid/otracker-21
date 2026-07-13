import { App, FrontMatterCache, parseYaml, TFile } from "obsidian";
import { HabitData } from "./core/HabitData";
import { DebugLog } from "./utils/debugHelpers";
import { HabitTrackerMergedSettings } from "./settings";
import { delay } from "./utils/AsyncUtils";
import { HabitEntry, HabitEntryUtils, limitByViewRange, parseEntry, unpack } from "./core/HabitEntry";
import { Snapshot, SnapshotType } from "./core/Snapshot";

export type HabitProvider = () => readonly TFile[]

function parseHabitOrder(habitOrder: undefined | number | null, min: number, max: number): number | undefined {
	if (habitOrder == null || typeof habitOrder !== 'number' || !Number.isInteger(habitOrder) || habitOrder < min || habitOrder > max) {
		return
	}

	return habitOrder
}

async function throttle(throttleLevel: number): Promise<void> {
	if (throttleLevel > 0) {
		await delay(0)
	}
}

export async function getHabits(habitProvider: HabitProvider, logger: DebugLog, app: App, settings: HabitTrackerMergedSettings, throttleLevel: number = 0): Promise<readonly HabitData[]> {
	logger.debugLog(() => `Loading habits`)

	const habitFiles = habitProvider()

	// Filter to only include files, not subfolders
	let hasCustomOrder = false
	const firstPassOrderMap = new Map<number, HabitData>()
	const secondPassOrderMap = new Map<number, HabitData>()

	// Sort files alphabetically by name
	const sortedFiles: readonly TFile[] = Array.from(habitFiles)
		.sort((a, b) => a.basename.localeCompare(b.basename))

	const sortedHabits: HabitData[] = []
	for (let index = 0; index < sortedFiles.length; index++) {
		const file = sortedFiles[index]

		const fmCache = app.metadataCache.getFileCache(file)?.frontmatter ?? {}
		const firstPassOrder = index + 1
		const parsedSecondPassOrder = parseHabitOrder(fmCache[settings.habitOrderField], 1, habitFiles.length)
		const secondPassOrder = parsedSecondPassOrder != null && secondPassOrderMap.has(parsedSecondPassOrder)
			? undefined // prevent duplicate order items to interfere
			: parsedSecondPassOrder
		const title = fmCache['title'] ?? await getFrontmatter(file, logger, app, throttleLevel > 0, throttleLevel)

		const habitData: HabitData = { file, title, firstPassOrder, secondPassOrder }

		firstPassOrderMap.set(firstPassOrder, habitData)

		if (secondPassOrder != null) {
			hasCustomOrder = hasCustomOrder || secondPassOrder !== firstPassOrder
			secondPassOrderMap.set(secondPassOrder, habitData)
		}

		sortedHabits.push(habitData)

		await throttle(throttleLevel)
	}

	if (!hasCustomOrder) {
		return sortedHabits
	}

	const secondPassOrderHabits: HabitData[] = []
	let indexIncrement = 0;

	for (let i = 1; i <= sortedFiles.length; i++) {
		const customOrderHabit = secondPassOrderMap.get(i)

		if (customOrderHabit != null) {
			secondPassOrderHabits.push(customOrderHabit)
			indexIncrement++
		} else {
			let firstPassHabit = firstPassOrderMap.get(i - indexIncrement)

			while (firstPassHabit?.secondPassOrder != null) {
				// skip already processed elements with custom order
				indexIncrement--
				firstPassHabit = firstPassOrderMap.get(i - indexIncrement)
			}

			if (firstPassHabit == null) {
				throw new Error("Incorrectly computed habit order detected.")
			}

			secondPassOrderHabits.push(firstPassHabit)
		}
	}

	return secondPassOrderHabits
}

interface FrontmatterTyped {
	entries: readonly string[],
	title?: string
}

function isFrontmatterTyped(cache: FrontMatterCache | null | undefined): cache is FrontmatterTyped {
	return cache != null && cache.entries != null && Array.isArray(cache.entries)
}

export async function getFrontmatter(file: TFile, logger: DebugLog, app: App, ignoreCache: boolean = false, throttleLevel: number = 0): Promise<FrontmatterTyped> {
	try {
		if (!ignoreCache) {
			const fmCached = app.metadataCache.getFileCache(file)?.frontmatter

			if (isFrontmatterTyped(fmCached)) {
				return fmCached
			}
		}

		await throttle(throttleLevel)

		const fileContent = await app.vault.cachedRead(file)
		const frontmatter = fileContent.split('---')[1]

		if (!frontmatter) {
			return { entries: [] }
		}

		const fmParsed = parseYaml(frontmatter)
		if (fmParsed['entries'] == undefined) {
			fmParsed['entries'] = []
		}

		return fmParsed
	} catch (error) {
		logger.debugError(() => `Error during frontmatter loading ↴`, error)
		return { entries: [] }
	}
}

export async function parseEntries(file: TFile, settings: HabitTrackerMergedSettings, app: App, logger: DebugLog, throttleLevel: number = 0): Promise<{ unpacked: readonly HabitEntry[], limited: readonly HabitEntry[] }>  {
		const frontmatter = await getFrontmatter(file, logger.scoped(() => 'getFrontmatter'), app, throttleLevel > 0, throttleLevel)

		logger.debugLog(() => `Frontmatter for ${file.path} ↴`)
		logger.debugLog(() => frontmatter)

		const unpacked = unpack(frontmatter.entries.map(entryStr => parseEntry(entryStr)).sort(HabitEntryUtils.defaultComparer))
		const limited = limitByViewRange(unpacked, settings)

		return  { unpacked, limited }
}

export async function lazyLoadSnapshot(habitProvider: HabitProvider, app: App, settings: HabitTrackerMergedSettings, logger: DebugLog, snapshotType: SnapshotType) {
	const throttleLevel = 1
	const habits = await getHabits(habitProvider, logger, app, settings, throttleLevel)	
	const snapshot = new Snapshot(snapshotType)
	snapshot.setHabits(habits)

	await throttle(throttleLevel)

	if (snapshotType !== SnapshotType.LocalFull) {
		return snapshot
	}
	
	const files = habitProvider()

	for (const file of files) {
		const entries = await parseEntries(file, settings, app, logger.scoped(() => 'parseEntries'), throttleLevel)
		snapshot.setEntries(file, entries.limited)
		throttle(throttleLevel)
	}

	return snapshot
}
