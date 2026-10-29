import { useState, type FormEvent } from 'react';
import {
	ArrowRightLeft,
	Save,
	ShieldAlert,
	Trash2,
	User,
} from 'lucide-react';
import { Button, Checkbox, Input, Select } from '@/components/ui';
import { CharacterAvatar } from '@/components/CharacterAvatar';
import { CharacterAvatarPicker } from '@/components/CharacterAvatarPicker';
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

export function CharacterSettingsPanel({
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
	const [isAvatarUploading, setIsAvatarUploading] = useState(false);
	const handleProfileSubmit = (event: FormEvent<HTMLFormElement>) => {
		if (isAvatarUploading) {
			event.preventDefault();
			return;
		}
		onSaveCharacterProfile(event);
	};

	return (
		<>
			{/* ========================================== */}
			{/* 分頁 B：個別角色的設定與權限控制分頁           */}
			{/* ========================================== */}
			{currentSelectedChar && (
				<div className='space-y-6'>
					{/* 區塊 1：角色基本資料設定 (can_edit_profile) */}
					<form
						onSubmit={handleProfileSubmit}
						className='bg-background border border-border rounded-lg p-6 space-y-4 shadow-xl'
					>
						<div className='flex items-center justify-between border-b border-border pb-3'>
							<div className='flex items-center gap-2'>
								<CharacterAvatar
									avatar={currentSelectedChar.avatar}
									alt={`${currentSelectedChar.name}頭像`}
									className='h-9 w-9 rounded-full border border-primary/50 object-cover'
								/>
								<h2 className='text-base font-serif font-bold text-foreground'>
									{currentSelectedChar.name} — 角色基本資料
								</h2>
							</div>
							{!myPermForSelectedChar.canEditProfile && (
								<span className='text-[11px] px-2 py-0.5 rounded bg-card border border-border text-muted-foreground'>
									唯讀模式 (無基本資料修改權)
								</span>
							)}
						</div>

						<div className='grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs'>
							<Input
								data-testid='character-name'
								label='角色名稱 *'
								labelClassName='text-xs text-muted-foreground'
								type='text'
								required
								disabled={!myPermForSelectedChar.canEditProfile}
								value={editCharName}
								onChange={(e) => setEditCharName(e.target.value)}
								className='bg-card'
							/>

							<Input
								data-testid='character-title'
								label='頭銜 / 職業背景'
								labelClassName='text-xs text-muted-foreground'
								type='text'
								disabled={!myPermForSelectedChar.canEditProfile}
								value={editCharTitle}
								onChange={(e) => setEditCharTitle(e.target.value)}
								className='bg-card'
							/>

							<Input
								data-testid='character-strength'
								label='力量屬性 (STR)'
								labelClassName='text-xs text-primary-foreground'
								type='number'
								min={1}
								max={30}
								required
								disabled={!myPermForSelectedChar.canEditProfile}
								value={editCharStr}
								onChange={(e) =>
									setEditCharStr(parseInt(e.target.value, 10) || 10)
								}
								className='bg-card font-mono font-bold text-primary-foreground'
							/>

							<CharacterAvatarPicker
								avatar={editCharAvatar}
								userId={userId}
								disabled={!myPermForSelectedChar.canEditProfile}
								onChange={setEditCharAvatar}
								onUploadingChange={setIsAvatarUploading}
							/>
						</div>

						{myPermForSelectedChar.canEditProfile && (
							<div className='flex justify-end pt-3 border-t border-border'>
								<Button
									data-testid='character-save'
									type='submit'
									size='sm'
									disabled={isAvatarUploading}
									prefixIcon={<Save />}
								>
									<span>儲存角色基本資料</span>
								</Button>
							</div>
						)}
					</form>

					{/* 區塊 2：角色控制權限矩陣表 (can_manage_permissions) */}
					<div className='bg-background border border-border rounded-lg p-6 space-y-5 shadow-xl'>
						<div className='border-b border-border pb-3 flex flex-wrap items-center justify-between gap-2'>
							<div>
								<h2 className='text-base font-serif font-bold text-foreground'>
									角色控制權限矩陣 (Access Control List)
								</h2>
								<p className='text-xs text-muted-foreground mt-0.5'>
									設定戰役內各成員對「{currentSelectedChar.name}
									」的背包、錢包與管理控制權（為防誤鎖，玩家不可修改自己的權限列）。
								</p>
							</div>
							{!myPermForSelectedChar.canManagePermissions && (
								<span className='text-[11px] px-2.5 py-1 rounded bg-card border border-border text-muted-foreground'>
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
									const journeyAccess = isTargetDm
										? 2
										: (perm?.journeyAccess ?? (isTargetCreator ? 2 : 0));
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
											className='bg-card/70 border border-border rounded-lg p-4 space-y-3'
										>
											<div className='flex items-center justify-between border-b border-border/80 pb-2'>
												<div className='flex items-center gap-2'>
													<User className='w-4 h-4 text-primary-foreground' />
													<span className='text-xs font-bold text-foreground'>
														{member.identifier}
													</span>
													<span className='text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground'>
														{member.roleText}
													</span>
												</div>
												<div className='flex items-center gap-1.5 flex-wrap'>
													{isTargetDm && (
														<span className='text-[10px] px-2 py-0.5 rounded bg-muted text-foreground border border-border font-semibold'>
															👑 DM 預設全權限
														</span>
													)}
													{isTargetCreator && (
														<span className='text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground border border-primary/50 font-semibold'>
															✨ 角色創造者
														</span>
													)}
													{!isDm && isTargetSelf && (
														<span className='text-[10px] px-2 py-0.5 rounded bg-muted text-foreground border border-border font-medium'>
															🔒 本人權限 (防誤鎖保護)
														</span>
													)}
												</div>
											</div>

											<div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs'>
												{/* 公開背包權限 */}
												<div>
													<Select
														data-testid={`character-permission-public-bag-${currentSelectedChar.id}-${member.id}`}
														label='🎒 公開背包權限'
														labelClassName='block text-muted-foreground mb-1'
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
														className='bg-background px-2.5 py-1.5 text-primary-foreground'
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
														labelClassName='block text-muted-foreground mb-1'
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
														className='bg-background px-2.5 py-1.5 text-foreground'
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
														labelClassName='block text-muted-foreground mb-1'
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
														className='bg-background px-2.5 py-1.5 text-primary-foreground'
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
														labelClassName='block text-muted-foreground mb-1'
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
														className='bg-background px-2.5 py-1.5 text-foreground'
													>
														<option value={0}>0 - 無權限 (隱藏餘額)</option>
														<option value={1}>1 - 僅閱讀餘額</option>
														<option value={2}>2 - 閱讀 + 修改/轉出</option>
													</Select>
												</div>

												{/* 冒險筆記權限 */}
												<div>
													<Select
														data-testid={`character-permission-journey-${currentSelectedChar.id}-${member.id}`}
														label='📜 冒險筆記權限'
														labelClassName='block text-muted-foreground mb-1'
														containerClassName='gap-0'
														disabled={rowDisabled}
														value={journeyAccess}
														onChange={(e) =>
															onUpdatePermission(
																currentSelectedChar,
																member.id,
																'journeyAccess',
																parseInt(e.target.value, 10) as AccessLevel,
															)
														}
														className='bg-background px-2.5 py-1.5 text-foreground'
													>
														<option value={0}>0 - 無權限</option>
														<option value={1}>1 - 可閱讀私人筆記</option>
														<option value={2}>2 - 可閱讀與管理私人筆記</option>
													</Select>
													<p className='mt-1 text-[10px] text-muted-foreground'>
														等級 1 僅可閱讀；等級 2 可新增、修改與刪除。
													</p>
												</div>
											</div>

											{/* 3 項布林權限勾選 */}
											<div className='flex flex-wrap items-center gap-5 pt-2 border-t border-border/60 text-xs'>
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
													className='accent-primary'
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
													className='accent-destructive'
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
													className='accent-primary'
												/>
											</div>
										</div>
									);
								})}
						</div>
					</div>

					{/* 區塊 3：角色危險操作區 (can_delete_character) */}
					{(myPermForSelectedChar.canDeleteCharacter || isDm) && (
						<div className='bg-destructive/30 border border-destructive/60 rounded-lg p-5 space-y-3'>
							<div className='flex items-center gap-2 text-destructive-foreground font-serif font-bold text-sm'>
								<ShieldAlert className='w-4 h-4' />
								<span>角色危險操作區 — {currentSelectedChar.name}</span>
							</div>
							{isDm && (
								<section className='rounded-lg border border-border/70 bg-background/70 p-4 space-y-4'>
									<div className='flex items-center gap-2 border-b border-border pb-3'>
										<ArrowRightLeft className='w-4 h-4 text-foreground' />
										<div>
											<h2 className='text-sm font-serif font-bold text-foreground'>
												角色擁有權移轉
											</h2>
											<p className='text-xs text-muted-foreground mt-0.5'>
												目前擁有者：{currentOwnerName}
											</p>
										</div>
									</div>
									<p className='text-xs text-muted-foreground leading-relaxed'>
										你可以先替尚未加入的玩家建立角色；等玩家建立帳號並加入本戰役後，再將角色交給他。移轉後，玩家會取得角色完整控制權，原擁有者的個別權限設定會被移除（原擁有者仍依戰役預設權限讀取公開內容）。
									</p>
									{transferCandidates.length === 0 ? (
										<p className='rounded border border-border bg-card/70 px-3 py-2 text-xs text-muted-foreground'>
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
												className='flex-1 bg-card focus-visible:border-border'
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
												prefixIcon={<ArrowRightLeft />}
											>
												轉移擁有權
											</Button>
										</div>
									)}
								</section>
							)}
							{myPermForSelectedChar.canDeleteCharacter && (
								<>
									<p className='text-xs text-muted-foreground leading-relaxed'>
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
										prefixIcon={<Trash2 />}
									>
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
