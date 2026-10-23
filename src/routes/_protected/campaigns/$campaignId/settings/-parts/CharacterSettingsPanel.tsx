import type { FormEvent } from 'react';
import {
	ArrowRightLeft,
	Save,
	ShieldAlert,
	Trash2,
	User,
} from 'lucide-react';
import { Button, Checkbox, Input, Select } from '@/components/ui';
import type {
	AccessLevel,
	Character,
	CharacterPermission,
} from '@/types';
import type { DisplayMember } from './types';

interface CharacterPermissions {
	canEditProfile: boolean;
	canDeleteCharacter: boolean;
	canManagePermissions: boolean;
}

interface CharacterSettingsPanelProps {
	campaignId: string;
	isDm: boolean;
	currentSelectedChar?: Character;
	currentOwnerName?: string;
	transferCandidates: DisplayMember[];
	selectedTransferTarget?: DisplayMember;
	setTransferTargetUserId: (userId: string) => void;
	myPermForSelectedChar: CharacterPermissions;
	editCharName: string;
	setEditCharName: (name: string) => void;
	editCharTitle: string;
	setEditCharTitle: (title: string) => void;
	editCharStr: number;
	setEditCharStr: (strength: number) => void;
	editCharAvatar: string;
	setEditCharAvatar: (avatar: string) => void;
	allMembers: DisplayMember[];
	allPermissions: CharacterPermission[];
	userId?: string;
	onSaveCharacterProfile: (event: FormEvent<HTMLFormElement>) => void;
	onUpdatePermission: (
		character: Character,
		targetUserId: string,
		field: keyof CharacterPermission,
		value: AccessLevel | boolean,
	) => void;
	onTransferCharacter: (character: Character, targetUserId: string) => void;
	onDeleteCharacter: (character: Character) => void;
}

const AVATAR_OPTIONS = [
	'🛡️',
	'🧙‍♂️',
	'🧝‍♀️',
	'🗡️',
	'🔮',
	'🦇',
	'🐉',
	'🍀',
	'🏹',
	'📜',
	'🌙',
];

