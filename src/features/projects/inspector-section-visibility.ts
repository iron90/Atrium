// Detail-card sections a user can hide from the settings page. Stored as the
// list of hidden ids in local preferences; anything unlisted stays visible.
export const INSPECTOR_SECTION_IDS = [
  "storage",
  "buildProfiles",
  "rawRepositoryCommands",
  "runHistory",
  "recentCommits",
] as const;

export type InspectorSectionId = (typeof INSPECTOR_SECTION_IDS)[number];

export const isInspectorSectionId = (
  value: unknown,
): value is InspectorSectionId =>
  (INSPECTOR_SECTION_IDS as readonly string[]).includes(value as string);
