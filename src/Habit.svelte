<script lang="ts">
	import { isValidCSSColor } from './utils'

	import {onDestroy} from 'svelte'
	import { TFile } from 'obsidian'
	import {getDayOfTheWeek} from './utils'
	import { DebugLog } from './utils/debugHelpers'
	import { differenceInCalendarDays, parseISO, format } from 'date-fns'
	import { compact, EntryType, HabitEntry, HabitEntryUtils, HabitEntryWithCounter, limitByViewRange, parseEntry, serializeEntry } from './core/HabitEntry'
	import { DateUtils, dayMs } from './utils/DateUtils'
	import { ClickMode, HabitTrackerMergedSettings, HabitTrackerSettings, HabitTrackerUserSettingsSnapshot, mergeSettings, SnapshotMode } from './settings'
	import { longclick } from './utils/svelte/longclick'
	import { StringUtils } from './utils/StringUtils'
	import { Snapshot, SnapshotType } from './core/Snapshot'
	import { parseEntries } from './HabitLoader'
	import { OTrackerPlugin } from './plugin'

	export let app
	export let name
	export let path
	export let dates
	export let pluginName
	export let userSettings: Partial<HabitTrackerSettings>
	export let globalSettings: HabitTrackerSettings
	export let snapshot: Snapshot
	export let plugin: OTrackerPlugin
	
	let entries: readonly HabitEntry[] = []
	let frontmatter: { entries: readonly string[], color?: string, maxGap?: number, title?: string } = { entries: [] }
	let habitName = name
	let savingChanges = false // this helps the file change listner know if we made a change. if not, it reloads the data for the habit
	let logger = new DebugLog(() => globalSettings, () => 'Habit')
	let mergedSettings: HabitTrackerMergedSettings
	let hideStreak = false

	const enum ClickAction {
		TickIncrement,
		Toggle
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
		let hasCounter = false
		const days = dates.map((date) => {
			const ticked = entrySet.has(date)
			const dateParsed = parseEntry(date)

			let gap = false
			let habitCount = 0

			if (ticked) {
				const currentDateIdx = HabitEntryUtils.indexOf(entries, dateParsed)
				const currentEntry = entries[currentDateIdx]

				const isCounter = currentEntry.type === EntryType.Counter
				hasCounter = hasCounter || isCounter
				habitCount = isCounter
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

		hideStreak = hasCounter && mergedSettings.hideStreaksForCounters

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
				new Date(lastEntry.date.getTime() + (maxGap + 1) * dayMs),
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

	const init = async function (entriesParsed?: readonly HabitEntry[]) {
		logger.debugLog(() => `Loading habit '${habitName}'`)

		mergedSettings = mergeSettings(globalSettings, userSettings)

		const file: TFile | null = app.vault.getFileByPath(path)
			?? snapshot.isParsed
			? snapshot.habits.find(x => x.file.path === path)?.file ?? null
			: null

		if (file == null) {
			logger.debugLog(() => `Unable to find the file for the habit: ${habitName}`)
			entries = []
			return
		}

		if (entriesParsed != null) {
			entries = entriesParsed
			if (!snapshot.isParsed && snapshot.type === SnapshotType.LocalFull) {
				snapshot.setEntries(file, limitByViewRange(entries, mergedSettings))
			}
		} else if (snapshot.isParsed && snapshot.type === SnapshotType.LocalFull) { 
			entries = snapshot.getEntriesForFile(file)
		} else {
			const { unpacked, limited } = await parseEntries(file, mergedSettings, app, logger.scoped(() => habitName).scoped(() => `parseEntries`))

			// Review: limit entries by view, issue: when limited, frontmatter values are lost on save (patch range instead of replace?)
			entries = unpacked 

			if (!snapshot.isParsed && snapshot.type === SnapshotType.LocalFull) {
				snapshot.setEntries(file, limited)
			}
		}

		const getEntrySource = () => entriesParsed != null
			? 'cache'
			: snapshot.isParsed
			? 'snapshot'
			: 'vault' 

		logger.debugLog(() => `The habit entries are loaded from: ${getEntrySource()}`)

		if (!snapshot.isParsed && snapshot.type === SnapshotType.LocalFull) {
			snapshot.setHabitTitle(file, habitName)
		}

		if (!StringUtils.isNullOrWhiteSpace(frontmatter.title) && frontmatter.title !== habitName) {
			habitName = frontmatter.title
			if (!snapshot.isParsed && snapshot.type === SnapshotType.LocalFull) {
				snapshot.setHabitTitle(file, frontmatter.title)
			}
		}

		logger.debugLog(() => `Habit "${habitName}": Found ${entries.length} entries`)
		logger.debugLog(() => entries)
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

	async function toggleHabit(event: MouseEvent & KeyboardEvent, date: string, isLongClick: boolean) {
		event.stopPropagation()
		const file = app.vault.getAbstractFileByPath(path)
		if (!file || !(file instanceof TFile)) {
			new Notice(`${pluginName}: file missing while trying to toggle habit`)
			return
		}

		const parsedEntry: HabitEntry = parseEntry(date)

		// when local full snapshot is used it will contain limited entries
		// load all entries to update the frontmatter
		const allEntries = snapshot.isParsed && snapshot.type === SnapshotType.LocalFull
			?	(await parseEntries(file, mergedSettings, app, logger.scoped(() => habitName).scoped(() => `parseEntries`))).unpacked
			: entries

		const existingEntry = allEntries.find(x => HabitEntryUtils.equal(x, parsedEntry))
		logger.debugLog(() => `Existing entry was ${existingEntry == null ? 'not' : ''} found...`)

		let newEntries: HabitEntry[] = [...allEntries]

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

		const entriesSerialized = compact(newEntries).map(x => serializeEntry(x))

		app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter['entries'] = entriesSerialized
		})

		if (snapshot.type === SnapshotType.LocalFull) {
			snapshot.setHabitTitle(habitName)
			snapshot.setEntries(file, limitByViewRange(entries, mergedSettings))
		}

		const currentSnapshot: HabitTrackerUserSettingsSnapshot = userSettings as HabitTrackerUserSettingsSnapshot

		if (snapshot.type === SnapshotType.LocalFull && (currentSnapshot?.snapshot == null || currentSnapshot.snapshot.version != snapshot.hashCode)) {
			plugin.saveCodeBlockFunc({
				...currentSnapshot,
				snapshot: snapshot.toLocalFullJSON()
			})
			return
		}
		if (snapshot.type === SnapshotType.GlobalLight && (currentSnapshot?.snapshot == null || currentSnapshot.snapshot.version != snapshot.hashCode)) {
			const json = snapshot.toGlobalLightJSON()
			plugin.saveSettingsFunc((settings, options) => {
				if (snapshot != null) {
					const existingSnapshot = settings.snapshots.find(x => x.version === snapshot.hashCode)

					if (existingSnapshot != null) {
						options.skipSave = true	
						return
					}

					settings.snapshots.push(json.settingsJson)
				}
			})
			plugin.saveCodeBlockFunc({
				...currentSnapshot,
				snapshot: json.codeBlockJson
			})
			return
		}
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
				const entriesParsed = (await parseEntries(file, mergedSettings, app, logger)).unpacked

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
				{#if day.habitCount < 2 && showStreaks && !hideStreak && day.streakEnd && day.streakCount > 1}{day.streakCount}{/if}
				{#if day.habitCount > 1}{day.habitCount}{/if}
			</span>
			</div>
		{/each}
	{/if}
