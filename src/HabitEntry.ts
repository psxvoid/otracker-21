import { DateUtils } from "./DateUtils"

export const enum EntryType {
	Legacy,
	Counter,
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

export type HabitEntry = HabitEntryLegacy | HabitEntryWithCounter

export function parseEntry(dateEntryStr: string): HabitEntry {
	if (dateEntryStr == null) {
		throw new Error("The provided entry string is null or undefined.")
	}

	if (dateEntryStr.length === 0) {
		throw new Error("The provided entry string is empty.")
	}

	if (/\s+/gm.test(dateEntryStr)) {
		throw new Error("The provided entry contains whitespace but should not.")
	}

	const matches = /^(\d{1,4})-(\d{1,2})-(\d{1,2})([Cc])?(\d{1,})?(.*)$/.exec(dateEntryStr) // Review: refactoring: use tokenizer instead?

	if (matches == null || matches.length < 5) {
		throw new Error("Unable to match YYYY-MM-DD entry date.")
	}

	if (matches[4] != null && matches[5] == null) {
		throw new Error("Unable to match the entry counter.")
	}

	if (matches[6] != null && matches[6].length > 0) {
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

	if (matches.length === 7 && matches[4] != null && matches[5] != null) {
		const counter = parseInt(matches[5])
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

	if (entry.type === EntryType.Legacy) {
		return dateStr
	}

	if (entry.type === EntryType.Counter) {
		const { counter } = entry

		return `${dateStr}C${counter}`
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

	static indexOf(entries: readonly HabitEntry[], entryToFind: HabitEntry): number {
		const entry = entries.find(x => HabitEntryUtils.equal(entryToFind, x))
		return entry == null ? -1 : entries.indexOf(entry)
	}
}
