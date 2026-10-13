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
  testHost?: string | null;
}

// A local endpoint the probe found on this machine. `kind` records what the
// probe observed, so an unrelated listener is never presented as a proxy.
export type LocalProxyKind = "http" | "socks5" | "listener";

export interface LocalProxyCandidate {
  url: string;
  kind: LocalProxyKind;
}

// The answer to "did my command actually get through", which a handshake
// probe cannot give. `status` is the proxy's own status code when it refused.
export type ProxyTestOutcome =
  | { kind: "inherited" }
  | { kind: "tunnelled"; latencyMillis: number | null }
  | { kind: "refused"; status: number }
  | { kind: "notAProxy" }
  | { kind: "timeout" }
  | { kind: "unreachable" }
  | { kind: "unsupportedScheme" };
