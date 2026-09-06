const THREE_WEEKS_MS = 26 * 24 * 60 * 60 * 1000;

/** True if the user ever created 3+ plans within any rolling 26-day window. */
export function hasThreePlansInTwoWeeks(createdAts: string[]): boolean {
  if (createdAts.length < 3) return false;

  const sorted = createdAts
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  if (sorted.length < 3) return false;

  for (let i = 0; i <= sorted.length - 3; i++) {
    const windowEnd = sorted[i] + THREE_WEEKS_MS;
    let count = 0;
    for (let j = i; j < sorted.length && sorted[j] <= windowEnd; j++) {
      count++;
    }
    if (count >= 3) return true;
  }

  return false;
}

export function getMostRecentPlanDate(createdAts: string[]): string | null {
  if (createdAts.length === 0) return null;
  const sorted = createdAts
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return sorted[0]?.toISOString() ?? null;
}

/** Earn once via a 2-week burst; keep badge while a plan was created within the last month. */
export function isCommunityBuilderStatus(createdAts: string[], now = new Date()): boolean {
  if (!hasThreePlansInTwoWeeks(createdAts)) return false;

  const lastCreatedAt = getMostRecentPlanDate(createdAts);
  if (!lastCreatedAt) return false;

  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  return new Date(lastCreatedAt) > oneMonthAgo;
}
