import type { FormEvent, KeyboardEvent } from 'react';
import { Settings, Shield, Store, UserRound } from 'lucide-react';
import { Button } from '@/components/ui';
import { CampaignShopSettingsPanel } from './CampaignShopSettingsPanel';
import {
	type AccessLevel,
	type Character,
	type CharacterPermission,
} from '@/types';
import {
	AllCharactersSettingsdPanel,
	type CharacterPermissions,
} from './AllCharactersSettingsdPanel';
import { GeneralSettingsPanel } from './GeneralSettingsPanel';
import type { DisplayMember } from './types';

interface CampaignSettingsViewProps {
	activeTab: string;
	setActiveTab: (tab: string) => void;
	activeCharacterId: string;
	setActiveCharacterId: (characterId: string) => void;
	isDm: boolean;
	notice: string | null;
	campaignName: string;
	setCampaignName: (name: string) => void;
	officialCatalogIds: string[];
	onSaveOfficialCatalogIds: (catalogIds: string[]) => Promise<void>;
	inviteCode: string;
	copied: boolean;
	setCopied: (copied: boolean) => void;
	allMembers: DisplayMember[];
	campaignCharacters: Character[];
	inviteEmail: string;
	setInviteEmail: (email: string) => void;
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
	allPermissions: CharacterPermission[];
	userId?: string;
	onSaveGeneralSettings: (event: FormEvent<HTMLFormElement>) => void;
	onUpdateMemberMaxChars: (memberId: string, maxCharacters: number) => void;
	onSendEmailInvite: (event: FormEvent<HTMLFormElement>) => void;
	onDeleteCampaign: () => void;
	onSaveCharacterProfile: (event: FormEvent<HTMLFormElement>) => void;
	onUpdatePermission: (
		character: Character,
		targetUserId: string,
		field: keyof CharacterPermission,
		value: AccessLevel | boolean,
	) => void;
	onTransferCharacter: (character: Character, targetUserId: string) => void;
	onDeleteCharacter: (character: Character) => void;
	canCreateCharacter: boolean;
	createCharTooltip: string;
	onAddCharacter: () => void;
}

