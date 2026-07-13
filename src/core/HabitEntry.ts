import { HabitTrackerMergedSettings } from "src/settings"
import { DateUtils, dayMs } from "../utils/DateUtils"
import { StringUtils } from "../utils/StringUtils"
import { indexOf } from "src/utils/ArrayUtils"

export const enum EntryType {
    Legacy,
    Counter,
    CounterRange
}

export interface HabitEntryLegacy {
    type: EntryType.Legacy

    date: Date,
}

export interface HabitEntryWithCounter {
    type: EntryType.Counter,

    date: Date,
    counter: number,
}

export interface HabitEntryRange {
    type: EntryType.CounterRange,

    date: Date,
    counter: number,
    range: number
}

export type HabitEntry = HabitEntryLegacy | HabitEntryWithCounter | HabitEntryRange

export function parseEntry(dateEntryStr: string): HabitEntry {
    if (dateEntryStr == null) {
        throw new Error("The provided entry string is null or undefined.")
    }

    if (dateEntryStr.length === 0) {
        throw new Error("The provided entry string is empty.")
    }

		if (StringUtils.isNullOrWhiteSpace(dateEntryStr)) {
        throw new Error("The provided entry contains whitespace but should not.")
    }

    const matches = /^(\d{1,4})-(\d{1,2})-(\d{1,2})([Cc])?(\d{1,})?([Xx])?(\d{1,})?(.*)$/.exec(dateEntryStr) // Review: refactoring: use tokenizer instead?

    if (matches == null || matches.length < 5) {
        throw new Error("Unable to match YYYY-MM-DD entry date.")
    }

    if (matches[4] != null && (matches[5] == null || matches[5].length === 0)) {
        throw new Error("Unable to match the entry counter.")
    }

    if (matches[6] != null && (matches[7] == null || matches[7].length === 0)) {
        throw new Error("Unable to match the entry range.")
    }

    if (matches[8] != null && matches[8].length > 0) {
        throw new Error("Unexpected character at the end of the entry.")
    }

    const year = parseInt(matches[1])
    const month = parseInt(matches[2]) - 1
    const day = parseInt(matches[3])

    if (month < 0 || month > 11) {
        throw new Error(`Month is out of range but should between 1 and 12 (inclusive). Was: ${month}`)
    }

    if (day < 1 || day > 31) {
        throw new Error(`Day is out of range but should between 1 and 31 (inclusive). Was: ${day}`)
    }

    const date = new Date(year, month, day)

    const counter: number = matches[4] != null && matches[5] != null && matches[5].length > 0
        ? parseInt(matches[5])
        : -1

    const range: number = matches[6] != null && matches[7] != null && matches[7].length > 0
        ? parseInt(matches[7])
        : -1

    if (counter == 0) {
        throw new Error("Counter value must be greater than zero.")
    }

    if (range == 0) {
        throw new Error("Range value must be greater than zero.")
    }

    if (range > 0) {
        return {
            type: EntryType.CounterRange,
            counter: counter > 0 ? counter : 1,
            date, range,
        }
    }

    if (counter > 0) {
        return {
            type: EntryType.Counter,
            date, counter
        }
    }

    return {
        type: EntryType.Legacy,
        date
    }
}

export function serializeEntry(entry: HabitEntry): string {
    const { date } = entry

    const dateStr = DateUtils.serializeDashedYYYYMMDD(date)

    if (entry.type === EntryType.Legacy
        || (entry.type === EntryType.Counter && entry.counter <= 1)
        || (entry.type === EntryType.CounterRange && entry.counter <= 1 && entry.range <= 1)) {
        return dateStr
    }

    if (entry.type === EntryType.Counter) {
        const { counter } = entry

        return `${dateStr}C${counter}`
    }

    if (entry.type === EntryType.CounterRange) {
        const { counter, range } = entry
        const counterStr: string = counter > 1 ? `C${counter}` : ''
        const rangeStr: string = range > 1 ? `X${range}` : ''

        return `${dateStr}${counterStr}${rangeStr}`
    }

    throw new Error("Unable to determine a habit entry type.")
}

