export interface DisplayMember {
	id: string;
	identifier: string;
	type: 'dm' | 'player' | 'pending';
	roleText: string;
	maxCharacters?: number;
	invitationStatus?: string;
	invitedAt?: string | null;
	acceptedAt?: string | null;
}
