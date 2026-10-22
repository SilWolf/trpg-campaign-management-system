// src/routes/_protected/route.tsx (選用：統一保護底下所有子路由)
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { checkIsAuthenticated } from '@/contexts/AuthContext';

export const Route = createFileRoute('/_protected')({
	beforeLoad: async () => {
		if (!(await checkIsAuthenticated())) throw redirect({ to: '/login' });
	},
	component: () => <Outlet />,
});
