import { Palette } from 'lucide-react';
import { Select } from '@/components/ui';
import { useTheme } from '@/contexts/ThemeContext';
import { isTheme, type Theme } from '@/lib/themes';

const THEME_LABELS: Record<Theme, string> = {
	default: '博德之門黑金',
	dnd: '龍與地下城羊皮紙',
	printing: '灰階列印',
};

export function ThemeSwitcher() {
	const { theme, setTheme } = useTheme();

	return (
		<div
			data-print-hidden='true'
			className='flex items-center gap-1.5 rounded-md border border-border bg-background px-2'
		>
			<Palette aria-hidden='true' className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
			<Select
				aria-label='介面主題'
				data-testid='theme-switcher'
				value={theme}
				onChange={(event) => {
					const selectedTheme = event.currentTarget.value;
					if (isTheme(selectedTheme)) setTheme(selectedTheme);
				}}
				className='w-auto border-0 bg-transparent py-1.5 pl-0 pr-6 text-xs focus-visible:ring-0'
			>
				{Object.entries(THEME_LABELS).map(([value, label]) => (
					<option key={value} value={value}>
						{label}
					</option>
				))}
			</Select>
		</div>
	);
}
