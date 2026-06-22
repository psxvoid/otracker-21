export class DateUtils {
	static defaultComparer(a: Date, b: Date): number {
		return a.getTime() - b.getTime()
	}

	static equal(a: Date, b: Date): boolean {
		return a.getTime() === b.getTime()
	}

	static serializeDashedYYYYMMDD(date: Date): string {
		const year = `${date.getFullYear()}`.substring(-2)

		// month is zero-based (0 = January, 11 = December)
		const month = `${date.getMonth() + 1}`.padStart(2, '0')
		const day = `${date.getDate()}`.padStart(2, '0')

		return `${year}-${month}-${day}`
	}
}
