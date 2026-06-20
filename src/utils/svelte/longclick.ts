export function longclick(node, duration = 500) {
  let timer
	let isLongClickActivated: boolean

  const onClickDown = (e: MouseEvent) => {
    timer = setTimeout(() => {
			isLongClickActivated = true
      node.dispatchEvent(new CustomEvent('longclick'))
    }, duration)
  }

  const onClickUp = (e: MouseEvent) => {
		if (isLongClickActivated) {
			isLongClickActivated = false
			e.preventDefault()
			e.stopImmediatePropagation()
			e.stopPropagation()
		}
    clearTimeout(timer)
  }

  node.addEventListener('mousedown', onClickDown)
  node.addEventListener('mouseup', onClickUp)
  node.addEventListener('touchstart', onClickDown)
  node.addEventListener('touchend', onClickUp)

  return {
    destroy() {
      node.removeEventListener('mousedown', onClickDown)
      node.removeEventListener('mouseup', onClickUp)
      node.removeEventListener('touchstart', onClickDown)
      node.removeEventListener('touchend', onClickUp)
    }
  }
}
