export const PLAN_SKILL_LEVELS = ['Beginner', 'Intermediate', 'Local Legend'] as const;

export type PlanSkillLevel = (typeof PLAN_SKILL_LEVELS)[number];

export function parsePlanSkillLevel(raw: string | null | undefined): PlanSkillLevel | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  const cap = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if ((PLAN_SKILL_LEVELS as readonly string[]).includes(cap)) return cap as PlanSkillLevel;
  return null;
}

export function formatPlanSkillLabel(level: string | null | undefined): string {
  const p = parsePlanSkillLevel(level);
  return p ?? '';
}

export function getPlanSkillLevelColor(level: string | null | undefined): string {
  const p = parsePlanSkillLevel(level);
  switch (p) {
    case 'Beginner':
      return '#4CAF50';
    case 'Intermediate':
      return '#FFCF56';
    case 'Local Legend':
      return '#FF8C42';
    default:
      return '#999';
  }
}
