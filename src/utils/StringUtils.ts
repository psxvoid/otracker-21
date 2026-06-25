export class StringUtils {
	static isNullOrWhiteSpace(str?: string) {
		return str == null || str.length === 0 || /\s+/gm.test(str)
	}
}
