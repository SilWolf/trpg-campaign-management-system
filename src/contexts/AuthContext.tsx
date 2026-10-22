/* eslint-disable react-refresh/only-export-components -- 驗證 Context 同時匯出 Provider、Hook 與路由守衛。 */
import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextType {
	user: User | null;
	loading: boolean;
	isGuest: boolean;
	loginAsGuest: () => void;
	signOut: () => Promise<void>;
}

const GUEST_MODE_KEY = 'bg3_guest_mode';

function isGuestModeEnabled() {
	return (
		typeof window !== 'undefined' &&
		window.localStorage.getItem(GUEST_MODE_KEY) === 'true'
	);
}

export async function checkIsAuthenticated() {
	if (isGuestModeEnabled()) return true;
	if (!supabase) return false;

	const { data, error } = await supabase.auth.getSession();
	if (error) throw error;
	return Boolean(data.session?.user);
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [isGuest, setIsGuest] = useState<boolean>(isGuestModeEnabled);
	const [loading, setLoading] = useState<boolean>(Boolean(supabase));

	useEffect(() => {
		if (!supabase) {
			return;
		}

		let isMounted = true;
		supabase.auth
			.getSession()
			.then(({ data: { session }, error }) => {
				if (error) throw error;
				if (!isMounted) return;
				setUser(session?.user ?? null);
				setLoading(false);
			})
			.catch((error: unknown) => {
				console.error('載入登入狀態失敗：', error);
				if (isMounted) setLoading(false);
			});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			setUser(session?.user ?? null);
			if (session?.user) {
				setIsGuest(false);
				window.localStorage.removeItem(GUEST_MODE_KEY);
			}
		});

		return () => {
			isMounted = false;
			subscription.unsubscribe();
		};
	}, []);

	const loginAsGuest = () => {
		window.localStorage.setItem(GUEST_MODE_KEY, 'true');
		setIsGuest(true);
	};

	const signOut = async () => {
		window.localStorage.removeItem(GUEST_MODE_KEY);
		setIsGuest(false);
		if (supabase) {
			const { error } = await supabase.auth.signOut();
			if (error) throw error;
		}
		setUser(null);
	};

	return (
		<AuthContext.Provider
			value={{ user, loading, isGuest, loginAsGuest, signOut }}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error('useAuth 必須在 AuthProvider 內使用');
	return ctx;
}
