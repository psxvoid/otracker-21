import { DebugLog } from "../debugHelpers"
import { Tap } from "../tap"

const passiveEventOptions = { passive: true }
const nonPassiveEventOptions = { passive: false }

function stopEventPropagation(e: Event) {
	e.stopPropagation()
}

export class LongClickEvent extends Event {
	public static readonly EventType = "longclick"

	public readonly sourceEvent: PointerEvent

	constructor(sourceEvent: PointerEvent, options?: EventInit) {
		if (!(sourceEvent instanceof Event)) {
			throw new Error('The source event is not provided.')
		}

		if (options != null) {
			super(LongClickEvent.EventType, options)
		} else {
			super(LongClickEvent.EventType)
		}

		this.sourceEvent = sourceEvent
	}
}

export function longclick(node: HTMLElement, options: { durationMs: number, logger: DebugLog }) {
	const { durationMs, logger } = options
	const getLogger = (scopeName: () => string) => logger.scoped(() => 'longclick2').scoped(() => `${node.classList}`).scoped(scopeName)

	let timer
	let isDownEventFired: boolean = false
	let isLongClickActivated: boolean = false
	let capturedPointerId: number

	const onPointerDown = (e: PointerEvent) => {
		const logger = getLogger(() => `onMouseOrTouchDown`).scoped(() => `${e.type}`)
		logger.debugLog(() => `Target class list: ${e.currentTarget instanceof HTMLElement ? e.currentTarget.classList : ''}`)

		logger.debugLog(() => `IsDownEventFired: ${isDownEventFired}`)
		logger.debugLog(() => `IsLongClickActivated: ${isLongClickActivated}`)

		if (isLongClickActivated && !isDownEventFired) {
			// should not happen normally, but just in case
			isLongClickActivated = false
		}

		if (isDownEventFired) {
			logger.debugLog(() => `Return`)
			return
		}

		isDownEventFired = true
		capturedPointerId = e.pointerId
		node.setPointerCapture(capturedPointerId)

		const getLoggerScoped1 = () => logger.scoped(() => 'timer')

		timer = setTimeout(() => {
			isLongClickActivated = true
			node.releasePointerCapture(capturedPointerId)

			const logger = getLoggerScoped1()

			logger.debugLog(() => 'Dispatching custom longclick event')
			node.dispatchEvent(new LongClickEvent(e))

			new Tap(document.body, e.clientX, e.clientY)

			if (typeof window?.navigator?.vibrate === 'function') {
				logger.debugLog(() => 'Vibrating.')
				window.navigator.vibrate(50)
			} else {
				logger.debugLog(() => 'Vibrate func is not available.')
			}
		}, durationMs)
	}

	const onPointerAbort = (e: PointerEvent | TouchEvent | MouseEvent | PointerEvent | FocusEvent) => {
		getLogger(() => 'commonAbort').debugLog(() => `isDownEventFired: ${isDownEventFired}: type: ${e.type}`)
		clearTimeout(timer)

		if (!isLongClickActivated && isDownEventFired) {
			node.releasePointerCapture(capturedPointerId)
		}

		if (isDownEventFired) {
			isDownEventFired = false
			if (e.target != null && e.target !== node) {
				// re-dispatch after pointer capture
				e.target.dispatchEvent(new Event(e.type, e))
			}
		}

		// should be handled in onShortClick
		// isLongClickActivated = false
	}

	const onShortClick = (e: MouseEvent) => {
		const logger = getLogger(() => 'onShortClick')

		logger.debugLog(() => `IsDownEventFired: ${isDownEventFired}`)
		logger.debugLog(() => `IsLongClickActivated: ${isLongClickActivated}`)

		if (isLongClickActivated) {
			e.preventDefault()
			e.stopImmediatePropagation()
			e.stopPropagation()
			isLongClickActivated = false
		}
	}

	const subscriptions: (() => void)[] = []
	const subscribeTarget = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions) => {
		if (options != null) {
			target.addEventListener(type, listener, options)
			subscriptions.push(() => target?.removeEventListener(type, listener, options))
		} else {
			target.addEventListener(type, listener)
			subscriptions.push(() => target?.removeEventListener(type, listener))
		}
	}
	const subscribe = <K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions) => {
		subscribeTarget(node, type, listener, options)
	}

	subscribe('pointerdown', onPointerDown, nonPassiveEventOptions)
	subscribe('pointerup', onPointerAbort, passiveEventOptions)
	subscribe('pointercancel', onPointerAbort, passiveEventOptions)
	subscribe('touchcancel', onPointerAbort, passiveEventOptions)

	subscribe('click', onShortClick, true)

	// prevent self-propagation
	const stopPropagation = (type: keyof HTMLElementEventMap) => subscribe(type, stopEventPropagation, passiveEventOptions)

	stopPropagation('longclick' as keyof HTMLElementEventMap)
	// stopPropagation('click')

	stopPropagation('pointerdown')
	// stopPropagation('pointerup')
	// stopPropagation('pointercancel')

	return {
		destroy() {
			for (const unsubscribe of subscriptions) {
				unsubscribe()
			}
		}
	}
}
