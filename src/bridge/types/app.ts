export interface AppUpdateInfo {
  version: string;
  notes: string;
  date: string;
}

// A host-level network path, not a project fact: Atrium resolves it once and
// hands it to every captured command as environment variables.
export interface NetworkProxySettings {
  proxy?: string | null;
  noProxy?: string | null;
}
