export async function delay(delayMs: number): Promise<void> {
	return new Promise((resolve, reject) => {
		setTimeout(resolve, delayMs)
	})
}
