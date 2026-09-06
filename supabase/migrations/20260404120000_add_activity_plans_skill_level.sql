-- Skill level for plans (Beginner / Intermediate / Advanced). Null = legacy rows before this column existed.
ALTER TABLE activity_plans
  ADD COLUMN IF NOT EXISTS skill_level text;

COMMENT ON COLUMN activity_plans.skill_level IS 'Beginner | Intermediate | Advanced; null for legacy plans.';
