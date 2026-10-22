import { useMemo } from 'react';
import {
	CAMP_CHEST_ID,
	type AccessLevel,
	type CharacterPermission,
	type ViewMode,
} from '@/types';

export interface EvaluatedPermissions {
	publicBagAccess: AccessLevel;
	privateBagAccess: AccessLevel;
	publicWalletAccess: AccessLevel;
	privateWalletAccess: AccessLevel;
	canEditProfile: boolean;
	canDeleteCharacter: boolean;
	canManagePermissions: boolean;
	// 便捷布林衍生值
	canReadPublicBag: boolean;
	canEditPublicBag: boolean;
	canReadPrivateBag: boolean;
	canEditPrivateBag: boolean;
	canReadPublicWallet: boolean;
	canEditPublicWallet: boolean;
	canReadPrivateWallet: boolean;
	canEditPrivateWallet: boolean;
}

export function useCharacterPermissions(
	characterId: string,
	currentUserId: string | null | undefined,
	permissions: CharacterPermission[],
	isDm: boolean,
	viewMode: ViewMode,
	characterOwnerUserId?: string,
): EvaluatedPermissions {
	return useMemo(() => {
		// 1. DM 上帝視角：全權限開放
		if (isDm && viewMode === 'dm') {
			return {
				publicBagAccess: 2,
				privateBagAccess: 2,
				publicWalletAccess: 2,
				privateWalletAccess: 2,
				canEditProfile: true,
				canDeleteCharacter: true,
				canManagePermissions: true,
				canReadPublicBag: true,
				canEditPublicBag: true,
				canReadPrivateBag: true,
				canEditPrivateBag: true,
				canReadPublicWallet: true,
				canEditPublicWallet: true,
				canReadPrivateWallet: true,
				canEditPrivateWallet: true,
			};
		}

		// 2. 營地儲物箱 (camp-chest)：全體玩家與 DM 皆有公開背包與公開錢包修改權 (2)
		if (characterId === CAMP_CHEST_ID) {
			return {
				publicBagAccess: 2,
				privateBagAccess: 0,
				publicWalletAccess: 2,
				privateWalletAccess: 0,
				canEditProfile: false,
				canDeleteCharacter: false,
				canManagePermissions: false,
				canReadPublicBag: true,
				canEditPublicBag: true,
				canReadPrivateBag: false,
				canEditPrivateBag: false,
				canReadPublicWallet: true,
				canEditPublicWallet: true,
				canReadPrivateWallet: false,
				canEditPrivateWallet: false,
			};
		}

		// 3. 查詢資料庫中的自訂權限紀錄
		const perm = permissions.find(
			(p) => p.characterId === characterId && p.userId === currentUserId,
		);

		if (perm) {
			return {
				publicBagAccess: perm.publicBagAccess,
				privateBagAccess: perm.privateBagAccess,
				publicWalletAccess: perm.publicWalletAccess,
				privateWalletAccess: perm.privateWalletAccess,
				canEditProfile: perm.canEditProfile,
				canDeleteCharacter: perm.canDeleteCharacter,
				canManagePermissions: perm.canManagePermissions,
				canReadPublicBag: perm.publicBagAccess >= 1,
				canEditPublicBag: perm.publicBagAccess === 2,
				canReadPrivateBag: perm.privateBagAccess >= 1,
				canEditPrivateBag: perm.privateBagAccess === 2,
				canReadPublicWallet: perm.publicWalletAccess >= 1,
				canEditPublicWallet: perm.publicWalletAccess === 2,
				canReadPrivateWallet: perm.privateWalletAccess >= 1,
				canEditPrivateWallet: perm.privateWalletAccess === 2,
			};
		}

		// 4. Lazy Default（尚未手動設定權限時）
		const isOwner = Boolean(
			currentUserId &&
			characterOwnerUserId &&
			currentUserId === characterOwnerUserId,
		);

		if (isOwner) {
			return {
				publicBagAccess: 2,
				privateBagAccess: 2,
				publicWalletAccess: 2,
				privateWalletAccess: 2,
				canEditProfile: true,
				canDeleteCharacter: true,
				canManagePermissions: true,
				canReadPublicBag: true,
				canEditPublicBag: true,
				canReadPrivateBag: true,
				canEditPrivateBag: true,
				canReadPublicWallet: true,
				canEditPublicWallet: true,
				canReadPrivateWallet: true,
				canEditPrivateWallet: true,
			};
		}

		// 其他玩家預設：公開背包與公開錢包皆為 1 (僅閱讀)，其餘為 0 / false
		return {
			publicBagAccess: 1,
			privateBagAccess: 0,
			publicWalletAccess: 1,
			privateWalletAccess: 0,
			canEditProfile: false,
			canDeleteCharacter: false,
			canManagePermissions: false,
			canReadPublicBag: true,
			canEditPublicBag: false,
			canReadPrivateBag: false,
			canEditPrivateBag: false,
			canReadPublicWallet: true,
			canEditPublicWallet: false,
			canReadPrivateWallet: false,
			canEditPrivateWallet: false,
		};
	}, [
		characterId,
		currentUserId,
		permissions,
		isDm,
		viewMode,
		characterOwnerUserId,
	]);
}
