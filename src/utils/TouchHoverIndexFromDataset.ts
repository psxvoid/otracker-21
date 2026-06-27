export class TouchHoverIndexFromDataset {
	constructor(
		private readonly datasetSelector: string,
		private readonly datasetField: string,
		private readonly isEnabledPredicate?: () => boolean,
		private readonly onHoverChange?: (index: number) => void
	) {
	}

	private _lastFoundIndex: number = -1

	public get lastFoundIndex(): number {
		return this.isEnabledPredicate != null && !this.isEnabledPredicate()
			? this._lastFoundIndex
			: -1
	}

	processPointerEvent(event: PointerEvent) {
		if (this.isEnabledPredicate != null && !this.isEnabledPredicate()) {
			return
		}

		const touchElement = document.elementFromPoint(event.clientX, event.clientY);
		const row = touchElement?.closest<HTMLElement>(this.datasetSelector)

		if (row == null) return

		const rawIndex = Number(row.dataset[this.datasetField])
		const index = Number.isInteger(rawIndex) ? rawIndex : -1
		const indexBefore = this._lastFoundIndex

		this._lastFoundIndex = index

		if (index != indexBefore && this.onHoverChange) {
			this.onHoverChange(index)
		}
	}
}
