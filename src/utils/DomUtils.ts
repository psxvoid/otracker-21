export function getTouchFromEvent(event: TouchEvent): Touch {
	return event.touches[0] ?? event.changedTouches[0]
}

export class DomUtils {
	static hasClientY(e: Event): e is Event & { clientY: number } {
		return e != null && typeof (e as Event & { clientY: number }).clientY === 'number'
	}

	static hasTouches(e: Event): e is TouchEvent {
		return e != null
			&& (
				(e as TouchEvent).touches != null && (e as TouchEvent).touches[0] != null
				|| (e as TouchEvent).changedTouches != null && (e as TouchEvent).changedTouches[0] != null
			)
	}

	static getEventClientY(event: MouseEvent | PointerEvent | DragEvent | TouchEvent): number {
		if (DomUtils.hasClientY(event)) {
			return event.clientY
		}

		if (DomUtils.hasTouches(event)) {
			return getTouchFromEvent(event).clientY
		}

		return 0;
	}
}
