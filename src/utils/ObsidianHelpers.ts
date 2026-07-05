import { Vault } from "obsidian";

export type VaultConfig = Vault & {
	config: {
		rightToLeft: boolean
	}
}

function hasVaultConfig(vault: Vault): vault is VaultConfig {
	return typeof (vault as VaultConfig).config === 'object'
		&& typeof (vault as VaultConfig).config.rightToLeft === 'boolean'
}

export function queryDirElement(): HTMLElement | null {
	return document.querySelector('.markdown-source-view')
}

export function isRTL(vault: Vault): boolean {
	return hasVaultConfig(vault)
		? vault.config.rightToLeft
		: document.body.classList.contains('mod-rtl')
			|| (queryDirElement()?.dir ?? '') === 'rtl'
}
