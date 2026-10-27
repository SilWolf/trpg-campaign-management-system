import {
	fromDbBlacksmithItem,
	supabase,
	toDbBlacksmithItem,
	type DbBlacksmithItem,
} from '@/lib/supabase';
import type { BlacksmithTemplate } from '@/types';

type BlacksmithTemplateValue<T> = T extends BlacksmithTemplate
	? Omit<T, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
	: never;
export type BlacksmithTemplateValues = BlacksmithTemplateValue<BlacksmithTemplate>;

function requireSupabase() {
	if (!supabase) {
		throw new Error('雲端鍛造與分享需要設定 Supabase，請先完成登入與環境設定。');
	}
	return supabase;
}

export async function loadBlacksmithTemplates(
	ownerId: string,
): Promise<{ mine: BlacksmithTemplate[]; shared: BlacksmithTemplate[] }> {
	const client = requireSupabase();
	const [mineResult, sharedResult] = await Promise.all([
		client
			.from('blacksmith_items')
			.select('*')
			.eq('owner_id', ownerId)
			.order('updated_at', { ascending: false }),
		client
			.from('blacksmith_items')
			.select('*')
			.eq('is_shared', true)
			.neq('owner_id', ownerId)
			.order('updated_at', { ascending: false }),
	]);

	if (mineResult.error) throw mineResult.error;
	if (sharedResult.error) throw sharedResult.error;
	return {
		mine: (mineResult.data ?? []).map(fromDbBlacksmithItem),
		shared: (sharedResult.data ?? []).map(fromDbBlacksmithItem),
	};
}

export async function saveBlacksmithTemplate(
	values: BlacksmithTemplateValues,
	ownerId: string,
	id?: string,
): Promise<BlacksmithTemplate> {
	const client = requireSupabase();
	const now = new Date().toISOString();
	const metadata = {
		id: id ?? crypto.randomUUID(),
		ownerId,
		isHomebrew: true,
		createdAt: now,
		updatedAt: now,
	};
	const template: BlacksmithTemplate =
		values.category === 'Weapon'
			? { ...values, ...metadata }
			: values.category === 'Armor'
				? { ...values, ...metadata }
				: { ...values, ...metadata };
	const insertValues: Partial<DbBlacksmithItem> = toDbBlacksmithItem(template);
	delete insertValues.created_at;
	delete insertValues.updated_at;
	const updateValues: Partial<DbBlacksmithItem> = { ...insertValues };
	delete updateValues.id;
	delete updateValues.owner_id;

	const result = id
		? await client
				.from('blacksmith_items')
				.update(updateValues)
				.eq('id', id)
				.eq('owner_id', ownerId)
				.select()
				.single()
		: await client
				.from('blacksmith_items')
				.insert(insertValues)
				.select()
				.single();

	if (result.error) throw result.error;
	return fromDbBlacksmithItem(result.data);
}

export async function deleteBlacksmithTemplate(
	id: string,
	ownerId: string,
): Promise<void> {
	const { error } = await requireSupabase()
		.from('blacksmith_items')
		.delete()
		.eq('id', id)
		.eq('owner_id', ownerId);
	if (error) throw error;
}
