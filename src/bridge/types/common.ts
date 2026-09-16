export type FacetSource = "detected" | "configured";
export type CommandKind = "run" | "check" | "build" | "other";
export type ProfileAction = Exclude<CommandKind, "other">;
export type ProjectConfigurationStatus = "configured" | "missing" | "invalid";

export interface Facet {
  key: string;
  label: string;
  source: FacetSource;
  evidence: string[];
}
