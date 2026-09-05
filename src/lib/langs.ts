/** Languages offered in the editor. `slug` is LeetCode's langSlug; `dir` is the NeetCode solutions folder. */
export interface Lang {
	slug: string;
	name: string;
	monaco: string;
	dir: string;
	ext: string;
	/** Non-Python languages earn the practice multiplier. */
	bonus: boolean;
}

export const LANGS: Lang[] = [
	{ slug: 'python3', name: 'Python 3', monaco: 'python', dir: 'python', ext: 'py', bonus: false },
	{ slug: 'golang', name: 'Go', monaco: 'go', dir: 'go', ext: 'go', bonus: true },
	{ slug: 'csharp', name: 'C#', monaco: 'csharp', dir: 'csharp', ext: 'cs', bonus: true },
	{ slug: 'cpp', name: 'C++', monaco: 'cpp', dir: 'cpp', ext: 'cpp', bonus: true },
	{ slug: 'rust', name: 'Rust', monaco: 'rust', dir: 'rust', ext: 'rs', bonus: true }
];

export const LANG_BY_SLUG = new Map(LANGS.map((l) => [l.slug, l]));
export const DEFAULT_LANG = 'python3';

export function isBonusLang(slug: string): boolean {
	return LANG_BY_SLUG.get(slug)?.bonus ?? slug !== 'python3';
}
