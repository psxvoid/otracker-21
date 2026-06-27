export function longclick(node: HTMLElement, [durationMs, mode]: [number, 'default' | 'touch-drag']) {
	let timer
	let isDownEventFired: boolean = false
	let isLongClickActivated: boolean = false

	const onMouseOrTouchDown = (e: MouseEvent | TouchEvent) => {
		if (isDownEventFired || isLongClickActivated) {
			return
		}

		e.stopPropagation()
		isDownEventFired = true

		if (mode === 'touch-drag' && e.type === 'touchstart') {
			// prevents dragstart and click events from being fired
			e.preventDefault()
		}

		timer = setTimeout(() => {
			isLongClickActivated = true
			node.dispatchEvent(new CustomEvent('longclick', { detail: e }))
			setTimeout(() => {
				// normally should not happen but just in case
				if (!isDownEventFired && isLongClickActivated) {
					isLongClickActivated = false
				}
			}, 500)
			window?.navigator?.vibrate(50)
		}, durationMs)
	}

	const commonAbort = () => {
		isDownEventFired = false
		clearTimeout(timer)
	}

	const onClickUp = (e: MouseEvent | TouchEvent) => {
		commonAbort()
	}

	const onTouchAbort = (e: TouchEvent) => {
		if (!isDownEventFired) {
			return
		}

		// allows click to be triggered after 'preventDefault' in onMouseOrTouchDown
		if (!isLongClickActivated && mode === 'touch-drag') {
			node?.click()
		}

		// why not in the default mode?
		// in the default mode it should be handled by the 'click' event listener
		// which is triggered after 'mouseup' event 

		// 'click' might not be fired in the 'default' mode
		// when touch triggers the long click
		// in that case 'isLongClickActivated' must be reset
		// to avoid the "stuck" state (the return in onMouseOrTouchDown)
		if (mode === 'touch-drag') {
			isLongClickActivated = false
		}

		commonAbort()
	}

	const onShortClick = (e: MouseEvent) => {
		if (isLongClickActivated) {
			isLongClickActivated = false
			e.preventDefault()
			e.stopImmediatePropagation()
			e.stopPropagation()
		}
	}

	const subscriptions: (() => void)[] = []
	const subscribe = <K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean) => {
		if (options != null) {
			node.addEventListener(type, listener, options)
			subscriptions.push(() => node?.removeEventListener(type, listener, options))
		} else {
			node.addEventListener(type, listener)
			subscriptions.push(() => node?.removeEventListener(type, listener))
		}
	}

	if (mode === 'default') {
		subscribe('mousedown', onMouseOrTouchDown)
		subscribe('mouseup', onClickUp)
		subscribe('click', onShortClick, true)
	}

	if (mode === 'touch-drag' || mode == 'default') {
		subscribe('touchstart', onMouseOrTouchDown)
		subscribe('touchend', onTouchAbort)
		subscribe('touchcancel', onTouchAbort)
	}

	return {
		destroy() {
			for(const unsubscribe of subscriptions) {
				unsubscribe()
			}
		}
	}
}
