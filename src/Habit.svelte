<script lang="ts">
	import { isValidCSSColor } from './utils'

	import {onDestroy} from 'svelte'
	import {parseYaml, TAbstractFile, TFile} from 'obsidian'
	import {getDayOfTheWeek} from './utils'
	import { DebugLog } from './utils/debugHelpers'
	import { differenceInCalendarDays, parseISO, format } from 'date-fns'
	import { EntryType, HabitEntry, HabitEntryUtils, HabitEntryWithCounter, parseEntry, serializeEntry } from './core/HabitEntry'
	import { DateUtils } from './utils/DateUtils'
	import { ClickMode, HabitTrackerMergedSettings, HabitTrackerSettings, mergeSettings } from './settings'
	import { longclick } from './utils/svelte/longclick'
	import { StringUtils } from './utils/StringUtils'

	export let app
	export let name
	export let path
	export let dates
	export let pluginName
	export let userSettings: Partial<HabitTrackerSettings>
	export let globalSettings: HabitTrackerSettings
	
	let entries: HabitEntry[] = []
	let frontmatter: { entries: readonly string[], color?: string, maxGap?: number, title?: string } = { entries: [] }
	let habitName = name
	let savingChanges = false // this helps the file change listner know if we made a change. if not, it reloads the data for the habit
	let logger = new DebugLog(() => globalSettings, () => 'Habit')
	let mergedSettings: HabitTrackerMergedSettings
	const isTFile = (abstractFile: TAbstractFile | null): abstractFile is TFile => abstractFile != null && abstractFile instanceof TFile

	const enum ClickAction {
		TickIncrement,
		Toggle
	}

	interface FrontmatterTyped {
		entries: readonly string[],
		title?: string
	}

	const getFrontmatter = async function (file: TAbstractFile | null): Promise<FrontmatterTyped> {

		if (!isTFile(file)) {
			logger.debugLog(() => `No file found for path: ${path}`)
			return { entries: [] }
		}

		try {
			const fmCached = app.metadataCache.getFileCache(file)?.frontmatter

			if (fmCached != null) {
				return fmCached
			}

			const fileContent = await app.vault.cachedRead(file)
			const frontmatter = fileContent.split('---')[1]

			if (!frontmatter) {
				return { entries: [] }
			}

			const fmParsed = parseYaml(frontmatter)
			if (fmParsed['entries'] == undefined) {
				fmParsed['entries'] = []
			}

			return fmParsed
		} catch (error) {
			logger.debugLog(() => `Error in habit ${habitName}: error.message`)
			return { entries: [] }
		}
	}

	const parseEntries = async (file: TFile) => {
			const frontmatter = await getFrontmatter(file)

			logger.debugLog(() => `Frontmatter for ${path} ↴`)
			logger.debugLog(() => frontmatter)

			return frontmatter.entries.map(entryStr => parseEntry(entryStr)).sort(HabitEntryUtils.defaultComparer)
	}

	// Reactive color resolution - updates whenever frontmatter, userSettings, or globalSettings change
	$: {
		mergedSettings = mergeSettings(globalSettings, userSettings)
		const resolvedColor = frontmatter.color || mergedSettings.color
		if (resolvedColor && isValidCSSColor(resolvedColor)) {
			customStyles = `--habit-bg-ticked: ${resolvedColor}`
		} else {
			customStyles = ''
		}
	}
	$: showStreaks = mergedSettings.showStreaks

	$: renderedDates = (() => {
		const maxGap = Number(frontmatter.maxGap) || 0
		const entrySet = new Set(entries.map(x => DateUtils.serializeDashedYYYYMMDD(x.date)))
		const gapStyle = mergedSettings.gapStyle
				
		// Pass 1 — mark each date
		const days = dates.map((date) => {
			const ticked = entrySet.has(date)
			const dateParsed = parseEntry(date)

			let gap = false
			let habitCount = 0

			if (ticked) {
				const currentDateIdx = HabitEntryUtils.indexOf(entries, dateParsed)
				const currentEntry = entries[currentDateIdx]

				habitCount = currentEntry.type === EntryType.Counter
					? currentEntry.counter
					: 1
			}

			if (!ticked && maxGap > 0) {
				// Gap only between consecutive entries whose gap ≤ maxGap
				const parsed = parseISO(date)
				for (let i = 0; i < entries.length - 1; i++) {
					const prev = entries[i].date
					const next = entries[i + 1].date
					if (!gap &&
						differenceInCalendarDays(parsed, prev) > 0 &&
						differenceInCalendarDays(next, parsed) > 0
					) {
						if (differenceInCalendarDays(next, prev) - 1 <= maxGap) {
							gap = true
						}
					}

				}
			}
			return {
				date,
				ticked,
				gap,
				deadline: false,
				title: '',
				streakStart: false,
				streakEnd: false,
				streakCount: 0,
				classes: '',
				habitCount,
			}
		})

		// Pass 2 — identify streak boundaries and counts
		let streakStartIdx = -1
		for (let i = 0; i <= days.length; i++) {
			const inStreak = i < days.length && (days[i].ticked || days[i].gap)
			if (inStreak && streakStartIdx === -1) {
				streakStartIdx = i
			} else if (!inStreak && streakStartIdx !== -1) {
				// Streak just ended at i-1
				const endIdx = i - 1

				// Find first and last ticked dates in this visible run
				let firstTickDate = null
				let lastTickDate = null
				for (let j = streakStartIdx; j <= endIdx; j++) {
					if (days[j].ticked) {
						if (!firstTickDate) firstTickDate = days[j].date
						lastTickDate = days[j].date
					}
				}

				// streakStart: only if the streak truly begins here
				// (no entry within maxGap before the first visible date)
				if (firstTickDate) {
					const entryToFind = parseEntry(firstTickDate)
					const firstTickIdx = HabitEntryUtils.indexOf(entries, entryToFind)
					const prevEntry = firstTickIdx > 0 ? entries[firstTickIdx - 1] : null
					const continuesFromBefore =
						prevEntry &&
						differenceInCalendarDays(
							entryToFind.date,
							prevEntry.date,
						) -
							1 <=
							maxGap
					if (!continuesFromBefore) {
						days[streakStartIdx].streakStart = true
					}
				} else {
					days[streakStartIdx].streakStart = true
				}

				// streakEnd: only if the streak truly ends within the visible range
				if (lastTickDate) {
					const entryToFind = parseEntry(lastTickDate)
					const lastTickIdx = HabitEntryUtils.indexOf(entries, entryToFind)
					const nextEntry =
						lastTickIdx < entries.length - 1 ? entries[lastTickIdx + 1] : null
					const continuesAfter =
						nextEntry &&
						differenceInCalendarDays(
							nextEntry.date,
							entryToFind.date,
						) -
							1 <=
							maxGap
					if (!continuesAfter) {
						days[endIdx].streakEnd = true
					}
				} else {
					days[endIdx].streakEnd = true
				}

				// Count: walk backward through entries from the last visible tick
				let count = 0
				if (lastTickDate) {
					const entryToFind = parseEntry(lastTickDate)
					const anchorIdx = HabitEntryUtils.indexOf(entries, entryToFind)
					if (anchorIdx !== -1) {
						count = 1
						for (let j = anchorIdx; j > 0; j--) {
							const gapDays =
								differenceInCalendarDays(
									entries[j].date,
									entries[j - 1].date,
								) - 1
							if (gapDays > maxGap) break
							count++
						}
					}
				}

				days[endIdx].streakCount = count

				streakStartIdx = -1
			}
		}

		// Pass 3 — ghost dot on the last day of the gap (deadline to keep streak alive)
		if (maxGap > 0 && entries.length > 0) {
			const today = format(new Date(), 'yyyy-MM-dd')
			const lastEntry = entries[entries.length - 1]
			const deadlineDate = format(
				new Date(lastEntry.date.getTime() + (maxGap + 1) * 86400000),
				'yyyy-MM-dd',
			)
			if (deadlineDate >= today) {
				const ghostDay = days.find((d) => d.date === deadlineDate)
				if (ghostDay && !ghostDay.ticked) {
					ghostDay.deadline = true
				}
			}
		}

		// Build classes
		for (const day of days) {
			const cls = [
				'habit-tracker__cell',
				`habit-tracker__cell--${getDayOfTheWeek(day.date)}`,
				'habit-tick',
			]
			if (day.ticked) cls.push('habit-tick--ticked')
			if (showStreaks) {
				const inStrk = day.ticked || day.gap
				if (inStrk) cls.push('habit-tick--streak')
				if (day.gap && !day.ticked) {
					cls.push('habit-tick--streak-gap')
					cls.push(gapStyle === 'faded' ? 'habit-tick--gap-faded' : 'habit-tick--gap-default')
				}
				if (day.streakStart) cls.push('habit-tick--streak-start')
				if (day.streakEnd) cls.push('habit-tick--streak-end')
				if (day.streakCount > 0 && !day.streakEnd)
					cls.push('habit-tick--streak-count')
				if (day.deadline) cls.push('habit-tick--streak-deadline')
			}
			day.classes = cls.join(' ')
		}

		return days
	})()

	const init = async function (entriesParsed?: HabitEntry[]) {
		logger.debugLog(() => `Loading habit '${habitName}'`)

		const file: TAbstractFile | null = app.vault.getAbstractFileByPath(path)

		if (entriesParsed != null) {
			entries = entriesParsed
		} else if (isTFile(file)) {
			entries = await parseEntries(file)
		}

		if (isTFile(file) && !StringUtils.isNullOrWhiteSpace(frontmatter.title) && frontmatter.title !== habitName) {
			habitName = frontmatter.title
		}

		logger.debugLog(() => `Habit "${habitName}": Found ${entries.length} entries`)
		logger.debugLog(() => entries)
		mergedSettings = mergeSettings(globalSettings, userSettings)
	}

	function getClickAction(params: { isShiftPressed: boolean, isLongClick: boolean }): ClickAction {
		if (params.isLongClick) {
			return ClickAction.Toggle
		}

		if (mergedSettings.clickMode === ClickMode.ClickIncreasesTickCount) {
			if (!params.isShiftPressed) {
				return ClickAction.TickIncrement
			} else {
				return ClickAction.Toggle
			}
		} else if (mergedSettings.clickMode === ClickMode.ClickToggleTick) {
			if (!params.isShiftPressed) {
				return ClickAction.Toggle
			} else {
				return ClickAction.TickIncrement
			}
		} else {
			throw new Error('Unknown click mode.')
		}
	}

	const toggleHabit = function (event: MouseEvent & KeyboardEvent, date: string, isLongClick: boolean) {
		event.stopPropagation()
		const file = this.app.vault.getAbstractFileByPath(path)
		if (!file || !(file instanceof TFile)) {
			new Notice(`${pluginName}: file missing while trying to toggle habit`)
			return
		}

		const parsedEntry: HabitEntry = parseEntry(date)
		const existingEntry = entries.find(x => HabitEntryUtils.equal(x, parsedEntry))
		logger.debugLog(() => `Existing entry was ${existingEntry == null ? 'not' : ''} found...`)

		let newEntries: HabitEntry[] = [...entries]

		const clickAction = getClickAction({ isShiftPressed: event.shiftKey, isLongClick })

		if (existingEntry != null) {
			if (clickAction === ClickAction.Toggle) {
				logger.debugLog(() => 'Untick...')
				newEntries = newEntries.filter(x => !HabitEntryUtils.equal(x, existingEntry))
			} else {
				logger.debugLog(() => 'Tick...')
				if (existingEntry.type === EntryType.Counter) {
			    logger.debugLog(() => `Incrementing counter (was: ${existingEntry.counter})`)
					existingEntry.counter = existingEntry.counter + 1
				} else {
			    logger.debugLog(() => `Promoting an entry to the counter.`);
					(existingEntry as unknown as any).type = EntryType.Counter;
					(existingEntry as unknown as HabitEntryWithCounter).counter = 2
				}
			}
		} else {
			logger.debugLog(() => `Adding a new entry: ${JSON.stringify(parsedEntry)}`)
			newEntries.push(parsedEntry)
		}

		entries = newEntries.sort(HabitEntryUtils.defaultComparer)
		logger.debugLog(() => `Updated entries`)
		logger.debugLog(() => entries)

		savingChanges = true

		const entriesSerialized = entries.map(x => serializeEntry(x))

		this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter['entries'] = entriesSerialized
		})
	}

	init()

	let tooltipEl = null

	function showTooltip(e, day) {
		const hasDeadline = day.deadline
		const hasStreakAndCountConflict = showStreaks && day.streakEnd && (day.streakCount > 1 || day.habitCount > 1)

		if (!hasDeadline && !hasStreakAndCountConflict) {
			return
		}

		hideTooltip()
		const rect = e.currentTarget.getBoundingClientRect()
		const createTooltipText = (): string => {
			const newLineChar = '\n'
			const deadlineText = hasDeadline ? 'Last day to keep your streak alive!' : ''
			const streakText = hasStreakAndCountConflict ? `Streak: ${day.streakCount}${newLineChar}Ticked: ${day.habitCount}` : ''

			return [
				deadlineText,
				streakText
			].filter(x => x != null && x.length > 0).join(newLineChar)
		}

		tooltipEl = document.body.createDiv({
			cls: 'ht21-tooltip',
			text: createTooltipText(),
		})
		tooltipEl.style.left = `${rect.left + rect.width / 2}px`
		tooltipEl.style.top = `${rect.top - 4}px`
	}

	function hideTooltip() {
		if (tooltipEl) {
			tooltipEl.remove()
			tooltipEl = null
		}
	}

	const modifyRef = app.vault.on('modify', async (file,) => {
		if (file.path === path) {
			if (!savingChanges) {
				const entriesParsed = await parseEntries(file)

				let modified = false
				if (entries.length !== entriesParsed.length) {
					modified = true
				}

				if (!modified) {
					for(let i = 0; i < entries.length; i++) {
						if (!HabitEntryUtils.equal(entries[i], entriesParsed[i])) {
							modified = true
							break;
						}
					}
				}
				
				if (modified) {
					logger.debugLog(() => 'oh shit, i was modified')
					init(entriesParsed)
				} else {
					logger.debugLog(() => 'i was modified but entries have not changed')
				}
			}
			savingChanges = false
		}
	})

	onDestroy(() => {
		app.vault.offref(modifyRef)
		hideTooltip()
	})


</script>

<!-- <div bind:this={rootElement}> -->
	<div class="habit-tracker__cell--name habit-tracker__cell"
		draggable="false"
		role="listitem"
		>
		<a
			href={path}
			aria-label={path}
			class="internal-link">{habitName}
		</a>
	</div>
	{#if renderedDates.length}
		{#each renderedDates as day}
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<div
				class={day.classes}
				ticked={day.ticked}
				on:mouseenter={(e) => { showTooltip(e, day); } }
				on:mouseleave={hideTooltip}
				on:click={(e) => toggleHabit(e, day.date, false)}
				use:longclick={{durationMs: 1000, logger }}
				on:longclick={ (e) => toggleHabit(e.sourceEvent, day.date, true) }
			>
				<span
					class="habit-tick__inner"
				>
				{#if day.habitCount < 2 && showStreaks && day.streakEnd && day.streakCount > 1}{day.streakCount}{/if}
				{#if day.habitCount > 1}{day.habitCount}{/if}
			</span>
			</div>
		{/each}
	{/if}
