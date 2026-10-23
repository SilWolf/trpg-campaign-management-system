/* eslint-disable react-refresh/only-export-components */
import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_protected/blacksmith')({
	component: () => <Outlet />,
});
