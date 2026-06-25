
export class DebugLog {
	static defaultPrefix = `[OTracker 21]`

	private prefix?: string

	constructor(private getSettings: () => { debug: boolean }, prefix?: string) {
		this.prefix = prefix == null
			? DebugLog.defaultPrefix
			: prefix.indexOf(DebugLog.defaultPrefix) !== 0
			? `${DebugLog.defaultPrefix} [${prefix}]`
			:	prefix
	}

	debugLog(createMessage: () => string | object) {
		if (typeof createMessage !== 'function') {
			return 
		}

		const settings = this.getSettings()
		if (settings == null || !settings.debug) {
			return	
		}

		const messageOrObject = createMessage()

		if (typeof messageOrObject === 'string') {
			console.log(`${this.prefix}`, messageOrObject);
			return
		}

		console.log(messageOrObject);
	}

	debugError(createMessage: () => string, error?: unknown) {
		if (typeof createMessage !== 'function') {
			return
		}

		const message = createMessage()

		console.error(`${this.prefix} error: ${message}`)

		if (error != null) {
			console.error(error)
		}
	}

	scoped(scopePrefix: string): DebugLog {
		return new DebugLog(this.getSettings, `${this.prefix} [${scopePrefix}]`)
	}
}
