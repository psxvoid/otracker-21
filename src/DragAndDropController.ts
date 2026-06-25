import { HabitData } from "src/core/HabitData"
import { DebugLog } from "./utils/debugHelpers";

interface HabitOrderUpdate {
	habit: HabitData,
	newIndex?: number
}

const computeFmOrder = (habit: HabitData, newOrder: number) => habit.firstPassOrder === newOrder ? undefined : newOrder;

export class DragAndDropController {
	private readonly dragHabit: HabitData
	private readonly dragContainerOffsetY: number
	private readonly dragHabitIndexBeforeDrag: number = -1

	private dragDoubleClientY?: number

	private dragHabitIndex: number = -1
	private dragHoverHabitIndex: number = -1

	constructor(
		dragHabit: HabitData,
		dragIndex: number,
		dragContainerOffsetY: number,
		private readonly getHabits: () => readonly HabitData[],
		private readonly onUpdateCallback: () => void,
		private readonly logger: DebugLog,
	) {
		if (dragHabit == null) {
			throw new Error("Provided drag habit is not initialized.")
		}

		if (dragIndex < 0) {
			throw new Error("Provided drag index must be greater than 0.")
		}

		this.dragHabit = dragHabit
		this.dragHabitIndexBeforeDrag = dragIndex
		this.dragHabitIndex = dragIndex
		this.dragHoverHabitIndex = dragIndex
		this.dragContainerOffsetY = dragContainerOffsetY

	}

	public get dragIndex(): number {
		return this.dragHabitIndex
	}

	public set dragIndex(value: number) {
		this.dragHabitIndex = value
	}

	public get hoverIndex() {
		return this.dragHoverHabitIndex
	}

	public set hoverIndex(value: number) {
		this.dragHoverHabitIndex = value
	}

	public get dragDoubleTopOffset(): number {
		return this.dragDoubleClientY ?? 0
	}

	public get habit(): HabitData {
		return this.dragHabit
	}

	swapHabits(): readonly HabitData[] {
		if (this.dragHabitIndex === this.dragHoverHabitIndex) {
			return this.getHabits()
		}

		const fromIndex: number = this.dragHabitIndex
		const toIndex: number = this.dragHoverHabitIndex
		const habits = [...this.getHabits()]

		;[habits[fromIndex], habits[toIndex]] = [habits[toIndex], habits[fromIndex]]
	
		this.dragHabitIndex = this.dragHoverHabitIndex

		return habits
	}

	updateDragDoubleTop = (clientY: number) => {
		if (clientY === 0) {
			return
		}

		this.dragDoubleClientY = clientY + this.dragContainerOffsetY
		this.onUpdateCallback()
	}
	
	public computeHabitOrderUpdates(index: number, orderedHabits: readonly HabitData[]): readonly HabitOrderUpdate[] {
		const habit = this.dragHabit

		if (this.dragHabitIndexBeforeDrag === index) {
			return []
		}

		const indexIncremented = index + 1
		const totalHabits = orderedHabits.length

		const habitOrderBefore = habit.secondPassOrder ?? this.dragHabitIndexBeforeDrag + 1
		const newIndex = computeFmOrder(habit, indexIncremented)

		// items "above" this row are unaffected
		const upperBorderLineIndex = Math.min(indexIncremented, habitOrderBefore) - 1
		// items "below" this row are unaffected
		const lowerBorderLineIndex = Math.max(indexIncremented, habitOrderBefore) - 1

		this.logger.debugLog(() => `Upper: ${upperBorderLineIndex}, Lower: ${lowerBorderLineIndex}`)

		const toUpdateHabits: HabitOrderUpdate[] = [{ habit, newIndex }]
		let isPreviousVanished = false
		for (let i = upperBorderLineIndex; i <= lowerBorderLineIndex; i++) {
			const possiblyChangedHabit = orderedHabits[i]
			const { secondPassOrder } = possiblyChangedHabit

			if (secondPassOrder == null && !isPreviousVanished) continue

			// Review: refactoring: simplify and use i (new habit index)?
			let newIndex
			if (isPreviousVanished) {
				isPreviousVanished = false
				newIndex = i + 1
				this.logger.debugLog(() => `Previous element has vanished, setting a new index: ${newIndex}`)
			} else if (secondPassOrder == null || possiblyChangedHabit === habit) {
				continue;
			} else if (secondPassOrder === 1 && secondPassOrder === indexIncremented) {
				// prevents a first habit to become 0, should be moved to the second row
				newIndex = 2
			} else if (secondPassOrder === totalHabits && secondPassOrder === indexIncremented) {
				// prevents the last habit to go out of bounds
				newIndex = totalHabits - 1
			} else {
				if (secondPassOrder <= indexIncremented) {
					// update all habits that are above
					newIndex = secondPassOrder - 1
				} else {
					// update all habits that are below
					newIndex = secondPassOrder + 1
				}
			}
			newIndex = computeFmOrder(possiblyChangedHabit, newIndex)
			toUpdateHabits.push({ habit: possiblyChangedHabit, newIndex })
			isPreviousVanished = newIndex === undefined
		}

		return toUpdateHabits
	}

}
