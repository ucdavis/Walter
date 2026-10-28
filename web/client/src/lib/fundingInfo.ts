/**
 * Wording for people whose pay is split across earn codes with no UCP-310
 * compensation data (EarnCodeStatus "Unsplit", an internal status never shown):
 * their salary can't be attributed to a project, so it is hidden and left out
 * of totals and projections.
 */
export const FUNDING_INFO_UNAVAILABLE = 'Funding entry info not available';

export function fundingInfoUnavailableNote(
  subject: string,
  people: number
): string {
  const who = people === 1 ? 'person' : 'people';
  return `${subject} exclude ${people} ${who} whose funding entry info is not available.`;
}
