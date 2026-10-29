import { useMemo } from 'react';
import { useCampaignJourneys } from './CampaignJourneysContext';

export function useJourneyFilters(
	journeys: ReturnType<typeof useCampaignJourneys>['journeys'],
) {
	const { filter, characterFilter, tagFilter } = useCampaignJourneys();
	return useMemo(
		() => ({
			visibleJourneys: journeys.filter((journey) => {
				if (filter === 'quests' && !journey.isQuest) return false;
				if (filter === 'completed' && !journey.isCompleted) return false;
				if (
					characterFilter === '__unassigned__' &&
					journey.characterId !== null
				) {
					return false;
				}
				if (
					characterFilter &&
					characterFilter !== '__unassigned__' &&
					journey.characterId !== characterFilter
				) {
					return false;
				}
				if (tagFilter && !journey.tags.includes(tagFilter)) return false;
				return true;
			}),
		}),
		[characterFilter, filter, journeys, tagFilter],
	);
}
