import { invoke } from "@tauri-apps/api/core";
import type { NetworkProxySettings } from "./types";

export const EMPTY_NETWORK_PROXY: NetworkProxySettings = {};

export const nativeSettingsMethods = {
  readNetworkProxy: async (): Promise<NetworkProxySettings> =>
    invoke<NetworkProxySettings>("read_network_proxy_command"),

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
  saveNetworkProxy: async (
    settings: NetworkProxySettings,
  ): Promise<NetworkProxySettings> => ({ ...EMPTY_NETWORK_PROXY, ...settings }),
};
