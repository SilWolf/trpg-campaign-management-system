export const THEMES = ['default', 'dnd', 'printing'] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
	return typeof value === 'string' && THEMES.some((theme) => theme === value);
}
