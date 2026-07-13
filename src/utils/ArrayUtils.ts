	export function indexOf<T>(arr: readonly T[], predicate: (item: T) => boolean): number {
			const entry = arr.find(predicate)
			return entry == null ? -1 : arr.indexOf(entry)
	}
