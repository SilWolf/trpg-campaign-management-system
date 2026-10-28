/* eslint-disable react-refresh/only-export-components -- Provider 與對應 hook 需共用同一個 Context。 */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { isTheme, type Theme } from '@/lib/themes';

const THEME_STORAGE_KEY = 'trpg-theme';

interface ThemeContextValue {
	theme: Theme;
	setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
	const theme = document.documentElement.dataset.theme;
	return isTheme(theme) ? theme : 'default';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState(getInitialTheme);

	const setTheme = (nextTheme: Theme) => {
		setThemeState(nextTheme);
		document.documentElement.dataset.theme = nextTheme;

		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
		} catch (error) {
			console.warn('無法儲存主題偏好，主題僅會套用至目前工作階段。', error);
		}
	};

	return (
		<ThemeContext.Provider value={{ theme, setTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error('useTheme 必須在 ThemeProvider 內使用。');
	}
	return context;
}
