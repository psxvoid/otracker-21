
export class DebugLog {
	static pluginName: string = 'OTracker 21'

	constructor(private getSettings: () => { debug: boolean }) {
	}

	debugLog(message: string) {
		const settings = this.getSettings()
		if (settings && !settings.debug) {
			return	
		}

		console.log(`[${DebugLog.pluginName}]`, message);
	}

	debugError(message: string, error?: unknown) {
		console.error(`${DebugLog.pluginName} error: ${message}`)

		if (error != null) {
			console.error(error)
		}
	}
}
