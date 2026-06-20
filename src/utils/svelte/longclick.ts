export function longclick(node: HTMLElement, duration = 500) {
	let timer
	let isLongClickActivated: boolean

	const onClickDown = (e: MouseEvent | TouchEvent) => {
		timer = setTimeout(() => {
			isLongClickActivated = true
			node.dispatchEvent(new CustomEvent('longclick'))
			window?.navigator?.vibrate(50)
		}, duration)
	}

	const onClickUp = (e: MouseEvent | TouchEvent) => {
		clearTimeout(timer)
	}

	const onShortClick = (e: MouseEvent) => {
		if (isLongClickActivated) {
			isLongClickActivated = false
			e.preventDefault()
			e.stopImmediatePropagation()
			e.stopPropagation()
		}
	}

	node.addEventListener('mousedown', onClickDown)
	node.addEventListener('mouseup', onClickUp)
	node.addEventListener('touchstart', onClickDown)
	node.addEventListener('touchend', onClickUp)
	node.addEventListener('click', onShortClick, true)

	return {
		destroy() {
			node.removeEventListener('mousedown', onClickDown)
			node.removeEventListener('mouseup', onClickUp)
			node.removeEventListener('touchstart', onClickDown)
			node.removeEventListener('touchend', onClickUp)
		}
	}
}