export class HabitEntryUtils {
    static defaultComparer(a: HabitEntry, b: HabitEntry): number {
        return DateUtils.defaultComparer(a.date, b.date)
    }

    static equal(a: HabitEntry, b: HabitEntry): boolean {
        return DateUtils.equal(a.date, b.date)
    }

    static promoteIncrementRange(a: HabitEntry): HabitEntry {
        if (a.type === EntryType.Legacy) {
            return {
                type: EntryType.CounterRange,
                date: a.date,
                counter: 1,
                range: 2
            }
        }

        if (a.type === EntryType.Counter) {
            return {
                type: EntryType.CounterRange,
                date: a.date,
                counter: a.counter,
                range: 2
            }
        }

        if (a.type === EntryType.CounterRange) {
            return {
                type: EntryType.CounterRange,
                date: a.date,
                counter: a.counter,
                range: a.range + 1,
            }
        }

        throw new Error('Unsupported habit entry type.')
    }

    static indexOf(entries: readonly HabitEntry[], entryToFind: HabitEntry): number {
			return indexOf(entries, x => HabitEntryUtils.equal(entryToFind, x))
    }
}

function hasCounter(entry: HabitEntry): entry is HabitEntryWithCounter | HabitEntryRange {
    return entry.type === EntryType.Counter || entry.type === EntryType.CounterRange
}

function sameCounter(a: HabitEntry, b: HabitEntry): boolean {
    const aIsCounter = hasCounter(a)
    const bIsCounter = hasCounter(b)

    if (!aIsCounter && !bIsCounter) {
        return true
    }

    if (aIsCounter && bIsCounter) {
        return a.counter === b.counter
    }

    return aIsCounter
        ? a.counter === 1
        : (b as HabitEntryWithCounter).counter === 1
}

export function compact(entries: readonly HabitEntry[]): readonly HabitEntry[] {
    if (entries.length <= 1) {
        return entries
    }

    const compacted: HabitEntry[] = []
    let currentAcc: HabitEntry = entries[0]
    for (let i = 1; i < entries.length; i++) {
        const current = entries[i]
        const previous = entries[i - 1]

        const hoursDiff = (Number(current.date) - Number(previous.date)) / 3600000
        const shouldIncrement = hoursDiff === 24 && sameCounter(current, previous)

        if (shouldIncrement) {
            currentAcc = HabitEntryUtils.promoteIncrementRange(currentAcc)
            continue
        }

        compacted.push(currentAcc)
        currentAcc = current
    }

    if (currentAcc !== compacted[compacted.length - 1]) {
        compacted.push(currentAcc)
    }

    return compacted
}

type HabitEntryUnpacked = HabitEntryLegacy | HabitEntryWithCounter

export function unpack(entries: readonly HabitEntry[]): readonly HabitEntry[] {
    return entries.flatMap((e: HabitEntry) => {
        if (e.type !== EntryType.CounterRange) {
            return e
        }

        const { date, counter, range } = e
        const firstDate = Number(date)
        const type = counter > 1
            ? EntryType.Counter
            : EntryType.Legacy

        const result: HabitEntry[] = []
        for (let i = 0; i < range; i++) {
            const dateUnpacked = DateUtils.addDays(firstDate, i)

            const entryUnpacked: HabitEntryUnpacked = counter > 1
                ? { type, date: dateUnpacked, counter } as HabitEntryWithCounter
                : { type, date: dateUnpacked } as HabitEntryLegacy

            result.push(entryUnpacked)
        }

        return result
    })
}

export function limitByViewRange(entries: readonly HabitEntry[], mergedSettings: HabitTrackerMergedSettings): readonly HabitEntry[] {
	const { lastDisplayedDate } = mergedSettings

	if (lastDisplayedDate == null || StringUtils.isNullOrWhiteSpace(lastDisplayedDate)) {
		return entries
	}

	const lastDate = new Date(lastDisplayedDate)
	const { daysToShow } = mergedSettings
	const firstDisplayedDate = DateUtils.addDays(lastDate, -1 * daysToShow)

	return entries.filter(x => x.date >= firstDisplayedDate && x.date <= lastDate)
}
