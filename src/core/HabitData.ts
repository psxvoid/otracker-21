import { TFile } from "obsidian"

export interface HabitData {
	file: TFile
	title?: string
	firstPassOrder: number
	secondPassOrder?: number
}

export function getHabitName(habit: HabitData): string {
	return typeof habit.title === 'string' && habit.title.length > 0
		? habit.title
		: habit.file.basename
}