export function CampaignSettingsView({
	activeTab,
	setActiveTab,
	activeCharacterId,
	setActiveCharacterId,
	isDm,
	notice,
	campaignName,
	setCampaignName,
	officialCatalogIds,
	onSaveOfficialCatalogIds,
	inviteCode,
	copied,
	setCopied,
	allMembers,
	campaignCharacters,
	inviteEmail,
	setInviteEmail,
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
	allPermissions,
	userId,
	onSaveGeneralSettings,
	onUpdateMemberMaxChars,
	onSendEmailInvite,
	onDeleteCampaign,
	onSaveCharacterProfile,
	onUpdatePermission,
	onTransferCharacter,
	onDeleteCharacter,
	canCreateCharacter,
	createCharTooltip,
	onAddCharacter,
}: CampaignSettingsViewProps) {
	const handleTabKeyDown = (
		event: KeyboardEvent<HTMLDivElement>,
		onChange: (tab: string) => void,
		fallbackTab: string,
	) => {
		if (
			event.key !== 'ArrowRight' &&
			event.key !== 'ArrowLeft' &&
			event.key !== 'Home' &&
			event.key !== 'End'
		) {
			return;
		}

		const tabs = Array.from(
			event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
		);
		const currentIndex = tabs.indexOf(event.target as HTMLButtonElement);
		if (currentIndex < 0 || tabs.length === 0) return;

		event.preventDefault();
		const nextIndex =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? tabs.length - 1
					: (currentIndex +
							(event.key === 'ArrowRight' ? 1 : -1) +
							tabs.length) %
						tabs.length;
		const nextTab = tabs[nextIndex];
		nextTab.focus();
		onChange(nextTab.dataset.tabValue ?? fallbackTab);
	};

	return (
		<main className='max-w-5xl mx-auto px-4 py-8 space-y-6'>
			<div className='flex items-center gap-3 border-b border-amber-900/50 pb-4'>
				<div className='p-2.5 rounded-lg bg-amber-950 border border-amber-600/50 text-amber-300'>
					<Settings className='w-6 h-6' />
				</div>
				<div>
					<h1
						data-testid='campaign-settings-heading'
						className='text-xl font-serif font-bold text-amber-100'
					>
						戰役與角色控制權限中心
					</h1>
					<p className='text-xs text-stone-400'>
						管理戰役屬性、個別玩家可創建角色配額，以及各冒險者角色的細粒度存取權限矩陣
					</p>
				</div>
			</div>

			{notice && (
				<div
					data-testid='campaign-settings-notice'
					className='p-3 rounded bg-amber-950/60 border border-amber-600/60 text-amber-200 text-xs'
				>
					{notice}
				</div>
			)}

			{/* 分頁導覽列 */}
			<div
				role='tablist'
				aria-label='戰役與角色設定'
				onKeyDown={(event) => handleTabKeyDown(event, setActiveTab, 'general')}
				className='flex items-center gap-2 overflow-x-auto pb-2 border-b border-stone-800'
			>
				<Button
					id='campaign-settings-tab-general'
					data-testid='campaign-settings-tab-general'
					data-tab-value='general'
					role='tab'
					aria-selected={activeTab === 'general'}
					aria-controls='campaign-settings-panel'
					tabIndex={activeTab === 'general' ? 0 : -1}
					type='button'
					onClick={() => setActiveTab('general')}
					variant='ghost'
					size='sm'
					className={`shrink-0 ${
						activeTab === 'general'
							? 'bg-amber-800 text-amber-100 border border-amber-500/70 shadow'
							: 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
					}`}
				>
					<Shield className='w-3.5 h-3.5 text-amber-400' />
					<span>⚙️ 戰役常規設定與成員配額</span>
				</Button>

				<Button
					id='campaign-settings-tab-characters'
					data-testid='campaign-settings-tab-characters'
					data-tab-value='characters'
					role='tab'
					aria-selected={activeTab === 'characters'}
					aria-controls='campaign-settings-panel'
					tabIndex={activeTab === 'characters' ? 0 : -1}
					type='button'
					onClick={() => setActiveTab('characters')}
					variant='ghost'
					size='sm'
					className={`shrink-0 ${
						activeTab === 'characters'
							? 'bg-purple-900 text-purple-100 border border-purple-500/70 shadow'
							: 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
					}`}
				>
					<UserRound className='w-3.5 h-3.5 text-purple-300' />
					<span>角色</span>
				</Button>

				<Button
					id='campaign-settings-tab-shops'
					data-testid='campaign-settings-tab-shops'
					data-tab-value='shops'
					role='tab'
					aria-selected={activeTab === 'shops'}
					aria-controls='campaign-settings-panel'
					tabIndex={activeTab === 'shops' ? 0 : -1}
					type='button'
					onClick={() => setActiveTab('shops')}
					variant='ghost'
					size='sm'
					className={`shrink-0 ${
						activeTab === 'shops'
							? 'bg-cyan-900 text-cyan-100 border border-cyan-500/70 shadow'
							: 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
					}`}
				>
					<Store className='w-3.5 h-3.5 text-cyan-300' />
					<span>商店</span>
				</Button>
			</div>

			<section
				id='campaign-settings-panel'
				data-testid='campaign-settings-panel'
				role='tabpanel'
				aria-labelledby={`campaign-settings-tab-${activeTab}`}
				tabIndex={0}
			>
				<GeneralSettingsPanel
					activeTab={activeTab}
					isDm={isDm}
					campaignName={campaignName}
					setCampaignName={setCampaignName}
					inviteCode={inviteCode}
					copied={copied}
					setCopied={setCopied}
					allMembers={allMembers}
					campaignCharacters={campaignCharacters}
					inviteEmail={inviteEmail}
					setInviteEmail={setInviteEmail}
					onSaveGeneralSettings={onSaveGeneralSettings}
					onUpdateMemberMaxChars={onUpdateMemberMaxChars}
					onSendEmailInvite={onSendEmailInvite}
					onDeleteCampaign={onDeleteCampaign}
				/>

				{activeTab === 'shops' && (
					<CampaignShopSettingsPanel
						isDm={isDm}
						selectedCatalogIds={officialCatalogIds}
						onSave={onSaveOfficialCatalogIds}
					/>
				)}

				{activeTab === 'characters' && (
					<AllCharactersSettingsdPanel
						activeCharacterId={activeCharacterId}
						setActiveCharacterId={setActiveCharacterId}
						isDm={isDm}
						campaignCharacters={campaignCharacters}
						currentSelectedChar={currentSelectedChar}
						currentOwnerName={currentOwnerName}
						transferCandidates={transferCandidates}
						selectedTransferTarget={selectedTransferTarget}
						setTransferTargetUserId={setTransferTargetUserId}
						myPermForSelectedChar={myPermForSelectedChar}
						editCharName={editCharName}
						setEditCharName={setEditCharName}
						editCharTitle={editCharTitle}
						setEditCharTitle={setEditCharTitle}
						editCharStr={editCharStr}
						setEditCharStr={setEditCharStr}
						editCharAvatar={editCharAvatar}
						setEditCharAvatar={setEditCharAvatar}
						allMembers={allMembers}
						allPermissions={allPermissions}
						userId={userId}
						onSaveCharacterProfile={onSaveCharacterProfile}
						onUpdatePermission={onUpdatePermission}
						onTransferCharacter={onTransferCharacter}
						onDeleteCharacter={onDeleteCharacter}
						canCreateCharacter={canCreateCharacter}
						createCharTooltip={createCharTooltip}
						onAddCharacter={onAddCharacter}
					/>
				)}
			</section>
		</main>
	);
}
