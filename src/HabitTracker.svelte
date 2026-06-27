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
	import { DomUtils, getTouchFromEvent } from './utils/DomUtils'
	import { TouchHoverIndexFromDataset } from './utils/TouchHelpers'

	// TypeScript interfaces for better state management
	interface HabitTrackerSettings {
		path: string
		firstDisplayedDate: string
		lastDisplayedDate: string
		daysToShow: number
		debug: boolean
		matchLineLength: boolean,
		habitOrderField: string
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
		isDragStarted: boolean
		dragDoubleTopOffset: number
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
		isTouchStarted = false
	}
	const isDragStarted = () => dragController instanceof DragAndDropController
	let isTouchStarted: boolean = false
	const touchHoverIndexer = new TouchHoverIndexFromDataset(
		'.habit-tracker__row[data-ht21-habit-index]',
		'ht21HabitIndex',
		() => isDragStarted() && isTouchStarted,
		(hoverIndex) => dragController.hoverIndex = hoverIndex
	)
	
	const getTouchHoverIndex = (e: TouchEvent) => touchHoverIndexer.processTouchEvent(e)

	const logger = new DebugLog(() => state.settings, () => 'HabitTracker')
	const getDragScopedEventLogger = (habit: HabitData, e: { type: string }) => {
		return logger.scoped(() => 'drag').scoped(() => getHabitName(habit)).scoped(() => e.type)
	}
	const dragDebugEventWrapper = <T extends Event>(habit: HabitData, e: T, index: number, func: (e: T, ...funcArgs: any[]) => any, ...args: any[]) => {
		const logger = getDragScopedEventLogger(habit, e)
		let hasError: boolean = true
		try {
			logger.debugLog(() => `Entry index: ${index}`)
			func(e, ...args)
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
			habitOrderField: userSettings?.habitOrderField ?? globalSettings?.habitOrderField
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

	const scrollToEnd = function () {
		if (!state.ui.rootElement) {
			logger.debugLog(() => `scrollToEnd: rootElement is null, cannot scroll`)
			return
		}

		const parent = state.ui.rootElement.parentElement
		if (!parent) {
			logger.debugLog(() => `scrollToEnd: parentElement is null, cannot scroll`)
			return
		}

		parent.scrollLeft = 99999999
		logger.debugLog(() => `scrollToEnd completed`)
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

	const hideNativeDragElement = (event: DragEvent) => {
		const dragImage = document.createElement('div')
		dragImage.style.width = '1px'
		dragImage.style.height = '1px'
		dragImage.style.opacity = '0'
		dragImage.style.position = 'fixed'
		dragImage.style.top = '-1000px'
		document.body.appendChild(dragImage)
		event.dataTransfer?.setDragImage(dragImage, 0, 0)
		setTimeout(() => dragImage.remove(), 0)
	}

	const computeDragOffsetY = (event: MouseEvent | TouchEvent | DragEvent): number => {
		const rootElementOffsetY = state?.ui?.rootElement != null
			? state.ui.rootElement.getBoundingClientRect().top
			: 0

		logger.debugLog(() => `Root element offset is ${rootElementOffsetY}.`)

		const clientY = DomUtils.getEventClientY(event)
	
		logger.debugLog(() => `Drag clientY is ${clientY}.`)

		const dragContainerOffsetY = event.target instanceof HTMLElement
			? event.target.closest<HTMLElement>('.habit-tracker__row')?.getBoundingClientRect().y
				?? event.target.getBoundingClientRect().y
			: 0
		
		logger.debugLog(() => `Drag container offset is ${dragContainerOffsetY}.`)

		return dragContainerOffsetY - rootElementOffsetY - clientY
	}

	const startDrag = (
		habit: HabitData,
		index: number,
		event: MouseEvent | TouchEvent | DragEvent | PointerEvent
	) => {
		const dragContainerOffsetY = computeDragOffsetY(event)

		updateDragAndDropState({ isDragStarted: true })

		dragController = new DragAndDropController(
			habit, index, dragContainerOffsetY,
			() => state.computed.habits,
			() => updateDragAndDropState({ dragDoubleTopOffset: dragController.dragDoubleTopOffset }),
			logger.scoped(() => 'DragCtrl')
		)
		dragController.updateDragDoubleTop(DomUtils.getEventClientY(event))
	}

	const finishDragMockEvent = { type: 'finishDrag' }
	const finishDrag = () => {
		if (!isDragStarted()) return

		const index = dragController.dragIndex
		const habit = dragController.habit
		const logger = getDragScopedEventLogger(habit, finishDragMockEvent)

		try {
			const toUpdateHabits = dragController.computeHabitOrderUpdates(index, state.computed.habits)

			if (toUpdateHabits.length === 0) {
				logger.debugLog(() => `Habit '${getHabitName(habit)}' has dragged to the same place.`)
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

	const onTouchMoveUpdateDragDouble = (e: TouchEvent) => {
		if (!isDragStarted() || !isTouchStarted) return

		const touch = getTouchFromEvent(e)

		dragController.updateDragDoubleTop(touch.clientY)
	}

	const onTouchEndFinishDrag = (e: TouchEvent) => {
		if (!isDragStarted() || !isTouchStarted) return

		finishDrag()
	}

	const onTouchCancelDestroyDrag = (e: TouchEvent) => {
		if (isDragStarted()) {
			destroyDragController()
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
	on:touchmove|nonpassive={getTouchHoverIndex}
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
			<div class="habit-tracker__row ht21-drag-double" style="top: {state.dragAndDrop.dragDoubleTopOffset}px;">
			<Habit
				name={getHabitName(dragController.habit)}
				path={dragController.habit.file.path}
				dates={state.computed.dates}
				debug={state.settings.debug}
				{app}
				{pluginName}
				{userSettings}
				{globalSettings}
			></Habit></div>
			{/if}
		{#each state.computed.habits as habit, index (habit.file.path)}
		<div 
				class="habit-tracker__row {state.dragAndDrop.isDragStarted && dragController.hoverIndex === index ? 'h21-opaque' : ''}"
				draggable="true"
				data-ht21-habit-index={index}
				role="row" tabindex="{index}"
				on:dragstart={(e) => dragDebugEventWrapper(habit, e, index, (e) => {
					const logger = getDragScopedEventLogger(habit, e)

					hideNativeDragElement(e)
					if (isDragStarted()) {
						logger.debugLog(() => `Already started.`)
						return
					}

					startDrag(habit, index, e)
				})}
				on:drag={(e) => {
					dragController.updateDragDoubleTop(e.clientY)
					// logger.debugLog(() => `Drag clientY: ${e.clientY}`)
				}}
				on:dragover={(e) => dragDebugEventWrapper(habit, e, index, (e) => {
					e.preventDefault()
					dragController.updateDragDoubleTop(e.clientY)
					dragController.hoverIndex = index
				})}
				on:dragend={(e) => dragDebugEventWrapper(habit, e, index, (e) => {
					if (!isDragStarted() || isTouchStarted) {
						const logger = getDragScopedEventLogger(habit, e)
						logger.debugLog(() => isTouchStarted ? 'Skipping due to touch start.' : 'already started')
						return
					}

					finishDrag()
				})}
				on:touchstart|nonpassive={(e) => dragDebugEventWrapper(habit, e, index, (e) => {
					const logger = getDragScopedEventLogger(habit, e)

					if (isDragStarted() || isTouchStarted) {
						logger.debugLog(() => `Already started.`)
						return
					}

					if (!(e.target instanceof HTMLElement) || !e.target.closest('.habit-tracker__cell--name')) {
						logger.debugLog(() => `Unable to get cell name element.`)
						return
					}

					isTouchStarted = true

					e.preventDefault()

					startDrag(habit, index, e)

					logger.debugLog(() => `Drag is successfully started.`)
				})}
				on:touchmove|nonpassive={onTouchMoveUpdateDragDouble}
				on:touchend={(e) => dragDebugEventWrapper(habit, e, index, onTouchEndFinishDrag)}
				on:touchcancel={(e) => dragDebugEventWrapper(habit, e, index, onTouchCancelDestroyDrag)}
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
