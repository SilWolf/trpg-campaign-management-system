/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return <Outlet />;
}
