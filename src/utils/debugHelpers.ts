
export class DebugLog {
	static defaultPrefix = `[OTracker 21]`
	private static defaultPrefixFactory = (instance: DebugLog) => {
		instance.prefix = instance.prefix == null
			? DebugLog.defaultPrefix
			: instance.prefix.indexOf(DebugLog.defaultPrefix) !== 0
			? `${DebugLog.defaultPrefix} [${instance.prefix}]`
			:	instance.prefix
	}
	private static DisabledLogger = new DebugLog(() => ({ debug: false }))

	private prefix?: string
	private readonly prefixFactoryInit: () => void

	constructor(private getSettings: () => { debug: boolean }, prefixFactory?: () => string) {
		this.prefixFactoryInit = prefixFactory == null
			? () => DebugLog.defaultPrefixFactory(this)
			: () => {
				this.prefix = prefixFactory()
				DebugLog.defaultPrefixFactory(this)
			}
	}

	private initPrefixIfNot(): void {
		if (this.prefix != null) {
			return
		}

		this.prefixFactoryInit()
	}

	debugLog(createMessage: () => string | object) {
		if (typeof createMessage !== 'function') {
			return 
		}

		const settings = this.getSettings()
		if (settings == null || !settings.debug) {
			return	
		}

		this.initPrefixIfNot()

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

		this.initPrefixIfNot()

		console.error(`${this.prefix} error: ${message}`)

		if (error != null) {
			console.error(error)
		}
	}

	scoped(scopePrefixFactory: () => string): DebugLog {
		if (typeof this.getSettings !== 'function' || !this.getSettings().debug) {
			return DebugLog.DisabledLogger
		}

		return new DebugLog(this.getSettings, () => {
			this.initPrefixIfNot()
			return `${this.prefix} [${scopePrefixFactory()}]`
		})
	}
}
