type EventTargetHTMLElement = Omit<DragEvent, 'target'> & { target: HTMLElement }

export class DomUtils {
	static isTargetHTMLElement(e: DragEvent): e is EventTargetHTMLElement {
		if (e.target == null || typeof (e.target as HTMLElement).getBoundingClientRect !== 'function') {
			return false
		}

		return true
	}
}
