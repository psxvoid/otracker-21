<script lang="ts">
	import {pluralize, renderPrettyDate} from './utils'
	import {
		createDailyNote,
		getDailyNote,
		getAllDailyNotes,
	} from 'obsidian-daily-notes-interface'
	import {onMount, onDestroy} from 'svelte'

	import Habit from './Habit.svelte'

	import {
		TFile,
		TFolder,
		type Plugin,
	} from 'obsidian'
	import {getDateAsString, getDayOfTheWeek} from './utils.js'
	import {
		eachDayOfInterval,
		getDate,
		isToday,
		parseISO,
		subDays,
	} from 'date-fns'
	import {DebugLog} from './utils/debugHelpers'
	import { getHabitName, HabitData } from './core/HabitData'
	import { DragAndDropController } from './DragAndDropController'
	import { TouchHoverIndexFromDataset } from './utils/TouchHoverIndexFromDataset'
	import { LongClickEvent, longclick } from './utils/svelte/longclick'
	import { setMinHabitNameWidthPx } from './settings'
	import { isRTL } from './utils/ObsidianHelpers'

	// TypeScript interfaces for better state management
	interface HabitTrackerSettings {
		path: string
		firstDisplayedDate: string
		lastDisplayedDate: string
		daysToShow: number
		debug: boolean
		matchLineLength: boolean
		habitOrderField: string
		minHabitNameWidthPx: number
	}


	interface ComputedState {
		dates: string[]
		habits: readonly HabitData[]
	}

	interface UIState {
		fatalError: string
		rootElement: HTMLElement | null
		habitSource: TFile | TFolder | null
	}

	interface DragAndDropState {
		isDragStarted: boolean,
		habit: HabitData
	}

	interface HabitTrackerState {
		settings: HabitTrackerSettings
		computed: ComputedState
		ui: UIState
		dragAndDrop: DragAndDropState
	}

	const updateDragAndDropState = (newState: Partial<DragAndDropState>) => {
		state.dragAndDrop = {
			...state.dragAndDrop,
			...newState
		}
	}

	export let app: Plugin['app']
	export let pluginName: string
	export let globalSettings: {
		path: string
		firstDisplayedDate: string
		lastDisplayedDate: string
		daysToShow: number
		debug: boolean
		matchLineLength: boolean
		defaultColor: string
		showStreaks: boolean
		openDailyNoteOnClick: boolean
		gapStyle: string
		habitOrderField: string
		minHabitNameWidthPx: number
	}
	export let userSettings: Partial<{
		path: string
		firstDisplayedDate: string
		lastDisplayedDate: Date
		daysToShow: number
		debug: boolean
		matchLineLength: boolean
		color: string
		showStreaks: boolean
		gapStyle: string
		habitOrderField: string
	}>

	let resizeObserver: ResizeObserver | undefined

	const createMockController = () => ({
		destroyDragController: function() {},
		updateDragDoubleTop: function() {},
		swapHabits: function() {}
	} as unknown as DragAndDropController)

	let dragController: DragAndDropController = createMockController()

	const destroyDragController = () => {
		dragController = createMockController()
		state.dragAndDrop = {
			isDragStarted: false,
			dragDoubleTopOffset: -1,
		}
	}
	const isDragStarted = () => dragController instanceof DragAndDropController

	const touchHoverIndexer = new TouchHoverIndexFromDataset(
		'.habit-tracker__row[data-ht21-habit-index]',
		'ht21HabitIndex',
		() => isDragStarted(),
		(hoverIndex) => dragController.hoverIndex = hoverIndex
	)
	
	const getTouchHoverIndex = (e: PointerEvent) => touchHoverIndexer.processPointerEvent(e)

	const logger = new DebugLog(() => state.settings, () => 'HabitTracker')
	const getRowScopedEventLogger = (habit: HabitData, e: { type: string }) => {
		return logger.scoped(() => 'row').scoped(() => getHabitName(habit)).scoped(() => e.type)
	}
	const rowDebugEventWrapper = <E extends Event, U extends any[], R>(e: E, index: number, habit: HabitData, func: (e: E, index: number, habit: HabitData, ...funcArgs: U) => R, ...args: U): void=> {
		const logger = getRowScopedEventLogger(habit, e)
		let hasError: boolean = true
		try {
			logger.debugLog(() => `Entry index: ${index}`)
			func(e, index, habit, ...args)
			hasError = false
			logger.debugLog(() => `Done without errors.`)
		} finally {
			if (hasError) {
				logger.debugLog(() => `Ended with an exception.`)
			}
		}
	}

	const parseHabitOrder = (habitOrder: undefined | number | null, min: number, max: number): number | undefined => {
		if (habitOrder == null || typeof habitOrder !== 'number' || !Number.isInteger(habitOrder) || habitOrder < min || habitOrder > max) {
			return
		}

		return habitOrder
	}

	// Default settings - use global settings as defaults
	const createDefaultSettings = (): HabitTrackerSettings => ({
		path: globalSettings.path,
		firstDisplayedDate:
			globalSettings.firstDisplayedDate ||
			getDateAsString(subDays(new Date(), globalSettings.daysToShow - 1)),
		lastDisplayedDate: getDateAsString(new Date()),
		daysToShow: globalSettings.daysToShow,
		debug: globalSettings.debug,
		matchLineLength: globalSettings.matchLineLength,
		habitOrderField: globalSettings.habitOrderField,
		minHabitNameWidthPx: globalSettings.minHabitNameWidthPx,
	})

	// Initialize unified state
	let state: HabitTrackerState = {
		settings: createDefaultSettings(),
		computed: {
			dates: [],
			habits: [],
		},
		ui: {
			fatalError: '',
			rootElement: null,
			habitSource: null,
		},
		dragAndDrop: {
			isDragStarted: false,
			dragDoubleTopOffset: -1,
		}
	}

	const init = async function (userSettings: Partial<HabitTrackerSettings>) {
		// Clean up path (remove trailing slash)
		if (userSettings.path) {
			userSettings.path = userSettings.path.replace(/\/$/, '')
		}

		// Smart date/daysToShow logic: explicit user settings take priority
		const hasExplicitFirstDate = userSettings.firstDisplayedDate !== undefined
		const hasExplicitLastDate =
			userSettings.lastDisplayedDate !== undefined ||
			globalSettings.lastDisplayedDate != undefined
		const hasExplicitDaysToShow = userSettings.daysToShow !== undefined

		// Start with defaults
		// TODO: use mergeSettings
		let resolvedSettings = {
			path: userSettings.path || state.settings.path,
			firstDisplayedDate: '',
			lastDisplayedDate:
				userSettings.lastDisplayedDate ||
				globalSettings.lastDisplayedDate ||
				state.settings.lastDisplayedDate,
			daysToShow:
				userSettings.daysToShow !== undefined
					? userSettings.daysToShow
					: state.settings.daysToShow,
			matchLineLength:
				userSettings.matchLineLength !== undefined
					? userSettings.matchLineLength
					: state.settings.matchLineLength,
			debug:
				userSettings.debug !== undefined
					? userSettings.debug
					: state.settings.debug,
			habitOrderField: userSettings?.habitOrderField ?? globalSettings?.habitOrderField,
			minHabitNameWidthPx: globalSettings?.minHabitNameWidthPx
		}

		// Apply smart firstDisplayedDate logic
		if (hasExplicitFirstDate) {
			// User provided firstDisplayedDate - use it directly
			resolvedSettings.firstDisplayedDate = userSettings.firstDisplayedDate!
			// If user also provided lastDisplayedDate, recalculate daysToShow to match the actual range
			if (hasExplicitLastDate) {
				const startDate = parseISO(userSettings.firstDisplayedDate!)
				const endDate = parseISO(userSettings.lastDisplayedDate!)
				resolvedSettings.daysToShow = eachDayOfInterval({
					start: startDate,
					end: endDate,
				}).length
			}
		} else if (hasExplicitDaysToShow || hasExplicitLastDate) {
			// User provided daysToShow and/or lastDisplayedDate but not firstDisplayedDate - calculate firstDisplayedDate from lastDisplayedDate
			resolvedSettings.firstDisplayedDate = getDateAsString(
				subDays(
					parseISO(resolvedSettings.lastDisplayedDate),
					resolvedSettings.daysToShow - 1,
				),
			)
		} else {
			// No explicit user settings - use defaults
			resolvedSettings.firstDisplayedDate = state.settings.firstDisplayedDate
		}

		state.settings = resolvedSettings

		// Only validate essential business logic
		try {
			await validateEssentials(state.settings)
		} catch (error) {
			state.ui.fatalError = `Could not start: ${error.message}`
			logger.debugError(() => `${state.ui.fatalError}`)
			return
		}
		logger.debugLog(() => state.settings)

		state.computed.dates = eachDayOfInterval({
			start: parseISO(state.settings.firstDisplayedDate),
			end: parseISO(state.settings.lastDisplayedDate),
		}).map((date) => getDateAsString(date))

		logger.debugLog(() => `Will show habits for the following dates:`)
		logger.debugLog(() => state.computed.dates)

		// Load habits
		state.computed.habits = getHabits(state.settings.path)
		if (state.computed.habits && state.computed.habits.length) {
			const count = state.computed.habits.length
			logger.debugLog(() => `Found ${count} ${pluralize(count, 'habit')} at "${state.settings.path}" ↴`)
			logger.debugLog(() => state.computed.habits)
		} else {
			// TODO add a button so they can create a habit
			state.ui.fatalError = `No habits found at "${state.settings.path}"`
			logger.debugLog(() => `No habits found at ${state.settings.path}`)
			return
		}

		logger.debugLog(() => `Initialization completed successfully`)
	}

	const onLongClickStartDrag = async (event: LongClickEvent, index: number, habit: HabitData) => {
		const { sourceEvent } = event
		const logger = getRowScopedEventLogger(habit, sourceEvent).scoped(() => 'onLongClick')

		if (isDragStarted()) {
			logger.debugLog(() => `Already started.`)
			return
		}

		if (!(sourceEvent.target instanceof HTMLElement) || !sourceEvent.target.closest('.habit-tracker__cell--name')) {
			logger.debugLog(() => `Unable to get cell name element.`)
			return
		}

		await startDrag(habit, index, sourceEvent)

		logger.debugLog(() => `Drag is successfully started.`)
	}

	const scrollToEnd = function () {
		if (!state.ui.rootElement) {
			logger.debugLog(() => `scrollToEnd: rootElement is null, cannot scroll`)
			return
		}

		const target = document.querySelector('div.habit-tracker')

		if (!(target instanceof HTMLElement)) {
			logger.debugLog(() => "The scroll target is not HTML Element, cannot scroll.")
			return
		}

		const scroll = () => {
			const scrollLeft = 99999999 * (isRTL(app.vault) ? -1 : 1)
			requestAnimationFrame(() => {
				target.scrollLeft = scrollLeft
			})
			logger.debugLog(() => `scrollToEnd requested.`)
		}

		if (resizeObserver == null) {
			resizeObserver = new ResizeObserver(scroll)
			resizeObserver.observe(target)
		};

		scroll()
	}

	const validateEssentials = async function (
		settings: Partial<HabitTrackerSettings>,
	) {
		// Only validate critical business logic that TypeScript can't catch
		if (!settings.path) {
			throw new Error('path is required - where should I load habits from?')
		}

		// Check if the path exists in the vault (Obsidian-specific validation)
		const source = app.vault.getAbstractFileByPath(settings.path)
		if (!source) {
			// Try with .md extension as fallback
			const mdSource = app.vault.getAbstractFileByPath(`${settings.path}.md`)
			if (!mdSource) {
				throw new Error(`"${settings.path}" doesn't exist in your vault`)
			}
		}

		logger.debugLog(() => `Final settings are valid ↴`)
		return true
	}

	const openDailyNote = async function (date: string) {
		const moment = (window as any).moment(date)
		const allNotes = getAllDailyNotes()
		const existingNote = getDailyNote(moment, allNotes)
		const note = existingNote ?? (await createDailyNote(moment))
		await app.workspace.getLeaf(false).openFile(note)
	}

	const getHabits = function (path: string): HabitData[] {
		logger.debugLog(() => `Loading habits`)
		state.ui.habitSource = app.vault.getAbstractFileByPath(path)

		if (state.ui.habitSource && state.ui.habitSource instanceof TFolder) {
			// Filter to only include files, not subfolders
			const allItems = state.ui.habitSource.children
			const filesOnly = allItems.filter((item) => item instanceof TFile)
			const count = filesOnly.length
			logger.debugLog(
				() =>
					`"${path}" points to a folder with ${count} ${pluralize(count, 'file')} inside (ignoring subfolders)`,
			)
			let hasCustomOrder = false
			const firstPassOrderMap = new Map<number, HabitData>()
			const secondPassOrderMap = new Map<number, HabitData>()

			// Sort files alphabetically by name
			const sortedFiles = filesOnly
				.sort((a, b) => a.basename.localeCompare(b.basename))
				.map((file, index) => {
					const fmCache = app.metadataCache.getFileCache(file)?.frontmatter ?? {}
					const firstPassOrder = index + 1
					const parsedSecondPassOrder = parseHabitOrder(fmCache[state.settings.habitOrderField], 1, filesOnly.length)
					const secondPassOrder = parsedSecondPassOrder != null && secondPassOrderMap.has(parsedSecondPassOrder)
						? undefined // prevent duplicate order items to interfere
						: parsedSecondPassOrder
					const title = fmCache['title']
					
					const habitData: HabitData = { file, title, firstPassOrder, secondPassOrder }

					firstPassOrderMap.set(firstPassOrder, habitData)

					if (secondPassOrder != null) {
						hasCustomOrder = hasCustomOrder || secondPassOrder !== firstPassOrder
						secondPassOrderMap.set(secondPassOrder, habitData)
					}

					return habitData
				})

			if (hasCustomOrder) {
				const secondPassOrderHabits: HabitData[] = []
				let indexIncrement = 0;

				for (let i = 1; i <= sortedFiles.length; i++) {
					const customOrderHabit = secondPassOrderMap.get(i)

					if (customOrderHabit != null) {
						secondPassOrderHabits.push(customOrderHabit)	
						indexIncrement++
					} else {
						let firstPassHabit = firstPassOrderMap.get(i - indexIncrement)

						while(firstPassHabit?.secondPassOrder != null) {
							// skip already processed elements with custom order
							indexIncrement--
							firstPassHabit = firstPassOrderMap.get(i - indexIncrement)
						}

						if (firstPassHabit == null) {
							throw new Error("Incorrectly computed habit order detected.")
						}

						secondPassOrderHabits.push(firstPassHabit)
					}
				}

				return secondPassOrderHabits
			}

			return sortedFiles
		}

		if (state.ui.habitSource && state.ui.habitSource instanceof TFile) {
			logger.debugLog(() => `${path} points to a file`)
			return [state.ui.habitSource as HabitData]
		}

		state.ui.habitSource = app.vault.getAbstractFileByPath(`${path}.md`)
		if (state.ui.habitSource) {
			logger.debugLog(() => `Adjusted ${path} to ${path}.md and found a file`)
			return [state.ui.habitSource as HabitData]
		}

		logger.debugLog(() => `${path} is not found`)
		return []
	}

	$: if (state.ui.rootElement) {
		setTimeout(() => {
			scrollToEnd()
		}, 50)
	}

	$: {
		if (isDragStarted() && dragController.dragIndex !== dragController.hoverIndex) {
			logger.debugLog(() => `Drag: Swapping habits: ${dragController.dragIndex} and ${dragController.hoverIndex}`)

			const habits = dragController.swapHabits()

			if (habits !== state.computed.habits) {
				state.computed.habits = habits
			}
		}
	}

	const startDrag = async (
		habit: HabitData,
		index: number,
		event: PointerEvent
	) => {
		const logger = getRowScopedEventLogger(habit, event).scoped(() => 'startDrag')

		const rootElement = state?.ui?.rootElement

		if (rootElement == null) {
			logger.debugLog(() => 'Unable to get drag container root element. Return.')
			return
		}

		updateDragAndDropState({ isDragStarted: true, habit })

		const dragContainerOffsetY = rootElement.getBoundingClientRect().top

		logger.debugLog(() => `Getting row double.`)
		const getDragRowDouble = async () => {
			const queryDragRowDouble = () => rootElement.querySelector('.ot21-drag-double') as HTMLElement

			let rootElement: HTMLElement
			while (state?.ui?.rootElement == null) {
				await new Promise((resolve, reject) => {
					setTimeout(resolve, 1)
				})
			}
			rootElement = state.ui.rootElement
			let rowDouble: HTMLElement = queryDragRowDouble()
			while(rowDouble == null) {
				await new Promise((resolve, reject) => {
					setTimeout(resolve, 5)
				})
				rowDouble = queryDragRowDouble()
			}

			return rowDouble
		}
		const rowDouble = await getDragRowDouble()
		logger.debugLog(() => 'Row double is successfully retrieved.')

		const dragContainerMaxOffsetY = rootElement.getBoundingClientRect().height - rowDouble.getBoundingClientRect().height

		const updatePos = (y: number) => {
			rowDouble.style.transform = `translate(0px, ${y}px)`
		}
		const initHoverRowElement = ((event.currentTarget ?? event.target) as HTMLElement)
			?.closest('.habit-tracker__row');
		
		if (initHoverRowElement == null) {
			logger.debugError(() => 'Unable to find hover row. Return.')
			updateDragAndDropState({ isDragStarted: false })
			return
		}
		const initPos = initHoverRowElement.getBoundingClientRect().y - dragContainerOffsetY
		requestAnimationFrame(() => {
			updatePos(initPos)
			requestAnimationFrame(() =>
				rowDouble.style.opacity = '1')
		})
		logger.debugLog(() => `Drag double is set to the initial position: ${initPos}`)

		dragController = new DragAndDropController(
			habit, index, dragContainerOffsetY,
			() => state.computed.habits,
			async () => {
				const targetPosY = Math.min(dragController.dragDoubleTopOffset, dragContainerMaxOffsetY)

				const updateFrame = (timestamp: number) => {
						updatePos(targetPosY)
				}

				requestAnimationFrame(updateFrame)
		  },
			logger.scoped(() => 'DragCtrl')
		)
	}

	const finishDragMockEvent = { type: 'finishDrag' }
	const finishDrag = (options: { cancel: boolean }) => {
		if (!isDragStarted()) return

		const index = dragController.dragIndex
		const habit = dragController.habit
		const logger = getRowScopedEventLogger(habit, finishDragMockEvent)

		try {
			const toUpdateHabits = dragController.computeHabitOrderUpdates(index, state.computed.habits)

			if (toUpdateHabits.length === 0) {
				logger.debugLog(() => `Habit '${getHabitName(habit)}' has dragged to the same place.`)
				return
			}

			if (options.cancel) {
				logger.debugLog(() => `Drag and drop was cancelled.`)
				state.computed.habits = dragController.rollbackHabits()
				return
			}

			for (const { habit, newIndex } of toUpdateHabits) {
				if (habit.secondPassOrder === newIndex) {
					// hasn't changed, skip
					continue
				}

				app.fileManager.processFrontMatter(
					habit.file,
					(frontmatter) => {
						const habitOrderField = state.settings.habitOrderField
						frontmatter[habitOrderField] = newIndex
						habit.secondPassOrder = newIndex
					},
				)
			}
			logger.debugLog(() => `Save updates:`)
			logger.debugLog(() => toUpdateHabits)
		} finally {
			destroyDragController()
		}
	}

	const onPointerMoveUpdateDragDouble = (e: PointerEvent, index: number, habit: HabitData) => {
		if (!isDragStarted()) {
			return
		}

		const clientY = ((e.target) as HTMLElement).closest<HTMLElement>('.habit-tracker__row')
			?.getBoundingClientRect().y ?? Number.NaN

		if (Number.isNaN(clientY)) {
			const logger = getRowScopedEventLogger(habit, e).scoped(() => 'updateDragDouble')
			logger.debugError(() => `Unable to target row client Y`)
			return
		}

		dragController.updateDragDoubleTop(e.clientY)
	}

	const onPointerFinishDrag = (e: PointerEvent) => {
		if (!isDragStarted()) return

		finishDrag({ cancel: false })
	}

	const onPointerCancelDrag = (e: PointerEvent | FocusEvent) => {
		if (!isDragStarted()) return

		finishDrag({ cancel: true })
	}

	const onRowClickOpenHabit = (e: MouseEvent) => {
		if (!(e.target instanceof HTMLElement)
				|| (!(e.target.classList.contains('habit-tracker__row'))
					&& !(e.target.classList.contains('habit-tracker__cell--name')))
		) {
			return
		}

		if (e.target instanceof HTMLElement) {
			const habitLink = e.target.tagName === 'a'
				? e.target
				: e.target.find('a')
			
			habitLink?.click()
		}
	}

	// Listen for settings refresh events
	let refreshEventListener: (event: CustomEvent) => void
	let vaultCreateRef: any
	let vaultDeleteRef: any
	let vaultRenameRef: any
	let midnightTimer: ReturnType<typeof setTimeout>

	const isInWatchedPath = (filePath: string) =>
		filePath === state.settings.path ||
		filePath.startsWith(state.settings.path + '/')

	onMount(() => {
		logger.debugLog(() => 'Component mounted, setting up refresh listener')
		refreshEventListener = (event: CustomEvent) => {
			logger.debugLog(() => 'Refresh event received:')

			// Update global settings and reset state to use new defaults
			globalSettings = event.detail.settings

			setMinHabitNameWidthPx(globalSettings.minHabitNameWidthPx)

			// Reset state with new global settings as defaults
			state.settings = createDefaultSettings()
			logger.debugLog(() => 'Reset state with new defaults:')

			logger.debugLog(() => 'Calling init with updated settings')
			init(userSettings)
		}

		// Listen for refresh events at the document level
		document.addEventListener('habit-tracker-refresh', refreshEventListener)
		logger.debugLog(() => 'Refresh event listener added to document')

		// Schedule reload at midnight so dates stay current
		const scheduleMidnightReload = () => {
			const now = new Date()
			const midnight = new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate() + 1,
			)
			const msUntilMidnight = midnight.getTime() - now.getTime()
			midnightTimer = setTimeout(() => {
				logger.debugLog(() => 'Midnight reload triggered')
				state.settings = createDefaultSettings()
				init(userSettings)
				scheduleMidnightReload()
			}, msUntilMidnight)
		}
		scheduleMidnightReload()

		// Listen for vault file changes that affect the habit list
		vaultCreateRef = app.vault.on('create', (file) => {
			if (isInWatchedPath(file.path)) init(userSettings)
		})
		vaultDeleteRef = app.vault.on('delete', (file) => {
			if (isInWatchedPath(file.path)) init(userSettings)
		})
		vaultRenameRef = app.vault.on('rename', (file, oldPath) => {
			if (isInWatchedPath(file.path) || isInWatchedPath(oldPath))
				init(userSettings)
		})
	})

	onDestroy(() => {
		if (refreshEventListener) {
			document.removeEventListener(
				'habit-tracker-refresh',
				refreshEventListener,
			)
		}
		if (vaultCreateRef) app.vault.offref(vaultCreateRef)
		if (vaultDeleteRef) app.vault.offref(vaultDeleteRef)
		if (vaultRenameRef) app.vault.offref(vaultRenameRef)
		if (midnightTimer) clearTimeout(midnightTimer)
	})

	init(userSettings)
