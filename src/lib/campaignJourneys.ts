import {
	fromDbCampaignJourney,
	fromDbCampaignJourneyDmNote,
	serializeCampaignJourneyTags,
	supabase,
	type DbCampaignJourney,
	type DbCampaignJourneyDmNote,
} from '@/lib/supabase';
import type {
	CampaignJourney,
	CampaignJourneyDmNote,
} from '@/types';

export type CampaignJourneyCreateValues = Pick<
	CampaignJourney,
	| 'title'
	| 'tags'
	| 'content'
	| 'characterId'
	| 'isQuest'
	| 'isCompleted'
	| 'visibility'
>;

export type CampaignJourneyUpdateValues = Partial<CampaignJourneyCreateValues>;

const CAMPAIGN_JOURNEY_SELECT =
	'id,campaign_id,title,tags,content,character_id,created_by,created_at,is_quest,is_completed,visibility';
const CAMPAIGN_JOURNEY_DM_NOTE_SELECT = 'journey_id,campaign_id,content';

function requireSupabase() {
	if (!supabase) {
		throw new Error('冒險筆記雲端資料需要設定 Supabase，請先完成登入與環境設定。');
	}
	return supabase;
}

function throwSupabaseError(error: { code?: string; message: string }): never {
	throw new Error(
		error.code ? `${error.message} (${error.code})` : error.message,
		{ cause: error },
	);
}

function serializeJourneyValues(
	values: CampaignJourneyCreateValues | CampaignJourneyUpdateValues,
) {
	return {
		...(values.title !== undefined ? { title: values.title } : {}),
		...(values.tags !== undefined
			? { tags: serializeCampaignJourneyTags(values.tags) }
			: {}),
		...(values.content !== undefined ? { content: values.content } : {}),
		...(values.characterId !== undefined
			? { character_id: values.characterId }
			: {}),
		...(values.isQuest !== undefined ? { is_quest: values.isQuest } : {}),
		...(values.isCompleted !== undefined
			? { is_completed: values.isCompleted }
			: {}),
		...(values.visibility !== undefined
			? { visibility: values.visibility }
			: {}),
	};
}

export async function loadCampaignJourneys(
	campaignId: string,
): Promise<CampaignJourney[]> {
	const { data, error } = await requireSupabase()
		.from('campaign_journeys')
		.select(CAMPAIGN_JOURNEY_SELECT)
		.eq('campaign_id', campaignId)
		.order('created_at', { ascending: false });
	if (error) throwSupabaseError(error);
	return ((data ?? []) as DbCampaignJourney[]).map(fromDbCampaignJourney);
}

export async function loadCampaignJourney(
	campaignId: string,
	journeyId: string,
): Promise<CampaignJourney | null> {
	const { data, error } = await requireSupabase()
		.from('campaign_journeys')
		.select(CAMPAIGN_JOURNEY_SELECT)
		.eq('campaign_id', campaignId)
		.eq('id', journeyId)
		.maybeSingle();
	if (error) throwSupabaseError(error);
	return data
		? fromDbCampaignJourney(data as DbCampaignJourney)
		: null;
}

export async function createCampaignJourney(
	campaignId: string,
	values: CampaignJourneyCreateValues,
): Promise<CampaignJourney> {
	const { data, error } = await requireSupabase()
		.from('campaign_journeys')
		.insert({
			campaign_id: campaignId,
			...serializeJourneyValues(values),
		})
		.select(CAMPAIGN_JOURNEY_SELECT)
		.single();
	if (error) throwSupabaseError(error);
	return fromDbCampaignJourney(data as DbCampaignJourney);
}

export async function updateCampaignJourney(
	campaignId: string,
	journeyId: string,
	values: CampaignJourneyUpdateValues,
): Promise<CampaignJourney> {
	const update = serializeJourneyValues(values);
	if (Object.keys(update).length === 0) {
		throw new Error('更新冒險筆記時至少需要提供一個可修改欄位。');
	}
	const { data, error } = await requireSupabase()
		.from('campaign_journeys')
		.update(update)
		.eq('campaign_id', campaignId)
		.eq('id', journeyId)
		.select(CAMPAIGN_JOURNEY_SELECT)
		.maybeSingle();
	if (error) throwSupabaseError(error);
	if (!data) throw new Error('冒險筆記不存在或目前帳號沒有修改權限。');
	return fromDbCampaignJourney(data as DbCampaignJourney);
}

export async function deleteCampaignJourney(
	campaignId: string,
	journeyId: string,
): Promise<void> {
	const { data, error } = await requireSupabase()
		.from('campaign_journeys')
		.delete()
		.eq('campaign_id', campaignId)
		.eq('id', journeyId)
		.select('id')
		.maybeSingle();
	if (error) throwSupabaseError(error);
	if (!data) throw new Error('冒險筆記不存在或目前帳號沒有刪除權限。');
}

function requireDm(isDm: boolean) {
	if (!isDm) {
		throw new Error('只有確認為戰役 DM 後才能存取 DM 專屬冒險筆記。');
	}
}

export async function loadCampaignJourneyDmNote(
	campaignId: string,
	journeyId: string,
	isDm: boolean,
): Promise<CampaignJourneyDmNote | null> {
	requireDm(isDm);
	const { data, error } = await requireSupabase()
		.from('campaign_journey_dm_notes')
		.select(CAMPAIGN_JOURNEY_DM_NOTE_SELECT)
		.eq('campaign_id', campaignId)
		.eq('journey_id', journeyId)
		.maybeSingle();
	if (error) throwSupabaseError(error);
	return data
		? fromDbCampaignJourneyDmNote(data as DbCampaignJourneyDmNote)
		: null;
}

export async function saveCampaignJourneyDmNote(
	campaignId: string,
	journeyId: string,
	content: string,
	isDm: boolean,
): Promise<CampaignJourneyDmNote> {
	requireDm(isDm);
	const result = await requireSupabase()
		.from('campaign_journey_dm_notes')
		.upsert(
			{ campaign_id: campaignId, journey_id: journeyId, content },
			{ onConflict: 'journey_id' },
		)
		.select(CAMPAIGN_JOURNEY_DM_NOTE_SELECT)
		.single();
	if (result.error) throwSupabaseError(result.error);
	return fromDbCampaignJourneyDmNote(
		result.data as DbCampaignJourneyDmNote,
	);
}
