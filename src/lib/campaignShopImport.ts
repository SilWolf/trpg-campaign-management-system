export interface CampaignShopImportRow {
	line: number;
	name: string;
	unitPriceGp: number;
	stockAvailable: number;
}

export interface CampaignShopImportError {
	line: number;
	raw: string;
	message: string;
}

export type CampaignShopImportResult =
	| { rows: CampaignShopImportRow[]; errors: [] }
	| { rows: []; errors: CampaignShopImportError[] };

const MAX_UNIT_PRICE_GP = 10_000_000_000;
const MAX_STOCK = 2_147_483_647;

export function parseCampaignShopImport(
	input: string,
): CampaignShopImportResult {
	const rows: CampaignShopImportRow[] = [];
	const errors: CampaignShopImportError[] = [];

	input.split(/\r?\n/).forEach((rawLine, index) => {
		if (rawLine.trim() === '') return;

		const fields = rawLine.split('|').map((field) => field.trim());
		const line = index + 1;
		if (fields.length !== 3) {
			errors.push({
				line,
				raw: rawLine,
				message: '每行必須依序包含名稱、單價（gp）及庫存數量。',
			});
			return;
		}

		const [name, priceText, stockText] = fields;
		if (!name || name.length > 120) {
			errors.push({
				line,
				raw: rawLine,
				message: '物品名稱不可空白，且不得超過 120 個字元。',
			});
			return;
		}

		if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(priceText)) {
			errors.push({
				line,
				raw: rawLine,
				message: '單價必須是大於 0 且最多兩位小數的 gp 數值。',
			});
			return;
		}
		const unitPriceGp = Number(priceText);
		if (
			!Number.isFinite(unitPriceGp) ||
			unitPriceGp <= 0 ||
			unitPriceGp >= MAX_UNIT_PRICE_GP
		) {
			errors.push({
				line,
				raw: rawLine,
				message: '單價必須大於 0 且小於 10,000,000,000 gp。',
			});
			return;
		}

		if (!/^\d+$/.test(stockText)) {
			errors.push({
				line,
				raw: rawLine,
				message: '庫存數量必須是非負整數。',
			});
			return;
		}
		const stockAvailable = Number(stockText);
		if (!Number.isSafeInteger(stockAvailable) || stockAvailable > MAX_STOCK) {
			errors.push({
				line,
				raw: rawLine,
				message: '庫存數量超出資料庫可儲存範圍。',
			});
			return;
		}

		rows.push({ line, name, unitPriceGp, stockAvailable });
	});

	return errors.length > 0 ? { rows: [], errors } : { rows, errors: [] };
}