</script>

<svelte:window
	on:pointermove={getTouchHoverIndex}
	on:pointercancel={onPointerCancelDrag}
/>
{#if state.ui.fatalError}
	<div>
		<strong>🛑 {pluginName}</strong>
	</div>
	{state.ui.fatalError}
{:else if !state.computed.habits.length}
	<div>
		<strong>😕 {pluginName}</strong>
	</div>
	No habits to show at "{state.settings.path}"
{:else}
	<div
		class="habit-tracker {state.settings.matchLineLength
			? 'habit-tracker--match-line-length'
			: ''}"
		style="--date-columns: {state.computed.dates.length}"
		bind:this={state.ui.rootElement}
	>
		<div class="habit-tracker__header habit-tracker__row">
			<div class="habit-tracker__cell--name habit-tracker__cell"></div>
			{#each state.computed.dates as date}
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<!-- svelte-ignore a11y-no-static-element-interactions -->
				<div
					class="habit-tracker__cell habit-tracker__cell--{getDayOfTheWeek(
						date,
					)}{isToday(date) ? ' habit-tracker__cell--today' : ''}"
					data-ht21-date={date}
					data-ht21-pretty-date={renderPrettyDate(date)}
					on:click={() => openDailyNote(date)}
				>
					{getDate(parseISO(date))}
				</div>
			{/each}
		</div>
			{#if state.dragAndDrop.isDragStarted }
			<div class="habit-tracker__row ot21-drag-double">
			<Habit
				name={getHabitName(state.dragAndDrop.habit)}
				path={state.dragAndDrop.habit.file.path}
				dates={state.computed.dates}
				debug={state.settings.debug}
				{app}
				{pluginName}
				{userSettings}
				{globalSettings}
			></Habit></div>
			{/if}
		{#each state.computed.habits as habit, index (habit.file.path)}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<div 
				class="habit-tracker__row {state.dragAndDrop.isDragStarted && dragController.hoverIndex === index ? 'ot21-opaque' : ''}"
				draggable="false"
				data-ht21-habit-index={index}
				role="row" tabindex="{index}"

				use:longclick={{ durationMs: 1000, logger }}
				on:click={(e) => rowDebugEventWrapper(e, index, habit, onRowClickOpenHabit)}
				on:longclick={ (e) => rowDebugEventWrapper(e, index, habit, onLongClickStartDrag)}
				on:pointermove={(e) => onPointerMoveUpdateDragDouble(e, index, habit)}
				on:pointercancel={(e) => rowDebugEventWrapper(e, index, habit, onPointerCancelDrag)}
				on:pointerup={(e) => rowDebugEventWrapper(e, index, habit, onPointerFinishDrag)}
		>
			<Habit
				name={getHabitName(habit)}
				path={habit.file.path}
				dates={state.computed.dates}
				debug={state.settings.debug}
				index={habit.secondPassOrder}
				{app}
				{pluginName}
				{userSettings}
				{globalSettings}
			></Habit>
		</div>
		{/each}
	</div>
{/if}
