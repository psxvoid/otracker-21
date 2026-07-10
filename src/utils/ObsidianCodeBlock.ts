import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import { HabitTrackerUserSettingsSnapshot } from "src/settings";

const queryAnchor = async () => {
	const queryFunc = () => document.querySelector('.habit-tracker') as HTMLElement

	const queryLoop = async (resolve: (target: HTMLElement) => void) => {
			let anchor = queryFunc()

			if (anchor == null) {
				setTimeout(() => queryLoop(resolve), 150)
			}

			resolve(anchor)
		}

		return new Promise<HTMLElement>((resolve, reject) => queryLoop(resolve))
}

export async function saveCodeBlock(
    app: App,
    ctx: MarkdownPostProcessorContext,
    content: HabitTrackerUserSettingsSnapshot,
) {
		const anchor = await queryAnchor()

		if (anchor == null) {
        throw new Error("Unable to locate code block anchor.");
		}

    const section = ctx.getSectionInfo(anchor);

    if (!section) {
        throw new Error("Unable to locate code block section.");
    }

    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);

    if (!(file instanceof TFile)) {
        throw new Error("Not a markdown file.");
    }

		await app.vault.process(file, (text) => {
				const lines = text.split("\n");

				lines.splice(
						section.lineStart,
						section.lineEnd - section.lineStart + 1,
						"```habittracker",
						JSON.stringify(content, null, 2),
						"```",
				);

				return lines.join("\n");
		});
}
