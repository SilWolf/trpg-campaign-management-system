import type { FormEvent, KeyboardEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui';
import {
	CAMP_CHEST_ID,
	type AccessLevel,
	type Character,
	type CharacterPermission,
} from '@/types';
import { CharacterSettingsPanel } from './CharacterSettingsPanel';
import type { DisplayMember } from './types';

export interface CharacterPermissions {
	canEditProfile: boolean;
	canDeleteCharacter: boolean;
	canManagePermissions: boolean;
}

interface AllCharactersSettingsdPanelProps {
	activeCharacterId: string;
	setActiveCharacterId: (characterId: string) => void;
	isDm: boolean;
	campaignCharacters: Character[];
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
	canCreateCharacter: boolean;
	createCharTooltip: string;
	onAddCharacter: () => void;
}

export function AllCharactersSettingsdPanel({
	activeCharacterId,
	setActiveCharacterId,
	isDm,
	campaignCharacters,
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
	canCreateCharacter,
	createCharTooltip,
	onAddCharacter,
}: AllCharactersSettingsdPanelProps) {
	const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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
		setActiveCharacterId(
			nextTab.dataset.tabValue ??
				campaignCharacters.find((character) => character.id !== CAMP_CHEST_ID)
					?.id ??
				'',
		);
	};

	return (
		<div className='space-y-5'>
			<div className='flex flex-wrap items-center justify-between gap-3'>
				<h2 className='text-base font-serif font-bold text-purple-200'>
					戰役角色
				</h2>
				<Button
					data-testid='character-add'
					type='button'
					size='sm'
					onClick={onAddCharacter}
					disabled={!canCreateCharacter}
					title={createCharTooltip}
					className='bg-purple-950/90 hover:bg-purple-900 disabled:opacity-35 disabled:cursor-not-allowed border border-purple-500/70 text-purple-200'
				>
					<UserPlus className='w-4 h-4' />
					<span>新增角色</span>
				</Button>
			</div>

			<div
				role='tablist'
				aria-label='個別角色設定'
				onKeyDown={handleTabKeyDown}
				className='flex items-center gap-2 overflow-x-auto pb-2 border-b border-stone-800'
			>
				{campaignCharacters
					.filter((character) => character.id !== CAMP_CHEST_ID)
					.map((character) => {
						const isActive = activeCharacterId === character.id;
						return (
							<Button
								key={character.id}
								id={`campaign-settings-tab-${character.id}`}
								data-testid={`campaign-settings-tab-${character.id}`}
								data-tab-value={character.id}
								role='tab'
								aria-selected={isActive}
								aria-controls='campaign-settings-character-panel'
								tabIndex={isActive ? 0 : -1}
								type='button'
								onClick={() => setActiveCharacterId(character.id)}
								variant='ghost'
								size='sm'
								className={`shrink-0 ${
									isActive
										? 'bg-purple-900 text-purple-100 border border-purple-500/70 shadow'
										: 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
								}`}
							>
								<span>{character.avatar}</span>
								<span>{character.name}</span>
							</Button>
						);
					})}
			</div>

			<section
				id='campaign-settings-character-panel'
				role='tabpanel'
				aria-labelledby={
					activeCharacterId
						? `campaign-settings-tab-${activeCharacterId}`
						: undefined
				}
				tabIndex={0}
			>
				{currentSelectedChar ? (
					<CharacterSettingsPanel
						isDm={isDm}
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
					/>
				) : (
					<p className='rounded-lg border border-stone-800 bg-stone-950 p-6 text-sm text-stone-400'>
						目前沒有角色資料，請新增冒險者角色以開始管理。
					</p>
				)}
			</section>
		</div>
	);
}
