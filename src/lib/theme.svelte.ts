import { browser } from '$app/environment';

/** Light or dark is per device, not per account, so it lives in a cookie rather than the database. */
export const THEME_COOKIE = 'theme';
export type ThemePref = 'system' | 'light' | 'dark';

export function parseTheme(v: string | undefined | null): ThemePref {
	return v === 'light' || v === 'dark' ? v : 'system';
}

/** The attribute hooks.server.ts writes into <html>; app.css keys color-scheme off it. */
export function themeAttr(pref: ThemePref): string {
	return pref === 'system' ? '' : ` data-theme="${pref}"`;
}

const media = browser ? matchMedia('(prefers-color-scheme: light)') : null;

/** The player's choice, and what it comes to on this device right now. */
export const theme = $state({
	pref: browser ? parseTheme(document.documentElement.dataset.theme) : ('system' as ThemePref),
	systemLight: media?.matches ?? false
});
media?.addEventListener('change', (e) => (theme.systemLight = e.matches));

export function isLight(): boolean {
	return theme.pref === 'system' ? theme.systemLight : theme.pref === 'light';
}

export function setTheme(pref: ThemePref) {
	theme.pref = pref;
	const root = document.documentElement;
	if (pref === 'system') delete root.dataset.theme;
	else root.dataset.theme = pref;
	const age = pref === 'system' ? 0 : 60 * 60 * 24 * 400;
	document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=${age}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
}
