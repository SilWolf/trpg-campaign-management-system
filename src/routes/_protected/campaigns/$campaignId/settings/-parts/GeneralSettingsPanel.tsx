import type { FormEvent } from 'react';
import { Check, Copy, Save, ShieldAlert, Users } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { CAMP_CHEST_ID, type Character } from '@/types';
import type { DisplayMember } from './types';

interface GeneralSettingsPanelProps {
	activeTab: string;
	isDm: boolean;
	campaignName: string;
	setCampaignName: (name: string) => void;
	inviteCode: string;
	copied: boolean;
	setCopied: (copied: boolean) => void;
	allMembers: DisplayMember[];
	campaignCharacters: Character[];
	inviteEmail: string;
	setInviteEmail: (email: string) => void;
	onSaveGeneralSettings: (event: FormEvent<HTMLFormElement>) => void;
	onUpdateMemberMaxChars: (memberId: string, maxCharacters: number) => void;
	onSendEmailInvite: (event: FormEvent<HTMLFormElement>) => void;
	onDeleteCampaign: () => void;
}

export function GeneralSettingsPanel({
	activeTab,
	isDm,
	campaignName,
	setCampaignName,
	inviteCode,
	copied,
	setCopied,
	allMembers,
	campaignCharacters,
	inviteEmail,
	setInviteEmail,
	onSaveGeneralSettings,
	onUpdateMemberMaxChars,
	onSendEmailInvite,
	onDeleteCampaign,
}: GeneralSettingsPanelProps) {
	return (
		<>
			{/* ========================================== */}
			{/* 分頁 A：戰役常規設定與成員總覽                 */}
			{/* ========================================== */}
			{activeTab === 'general' && (
				<div className='space-y-6'>
					<form
						onSubmit={onSaveGeneralSettings}
						className='bg-background border border-border rounded-lg p-6 space-y-5 shadow-xl'
					>
						<div className='flex items-center justify-between border-b border-border pb-2'>
							<h2 className='text-sm font-serif font-bold text-foreground'>
								戰役基本參數
							</h2>
							{!isDm && (
								<span className='text-[11px] px-2 py-0.5 rounded bg-card border border-border text-muted-foreground'>
									唯讀模式 (僅 DM 可修改)
								</span>
							)}
						</div>

						<Input
							data-testid='campaign-name'
							label='戰役名稱'
							labelClassName='text-xs font-semibold text-foreground'
							type='text'
							required
							disabled={!isDm}
							value={campaignName}
							onChange={(e) => setCampaignName(e.target.value)}
							className='bg-card'
						/>

						<div>
							<p className='text-xs font-semibold text-foreground mb-1.5'>
								戰役邀請碼 (Invite Code)
							</p>
							<div className='flex items-center gap-2'>
								<Input
									type='text'
									readOnly
									aria-label='戰役邀請碼'
									value={inviteCode}
									className='bg-card font-mono text-primary-foreground'
								/>
								<Button
									type='button'
									variant='secondary'
									size='sm'
									onClick={() => {
										navigator.clipboard.writeText(inviteCode);
										setCopied(true);
										setTimeout(() => setCopied(false), 2000);
									}}
									className='shrink-0'
								>
									{copied ? (
										<Check className='w-4 h-4 text-muted-foreground' />
									) : (
										<Copy className='w-4 h-4' />
									)}
									<span>{copied ? '已複製' : '複製邀請碼'}</span>
								</Button>
							</div>
							<p className='text-[11px] text-muted-foreground mt-1'>
								其他冒險者可在大廳輸入此邀請碼加入本戰役。
							</p>
						</div>

						{isDm && (
							<div className='flex justify-end pt-3 border-t border-border'>
								<Button
									data-testid='campaign-save'
									type='submit'
									size='sm'
									className='shadow'
								>
									<Save className='w-4 h-4' />
									<span>儲存變更</span>
								</Button>
							</div>
						)}
					</form>

					{/* 戰役成員總覽與個別角色數量上限設定 */}
					<div className='bg-background border border-border rounded-lg p-6 space-y-4 shadow-xl'>
						<div className='flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3'>
							<div>
								<h2 className='text-sm font-serif font-bold text-foreground flex items-center gap-2'>
									<Users className='w-4 h-4 text-foreground' />
									<span>戰役成員總覽與角色創建配額</span>
								</h2>
								<p className='text-[11px] text-muted-foreground mt-0.5'>
									DM 可針對每名玩家個別設定允許創建的角色數量上限（預設為
									1，設為 0 代表禁止創建）。
								</p>
							</div>
							<span className='text-[11px] text-muted-foreground'>
								共 {allMembers.length} 位成員/名單
							</span>
						</div>

						{allMembers.length === 0 ? (
							<p className='text-xs text-muted-foreground italic py-2'>
								目前尚無任何成員資料。
							</p>
						) : (
							<div className='space-y-2'>
								{allMembers.map((member) => {
									const badgeStyle =
										member.type === 'dm'
											? 'bg-primary/80 text-primary-foreground border-primary/60'
											: member.type === 'player'
												? 'bg-background/80 text-foreground border-border/60'
												: 'bg-card text-muted-foreground border-border border-dashed';

									const createdCount = campaignCharacters.filter(
										(c) => c.id !== CAMP_CHEST_ID && c.userId === member.id,
									).length;

									return (
										<div
											key={member.id}
											className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-card/60 border border-border rounded-md px-4 py-2.5 text-xs'
										>
											<div className='flex items-center gap-2 min-w-0'>
												<span className='font-mono text-foreground truncate max-w-[240px] sm:max-w-md'>
													{member.identifier}
												</span>
												<span
													className={`px-2 py-0.5 rounded border text-[10px] font-medium shrink-0 ${badgeStyle}`}
												>
													{member.roleText}
												</span>
											</div>

											<div className='flex items-center gap-3 shrink-0'>
												{member.invitationStatus && (
													<div className='text-right text-[10px] text-muted-foreground'>
														<p
															className={
																member.acceptedAt
																	? 'text-foreground'
																	: 'text-primary-foreground'
															}
														>
															{member.invitationStatus}
														</p>
														{member.invitedAt && (
															<p>
																邀請時間：
																{new Date(member.invitedAt).toLocaleString('zh-TW')}
															</p>
														)}
														{member.acceptedAt && (
															<p>
																接受時間：
																{new Date(member.acceptedAt).toLocaleString('zh-TW')}
															</p>
														)}
													</div>
												)}
												{member.type === 'dm' && (
													<span className='text-[11px] text-primary-foreground/90 font-mono'>
														已建 {createdCount} 名角色（DM 無上限）
													</span>
												)}

												{member.type === 'player' && (
													<div className='flex items-center gap-2 bg-background border border-border rounded px-2.5 py-1'>
														<span className='text-[11px] text-muted-foreground'>
															角色配額 (已建 {createdCount} 名 / 上限:
														</span>
														{isDm ? (
															<Input
																data-testid={`campaign-member-quota-${member.id}`}
																type='number'
																min={0}
																max={20}
																aria-label={`玩家 ${member.identifier} 的角色創建上限`}
																value={member.maxCharacters ?? 1}
																onChange={(e) =>
																	onUpdateMemberMaxChars(
																		member.id,
																		parseInt(e.target.value, 10) || 0,
																	)
																}
																className='w-12 rounded px-1.5 py-0.5 text-center font-mono font-bold text-primary-foreground border-primary/60 bg-card focus-visible:border-primary'
															/>
														) : (
															<span className='font-mono font-bold text-primary-foreground'>
																{member.maxCharacters ?? 1}
															</span>
														)}
														<span className='text-[11px] text-muted-foreground'>
															名)
														</span>
													</div>
												)}
											</div>
										</div>
									);
								})}
							</div>
						)}

						{isDm && (
							<div className='pt-4 border-t border-border space-y-2.5'>
								<div className='flex items-center gap-2 text-primary-foreground font-serif font-bold text-sm'>
									<span>📧 Email 邀請冒險者</span>
								</div>
								<p className='text-xs text-muted-foreground'>
									輸入玩家的電子郵件，將其納入本戰役的受邀名單中。
								</p>
								<form
									data-testid='campaign-invite-form'
									onSubmit={onSendEmailInvite}
									className='flex items-center gap-2'
								>
									<Input
										data-testid='campaign-invite-email'
										type='email'
										required
										aria-label='受邀玩家電子郵件'
										value={inviteEmail}
										onChange={(e) => setInviteEmail(e.target.value)}
										placeholder='player@example.com'
										className='flex-1 bg-card'
									/>
									<Button
										data-testid='campaign-email-invite'
										type='submit'
										variant='secondary'
										className='shrink-0 border-border bg-card text-foreground hover:bg-muted'
									>
										發送邀請
									</Button>
								</form>
							</div>
						)}
					</div>

					{/* DM 危險區域：刪除戰役 */}
					{isDm && (
						<div className='bg-destructive/30 border border-destructive/60 rounded-lg p-5 space-y-3'>
							<div className='flex items-center gap-2 text-destructive-foreground font-serif font-bold text-sm'>
								<ShieldAlert className='w-4 h-4' />
								<span>戰役危險區域</span>
							</div>
							<p className='text-xs text-muted-foreground leading-relaxed'>
								刪除戰役將會永久移除該戰役底下的所有角色、背包物品與公庫資料，此動作無法復原。
							</p>
							<Button
								data-testid='campaign-delete'
								type='button'
								onClick={onDeleteCampaign}
								variant='danger'
								size='sm'
								className='shadow'
							>
								永久刪除此戰役
							</Button>
						</div>
					)}
				</div>
			)}
		</>
	);
}
