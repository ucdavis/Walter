/**
 * Wording for figures that leave out people whose pay is split across earn
 * codes without UCP-310 data (Unsplit): their salary can't be attributed to a
 * project, so tables and projections exclude them and say so.
 */
export function unsplitExclusionNote(subject: string, people: number): string {
  const who = people === 1 ? 'person' : 'people';
  return `${subject} exclude ${people} ${who} whose pay can't be split by earn code (no UCP-310 compensation data).`;
}
