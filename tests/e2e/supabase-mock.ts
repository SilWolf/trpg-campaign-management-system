import type { Page } from '@playwright/test';

const testUser = {
	id: 'a77ecb75-91dc-43a2-a20e-0a4c32fe8841',
	aud: 'authenticated',
	role: 'authenticated',
	email: 'adventurer@example.test',
	email_confirmed_at: '2025-01-01T00:00:00.000Z',
	phone: '',
	confirmed_at: '2025-01-01T00:00:00.000Z',
	last_sign_in_at: '2025-01-01T00:00:00.000Z',
	app_metadata: { provider: 'email', providers: ['email'] },
	user_metadata: { full_name: '測試冒險者' },
	identities: [],
	created_at: '2025-01-01T00:00:00.000Z',
	updated_at: '2025-01-01T00:00:00.000Z',
};

const testSession = {
	access_token: 'playwright-test-access-token',
	refresh_token: 'playwright-test-refresh-token',
	token_type: 'bearer',
	expires_in: 3600,
	expires_at: Math.floor(Date.now() / 1000) + 3600,
	user: testUser,
};

export async function seedAuthenticatedSession(page: Page) {
	await page.addInitScript((session) => {
		localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
	}, testSession);
}

export async function mockSupabase(page: Page) {
	const requests: string[] = [];

	await page.route('http://127.0.0.1:54321/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const method = request.method();
		requests.push(`${method} ${url.pathname}${url.search}`);

		if (url.pathname === '/auth/v1/signup' && method === 'POST') {
			await route.fulfill({
				json: {
					user: {
						...testUser,
						email: request.postDataJSON().email,
					},
					session: null,
				},
			});
			return;
		}

		if (url.pathname === '/auth/v1/token' && method === 'POST') {
			const body = request.postDataJSON() as { email?: string };
			if (body.email === 'wrong@example.com') {
				await route.fulfill({
					status: 400,
					json: {
						code: 'invalid_credentials',
						message: 'Invalid login credentials',
					},
				});
				return;
			}

			await route.fulfill({
				json: {
					...testSession,
					user: { ...testUser, email: body.email ?? testUser.email },
				},
			});
			return;
		}

		if (
			url.pathname === '/auth/v1/user' &&
			(method === 'PATCH' || method === 'PUT')
		) {
			const body = request.postDataJSON() as {
				email?: string;
				data?: { full_name?: string };
			};
			await route.fulfill({
				json: {
					...testUser,
					email: body.email ?? testUser.email,
					user_metadata: {
						...testUser.user_metadata,
						...body.data,
					},
				},
			});
			return;
		}

		if (url.pathname === '/auth/v1/user' && method === 'GET') {
			await route.fulfill({ json: testUser });
			return;
		}

		if (
			url.pathname === '/rest/v1/campaigns' &&
			method === 'GET' &&
			url.searchParams.has('invite_code')
		) {
			await route.fulfill({
				json: { id: 'mock-campaign-id', name: '測試戰役' },
			});
			return;
		}

		if (url.pathname.startsWith('/rest/v1/rpc/')) {
			await route.fulfill({ status: 200, body: 'null' });
			return;
		}

		if (url.pathname.startsWith('/rest/v1/')) {
			if (method === 'GET') {
				await route.fulfill({ json: [] });
			} else {
				await route.fulfill({ status: 204 });
			}
			return;
		}

		await route.fulfill({
			status: 404,
			json: { message: `未設定測試替身：${method} ${url.pathname}` },
		});
	});

	return { requests };
}
