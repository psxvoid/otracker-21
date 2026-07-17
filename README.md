# OTracker 21

This is a fork of the [Habit Tracker 21](https://github.com/zincplusplus/habit-tracker) with some customizations.

## Notable Improvements and Differences

### Integer Counters Support

Clicking on a habit increments the counter for that day. To "untick" a habit use long press or touch instead.

### Drag and Drop for Habits Reordering

Now it's possible to reorder habits with a mouse or touch. To change the order of a habit, long click/tap on a habit name, then drag it up/down, then release the click/tap to finish. The order is stored in the frontmatter. The order field is configurable via `Settings > Default custom order field`.

### Dynamic View Width and RTL-mode Improvements

Merged a [PR](https://github.com/zincplusplus/habit-tracker/pull/91) by [@conn-aut](https://github.com/conn-aut) with dynamic width support for views. Except changes present in the PR, there are also changes to RTL-mode (it should render normally). Now if you resize a note, the habit tracker view should adapt to the note width. A habit name cell width is configurable via `Settings > min name width`.

### Integration with "daily notes" core plugin

All habit tracker views inside daily notes are limited by the date of that daily note (configurable via `Settings > Infer last date`). In the original plugin if you open an older daily note with the habit tracker block, the habit tracker block will contain the most recent days.

### Snapshots

> This feature is still experimental and disabled by default in `Settings > Snapshot Mode`.

Allows to automatically "freeze" habit tracker views in time. What it means is that if you open an older habit tracker view, than you'll see which habits where ticked at the moment that particular habit view was created/update even if you move/rename and/or delete a habit file (only in the full snapshot mode).

In the original plugin if you open an older habit tracker view, then you'll see "current" habits (for today).

When it's enabled, you might see "snapshot is outdated" message in the habit tracker view when you change the habit but a snapshot contains outdated habits data - you might click on this message, and it will automatically update the snapshot. You should know what you are doing before using this feature. Only works for views that are updated after this setting is enabled.

Currently there are two snapshot modes that are supported.

#### Full Local Snapshot

In this snapshot mode a snapshot of a habit tracker view is stored inside a code block. Each update to the habit tracker view this snapshot is belonging to also writes a full snapshot JSON to the code block in this file. Protects from all changes to habits, including a habit file removal.

#### Global Light Snapshot

In this snapshot mode only a part of a habit tracker view is stored in the code block, the rest is stored in the plugin's settings. It stores much less data in the code block and protects from a habit file moves, but does NOT protect from a habit file removal. In case a habit file is removed, all "ticks" for that habit are lost. It's a compromise between a data integrity and an amount of data to be written on each habit "tick"/"untick". In this mode you can safely move habits outside the habit folder to "hide" them in a newer views; but remember to not delete them completely to preserve historical data.

## License

"OTracker 21" is an independent fork of the Habit Tracker 21.

It's based on source code of Copiright (c) the [zincplusplus](https://github.com/zincplusplus) and contributors; and licensed under the GNU General Public License v3.0 (GPL-3.0). Modifications by Pavel Sapehin. See the LICENSE file for details.
