import { useCallback, useEffect, useState } from "react";
import { bridge, type NetworkProxySettings } from "../../bridge";

export interface NetworkProxyController {
  proxy: string;
  noProxy: string;
  setProxy: (value: string) => void;
  setNoProxy: (value: string) => void;
  save: () => void;
  phase: "loading" | "idle" | "saving" | "saved" | "error";
  error: string | null;
}

// The proxy is a host-level setting: Atrium writes it once here and hands it
// to every captured command as environment variables, so no project needs a
// hard-coded mirror. Saving is an explicit click rather than a keystroke
// handler, because a malformed address would otherwise block every command.
export function useNetworkProxy(): NetworkProxyController {
  const [proxy, setProxy] = useState("");
  const [noProxy, setNoProxy] = useState("");
  const [phase, setPhase] =
    useState<NetworkProxyController["phase"]>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const settings: NetworkProxySettings = await bridge.readNetworkProxy();
        if (!active) return;
        setProxy(settings.proxy ?? "");
        setNoProxy(settings.noProxy ?? "");
        setPhase("idle");
      } catch (loadError) {
        if (!active) return;
        setError(messageOf(loadError));
        setPhase("error");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(() => {
    setPhase("saving");
    setError(null);
    void bridge
      .saveNetworkProxy({ proxy, noProxy })
      .then((settings) => {
        // The backend trims and normalizes, so the fields show what is
        // actually stored rather than the raw text that was typed.
        setProxy(settings.proxy ?? "");
        setNoProxy(settings.noProxy ?? "");
        setPhase("saved");
      })
      .catch((saveError: unknown) => {
        setError(messageOf(saveError));
        setPhase("error");
      });
  }, [proxy, noProxy]);

  return { proxy, noProxy, setProxy, setNoProxy, save, phase, error };
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
