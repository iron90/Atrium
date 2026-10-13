import { invoke } from "@tauri-apps/api/core";
import type {
  LocalProxyCandidate,
  NetworkProxySettings,
  ProxyTestOutcome,
} from "./types";

export const EMPTY_NETWORK_PROXY: NetworkProxySettings = {};

export const nativeSettingsMethods = {
  readNetworkProxy: async (): Promise<NetworkProxySettings> =>
    invoke<NetworkProxySettings>("read_network_proxy_command"),

  detectLocalProxies: async (): Promise<LocalProxyCandidate[]> =>
    invoke<LocalProxyCandidate[]>("detect_local_proxies_command"),

  testNetworkProxy: async (
    settings: NetworkProxySettings,
  ): Promise<ProxyTestOutcome> =>
    invoke<ProxyTestOutcome>("test_network_proxy_command", { settings }),

  saveNetworkProxy: async (
    settings: NetworkProxySettings,
  ): Promise<NetworkProxySettings> =>
    invoke<NetworkProxySettings>("save_network_proxy_command", { settings }),
};

export const previewSettingsMethods = {
  // The demo runtime has no child processes, so it keeps the same empty shape
  // the native backend returns when nothing has been configured.
  readNetworkProxy: async (): Promise<NetworkProxySettings> => ({
    ...EMPTY_NETWORK_PROXY,
  }),
  // Nothing is probed in the browser preview; saying so is better than
  // inventing endpoints that do not exist here.
  detectLocalProxies: async (): Promise<LocalProxyCandidate[]> => [],
  testNetworkProxy: async (): Promise<ProxyTestOutcome> => ({
    kind: "inherited",
  }),
  saveNetworkProxy: async (
    settings: NetworkProxySettings,
  ): Promise<NetworkProxySettings> => ({ ...EMPTY_NETWORK_PROXY, ...settings }),
};
