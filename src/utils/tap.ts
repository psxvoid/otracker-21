
const CenterOffsetPx = 60/2 // keep in sync with css or use a better approach

export class Tap {
	private readonly targetElement: HTMLElement

	constructor(private readonly parent: Element, clientX: number, clientY: number) {
		this.targetElement = document.createElement('div')
		this.targetElement.classList.add('ot21-tap')
		this.targetElement.style.left = `${clientX - CenterOffsetPx}px`
		this.targetElement.style.top = `${clientY - CenterOffsetPx}px`
		parent.appendChild(this.targetElement)

		setTimeout(() => {
			parent.removeChild(this.targetElement)
		}, 500)
	}
}
