import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { AuthProvider } from '@/contexts/AuthContext';
import { FeedbackProvider } from '@/contexts/FeedbackContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { routeTree } from '@/routeTree.gen';
import '@/index.css';

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById('root');

if (!rootElement) {
	throw new Error('找不到應用程式根節點。');
}

createRoot(rootElement).render(
	<StrictMode>
		<FeedbackProvider>
			<ThemeProvider>
				<AuthProvider>
					<RouterProvider router={router} />
				</AuthProvider>
			</ThemeProvider>
		</FeedbackProvider>
	</StrictMode>,
);
