// Hosts that project builds actually download from. The list is a set of
// test targets, not a set of recommended mirrors: nothing is routed here by
// Atrium, no credentials are sent, and a failure names the host that failed
// rather than a verdict on the proxy.
//
// A rule-based proxy can send one of these around the tunnel and block it
// while everything else works, which is exactly why one number is not enough.
import type { TranslationKey } from "../../i18n";

export interface ProxyTestTarget {
  id: string;
  host: string;
  labelKey: TranslationKey;
}

export const PROXY_TEST_TARGETS: readonly ProxyTestTarget[] = [
  {
    id: "gstatic",
    host: "www.gstatic.com",
    labelKey: "proxyTargetGstatic",
  },
  {
    id: "github",
    host: "github.com",
    labelKey: "proxyTargetGithub",
  },
  {
    // The address releases are actually downloaded from, which is the host
    // that broke for a project pulling a standalone runtime.
    id: "github-releases",
    host: "objects.githubusercontent.com",
    labelKey: "proxyTargetGithubReleases",
  },
  {
    id: "npm",
    host: "registry.npmjs.org",
    labelKey: "proxyTargetNpm",
  },
  {
    id: "crates",
    host: "static.crates.io",
    labelKey: "proxyTargetCrates",
  },
  {
    id: "pypi",
    host: "files.pythonhosted.org",
    labelKey: "proxyTargetPypi",
  },
] as const;
