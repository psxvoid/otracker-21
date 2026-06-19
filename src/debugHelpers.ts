
export class DebugLog {
	static defaultPrefix = `[OTracker 21]`

	private prefix?: string

	constructor(private getSettings: () => { debug: boolean }, prefix?: string) {
		this.prefix = prefix == null
			? DebugLog.defaultPrefix
			: `${DebugLog.defaultPrefix} [${prefix}]`
	}

	debugLog(messageOrObject: string | object) {
		const settings = this.getSettings()
		if (settings == null || !settings.debug) {
			return	
		}

		if (typeof messageOrObject === 'string') {
			console.log(`${this.prefix}`, messageOrObject);
			return
		}

		console.log(messageOrObject);
	}

	debugError(message: string, error?: unknown) {
		console.error(`${this.prefix} error: ${message}`)

		if (error != null) {
			console.error(error)
		}
	}
}