export function CharacterSettingsPanel({
	campaignId,
	isDm,
	currentSelectedChar,
	currentOwnerName,
	transferCandidates,
	selectedTransferTarget,
	setTransferTargetUserId,
	myPermForSelectedChar,
	editCharName,
	setEditCharName,
	editCharTitle,
	setEditCharTitle,
	editCharStr,
	setEditCharStr,
	editCharAvatar,
	setEditCharAvatar,
	allMembers,
	allPermissions,
	userId,
	onSaveCharacterProfile,
	onUpdatePermission,
	onTransferCharacter,
	onDeleteCharacter,
}: CharacterSettingsPanelProps) {
	return (
		<>
			{/* ========================================== */}
			{/* 分頁 B：個別角色的設定與權限控制分頁           */}
			{/* ========================================== */}
			{currentSelectedChar && (
				<div className='space-y-6'>
					{/* 區塊 1：角色基本資料設定 (can_edit_profile) */}
					<form
						onSubmit={onSaveCharacterProfile}
						className='bg-stone-950 border border-stone-800 rounded-lg p-6 space-y-4 shadow-xl'
					>
						<div className='flex items-center justify-between border-b border-stone-800 pb-3'>
							<div className='flex items-center gap-2'>
								<span className='text-xl'>{currentSelectedChar.avatar}</span>
								<h2 className='text-base font-serif font-bold text-amber-200'>
									{currentSelectedChar.name} — 角色基本資料
								</h2>
							</div>
							{!myPermForSelectedChar.canEditProfile && (
								<span className='text-[11px] px-2 py-0.5 rounded bg-stone-900 border border-stone-700 text-stone-400'>
									唯讀模式 (無基本資料修改權)
								</span>
							)}
						</div>

						<div className='grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs'>
							<Input
								data-testid='character-name'
								label='角色名稱 *'
								labelClassName='text-xs text-stone-400'
								type='text'
								required
								disabled={!myPermForSelectedChar.canEditProfile}
								value={editCharName}
								onChange={(e) => setEditCharName(e.target.value)}
								className='bg-stone-900'
							/>

							<Input
								data-testid='character-title'
								label='頭銜 / 職業背景'
								labelClassName='text-xs text-stone-400'
								type='text'
								disabled={!myPermForSelectedChar.canEditProfile}
								value={editCharTitle}
								onChange={(e) => setEditCharTitle(e.target.value)}
								className='bg-stone-900'
							/>

							<Input
								data-testid='character-strength'
								label='力量屬性 (STR)'
								labelClassName='text-xs text-amber-300'
								type='number'
								min={1}
								max={30}
								required
								disabled={!myPermForSelectedChar.canEditProfile}
								value={editCharStr}
								onChange={(e) =>
									setEditCharStr(parseInt(e.target.value, 10) || 10)
								}
								className='bg-stone-900 font-mono font-bold text-amber-200'
							/>

							<Select
								data-testid='character-avatar'
								label='頭像符號'
								labelClassName='text-xs text-stone-400'
								disabled={!myPermForSelectedChar.canEditProfile}
								value={editCharAvatar}
								onChange={(e) => setEditCharAvatar(e.target.value)}
								className='bg-stone-900'
							>
								{AVATAR_OPTIONS.map((icon) => (
									<option key={icon} value={icon}>
										{icon} 頭像
									</option>
								))}
							</Select>
						</div>

						{myPermForSelectedChar.canEditProfile && (
							<div className='flex justify-end pt-3 border-t border-stone-800'>
								<Button
									data-testid='character-save'
									type='submit'
									size='sm'
									className='shadow'
								>
									<Save className='w-4 h-4' />
									<span>儲存角色基本資料</span>
								</Button>
							</div>
						)}
					</form>

					{/* 區塊 2：角色控制權限矩陣表 (can_manage_permissions) */}
					<div className='bg-stone-950 border border-stone-800 rounded-lg p-6 space-y-5 shadow-xl'>
						<div className='border-b border-stone-800 pb-3 flex flex-wrap items-center justify-between gap-2'>
							<div>
								<h2 className='text-base font-serif font-bold text-purple-200'>
									角色控制權限矩陣 (Access Control List)
								</h2>
								<p className='text-xs text-stone-400 mt-0.5'>
									設定戰役內各成員對「{currentSelectedChar.name}
									」的背包、錢包與管理控制權（為防誤鎖，玩家不可修改自己的權限列）。
								</p>
							</div>
							{!myPermForSelectedChar.canManagePermissions && (
								<span className='text-[11px] px-2.5 py-1 rounded bg-stone-900 border border-stone-700 text-stone-400'>
									🔒 唯讀檢視 (你沒有修改此角色權限表的控制權)
								</span>
							)}
						</div>

						<div className='space-y-4'>
							{allMembers
								.filter((m) => m.type !== 'pending')
								.map((member) => {
									const isTargetDm = member.type === 'dm';
									const isTargetCreator =
										member.id === currentSelectedChar.userId;
									const isTargetSelf = Boolean(
										userId && member.id === userId,
									);
									const perm = allPermissions.find(
										(p) =>
											p.characterId === currentSelectedChar.id &&
											p.userId === member.id,
									);

									const pubBag = isTargetDm
										? 2
										: (perm?.publicBagAccess ?? (isTargetCreator ? 2 : 1));
									const privBag = isTargetDm
										? 2
										: (perm?.privateBagAccess ?? (isTargetCreator ? 2 : 0));
									const pubWallet = isTargetDm
										? 2
										: (perm?.publicWalletAccess ?? (isTargetCreator ? 2 : 1));
									const privWallet = isTargetDm
										? 2
										: (perm?.privateWalletAccess ?? (isTargetCreator ? 2 : 0));
									const editProfile = isTargetDm
										? true
										: (perm?.canEditProfile ?? isTargetCreator);
									const delChar = isTargetDm
										? true
										: (perm?.canDeleteCharacter ?? isTargetCreator);
									const managePerm = isTargetDm
										? true
										: (perm?.canManagePermissions ?? isTargetCreator);

									// 鎖定條件：目標是 DM、自己沒有管理權、或「非 DM 玩家看到自己這一列」
									const rowDisabled =
										isTargetDm ||
										!myPermForSelectedChar.canManagePermissions ||
										(!isDm && isTargetSelf);

									return (
										<div
											key={member.id}
											className='bg-stone-900/70 border border-stone-800 rounded-lg p-4 space-y-3'
										>
											<div className='flex items-center justify-between border-b border-stone-800/80 pb-2'>
												<div className='flex items-center gap-2'>
													<User className='w-4 h-4 text-amber-400' />
													<span className='text-xs font-bold text-stone-200'>
														{member.identifier}
													</span>
													<span className='text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-400'>
														{member.roleText}
													</span>
												</div>
												<div className='flex items-center gap-1.5 flex-wrap'>
													{isTargetDm && (
														<span className='text-[10px] px-2 py-0.5 rounded bg-red-950/80 text-red-200 border border-red-700/50 font-semibold'>
															👑 DM 預設全權限
														</span>
													)}
													{isTargetCreator && (
														<span className='text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700/50 font-semibold'>
															✨ 角色創造者
														</span>
													)}
													{!isDm && isTargetSelf && (
														<span className='text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-600 font-medium'>
															🔒 本人權限 (防誤鎖保護)
														</span>
													)}
												</div>
											</div>

											<div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs'>
												{/* 公開背包權限 */}
												<div>
													<Select
														data-testid={`character-permission-public-bag-${currentSelectedChar.id}-${member.id}`}
														label='🎒 公開背包權限'
														labelClassName='block text-stone-400 mb-1'
														containerClassName='gap-0'
														disabled={rowDisabled}
														value={pubBag}
														onChange={(e) =>
															onUpdatePermission(
																currentSelectedChar,
																member.id,
																'publicBagAccess',
																parseInt(e.target.value, 10) as AccessLevel,
															)
														}
														className='bg-stone-950 px-2.5 py-1.5 text-amber-200'
													>
														<option value={0}>0 - 無權限 (隱藏)</option>
														<option value={1}>1 - 僅閱讀</option>
														<option value={2}>2 - 閱讀 + 修改</option>
													</Select>
												</div>

												{/* 私人背包權限 */}
												<div>
													<Select
														data-testid={`character-permission-private-bag-${currentSelectedChar.id}-${member.id}`}
														label='🔒 私人暗袋權限'
														labelClassName='block text-stone-400 mb-1'
														containerClassName='gap-0'
														disabled={rowDisabled}
														value={privBag}
														onChange={(e) =>
															onUpdatePermission(
																currentSelectedChar,
																member.id,
																'privateBagAccess',
																parseInt(e.target.value, 10) as AccessLevel,
															)
														}
														className='bg-stone-950 px-2.5 py-1.5 text-emerald-300'
													>
														<option value={0}>0 - 無權限 (隱藏)</option>
														<option value={1}>1 - 僅閱讀</option>
														<option value={2}>2 - 閱讀 + 修改</option>
													</Select>
												</div>

												{/* 公開錢包權限 */}
												<div>
													<Select
														data-testid={`character-permission-public-wallet-${currentSelectedChar.id}-${member.id}`}
														label='🪙 公開錢包權限'
														labelClassName='block text-stone-400 mb-1'
														containerClassName='gap-0'
														disabled={rowDisabled}
														value={pubWallet}
														onChange={(e) =>
															onUpdatePermission(
																currentSelectedChar,
																member.id,
																'publicWalletAccess',
																parseInt(e.target.value, 10) as AccessLevel,
															)
														}
														className='bg-stone-950 px-2.5 py-1.5 text-amber-300'
													>
														<option value={0}>0 - 無權限 (隱藏餘額)</option>
														<option value={1}>1 - 僅閱讀餘額</option>
														<option value={2}>2 - 閱讀 + 修改/轉出</option>
													</Select>
												</div>

												{/* 私人錢包權限 */}
												<div>
													<Select
														data-testid={`character-permission-private-wallet-${currentSelectedChar.id}-${member.id}`}
														label='💰 私人錢包權限'
														labelClassName='block text-stone-400 mb-1'
														containerClassName='gap-0'
														disabled={rowDisabled}
														value={privWallet}
														onChange={(e) =>
															onUpdatePermission(
																currentSelectedChar,
																member.id,
																'privateWalletAccess',
																parseInt(e.target.value, 10) as AccessLevel,
															)
														}
														className='bg-stone-950 px-2.5 py-1.5 text-cyan-300'
													>
														<option value={0}>0 - 無權限 (隱藏餘額)</option>
														<option value={1}>1 - 僅閱讀餘額</option>
														<option value={2}>2 - 閱讀 + 修改/轉出</option>
													</Select>
												</div>
											</div>

											{/* 3 項布林權限勾選 */}
											<div className='flex flex-wrap items-center gap-5 pt-2 border-t border-stone-800/60 text-xs'>
												<Checkbox
													data-testid={`character-permission-edit-profile-${currentSelectedChar.id}-${member.id}`}
													label='基本資料修改權 (`can_edit_profile`)'
													labelClassName={`${
														rowDisabled
															? 'opacity-50 cursor-not-allowed'
															: 'cursor-pointer'
													}`}
													disabled={rowDisabled}
													checked={editProfile}
													onChange={(e) =>
														onUpdatePermission(
															currentSelectedChar,
															member.id,
															'canEditProfile',
															e.target.checked,
														)
													}
													className='accent-amber-500'
												/>

												<Checkbox
													data-testid={`character-permission-delete-${currentSelectedChar.id}-${member.id}`}
													label='角色刪除權 (`can_delete_character`)'
													labelClassName={`${
														rowDisabled
															? 'opacity-50 cursor-not-allowed'
															: 'cursor-pointer'
													}`}
													disabled={rowDisabled}
													checked={delChar}
													onChange={(e) =>
														onUpdatePermission(
															currentSelectedChar,
															member.id,
															'canDeleteCharacter',
															e.target.checked,
														)
													}
													className='accent-red-500'
												/>

												<Checkbox
													data-testid={`character-permission-manage-${currentSelectedChar.id}-${member.id}`}
													label='修改控制權的控制權 (`can_manage_permissions`)'
													labelClassName={`${
														rowDisabled
															? 'opacity-50 cursor-not-allowed'
															: 'cursor-pointer'
													}`}
													disabled={rowDisabled}
													checked={managePerm}
													onChange={(e) =>
														onUpdatePermission(
															currentSelectedChar,
															member.id,
															'canManagePermissions',
															e.target.checked,
														)
													}
													className='accent-purple-500'
												/>
											</div>
										</div>
									);
								})}
						</div>
					</div>

					{/* 區塊 3：角色危險操作區 (can_delete_character) */}
					{(myPermForSelectedChar.canDeleteCharacter ||
						(isDm && campaignId !== 'default')) && (
						<div className='bg-red-950/30 border border-red-900/60 rounded-lg p-5 space-y-3'>
							<div className='flex items-center gap-2 text-red-300 font-serif font-bold text-sm'>
								<ShieldAlert className='w-4 h-4' />
								<span>角色危險操作區 — {currentSelectedChar.name}</span>
							</div>
							{isDm && campaignId !== 'default' && (
								<section className='rounded-lg border border-cyan-900/70 bg-stone-950/70 p-4 space-y-4'>
									<div className='flex items-center gap-2 border-b border-stone-800 pb-3'>
										<ArrowRightLeft className='w-4 h-4 text-cyan-300' />
										<div>
											<h2 className='text-sm font-serif font-bold text-cyan-200'>
												角色擁有權移轉
											</h2>
											<p className='text-xs text-stone-400 mt-0.5'>
												目前擁有者：{currentOwnerName}
											</p>
										</div>
									</div>
									<p className='text-xs text-stone-400 leading-relaxed'>
										你可以先替尚未加入的玩家建立角色；等玩家建立帳號並加入本戰役後，再將角色交給他。移轉後，玩家會取得角色完整控制權，原擁有者的個別權限設定會被移除（原擁有者仍依戰役預設權限讀取公開內容）。
									</p>
									{transferCandidates.length === 0 ? (
										<p className='rounded border border-stone-800 bg-stone-900/70 px-3 py-2 text-xs text-stone-500'>
											目前沒有已加入戰役的玩家。玩家接受邀請並加入後，即可在此移轉角色。
										</p>
									) : (
										<div className='flex flex-col sm:flex-row gap-2'>
											<Select
												data-testid='character-transfer-target'
												aria-label='角色移轉目標'
												value={selectedTransferTarget?.id ?? ''}
												onChange={(event) =>
													setTransferTargetUserId(event.target.value)
												}
												className='flex-1 bg-stone-900 focus-visible:border-cyan-500'
											>
												{transferCandidates.map((member) => (
													<option
														key={member.id}
														value={member.id}
														disabled={member.id === currentSelectedChar.userId}
													>
														{member.identifier}
														{member.id === currentSelectedChar.userId
															? '（目前擁有者）'
															: ''}
													</option>
												))}
											</Select>
											<Button
												data-testid='character-transfer'
												type='button'
												disabled={!selectedTransferTarget}
												onClick={() => {
													if (selectedTransferTarget) {
														void onTransferCharacter(
															currentSelectedChar,
															selectedTransferTarget.id,
														);
													}
												}}
												variant='secondary'
												className='shrink-0 border-cyan-700 bg-cyan-900 text-cyan-100 hover:bg-cyan-800'
											>
												<ArrowRightLeft className='w-4 h-4' />
												轉移擁有權
											</Button>
										</div>
									)}
								</section>
							)}
							{myPermForSelectedChar.canDeleteCharacter && (
								<>
									<p className='text-xs text-stone-400 leading-relaxed'>
										移除此角色後，該角色公開與私人背包內的所有物品、以及公開與私人錢包的所有貨幣，將自動全數轉入「🏕️
										營地儲物箱」。
									</p>
									<Button
										data-testid='character-delete'
										type='button'
										onClick={() =>
											onDeleteCharacter(currentSelectedChar)
										}
										variant='danger'
										size='sm'
										className='shadow'
									>
										<Trash2 className='w-4 h-4' />
										<span>
											移除角色「{currentSelectedChar.name}」(遺物入公庫)
										</span>
									</Button>
								</>
							)}
						</div>
					)}
				</div>
			)}
		</>
	);
}
