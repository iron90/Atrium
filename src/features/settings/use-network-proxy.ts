import { useCallback, useEffect, useState } from "react";
import {
  bridge,
  type LocalProxyCandidate,
  type NetworkProxySettings,
  type ProxyTestOutcome,
} from "../../bridge";

export interface NetworkProxyController {
  proxy: string;
  noProxy: string;
  testHost: string;
  setProxy: (value: string) => void;
  setNoProxy: (value: string) => void;
  setTestHost: (value: string) => void;
  save: () => void;
  phase: "loading" | "idle" | "saving" | "saved" | "error";
  error: string | null;
  detection: {
    phase: "idle" | "detecting" | "done" | "error";
    candidates: LocalProxyCandidate[];
    error: string | null;
    detect: () => void;
  };
  test: {
    phase: "idle" | "testing" | "done";
    outcome: ProxyTestOutcome | null;
    error: string | null;
    run: () => void;
  };
}

// The proxy is a host-level setting: Atrium writes it once here and hands it
// to every captured command as environment variables, so no project needs a
// hard-coded mirror. Saving is an explicit click rather than a keystroke
// handler, because a malformed address would otherwise block every command.
//
// Detection exists because the address is written down somewhere else: proxy
// clients already show it, so the user should never have to remember it.
export function useNetworkProxy(): NetworkProxyController {
  const [proxy, setProxy] = useState("");
  const [noProxy, setNoProxy] = useState("");
  const [testHost, setTestHost] = useState("");
  const [phase, setPhase] =
    useState<NetworkProxyController["phase"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<Omit<NetworkProxyController["test"], "run">>(
    { phase: "idle", outcome: null, error: null },
  );
  const [detection, setDetection] = useState<
    Omit<NetworkProxyController["detection"], "detect">
  >({ phase: "idle", candidates: [], error: null });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const settings: NetworkProxySettings = await bridge.readNetworkProxy();
        if (!active) return;
        setProxy(settings.proxy ?? "");
        setNoProxy(settings.noProxy ?? "");
        setTestHost(settings.testHost ?? "");
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
      .saveNetworkProxy({ proxy, noProxy, testHost })
      .then((settings) => {
        // The backend trims and normalizes, so the fields show what is
        // actually stored rather than the raw text that was typed.
        setProxy(settings.proxy ?? "");
        setNoProxy(settings.noProxy ?? "");
        setTestHost(settings.testHost ?? "");
        setPhase("saved");
        // A saved address answers a different question than the one asked
        // before saving, so an earlier verdict must not linger.
        setTest({ phase: "idle", outcome: null, error: null });
      })
      .catch((saveError: unknown) => {
        setError(messageOf(saveError));
        setPhase("error");
      });
  }, [proxy, noProxy, testHost]);

  const detect = useCallback(() => {
    setDetection((current) => ({
      ...current,
      phase: "detecting",
      error: null,
    }));
    void bridge
      .detectLocalProxies()
      .then((candidates) =>
        setDetection({ phase: "done", candidates, error: null }),
      )
      .catch((detectError: unknown) =>
        setDetection({
          phase: "error",
          candidates: [],
          error: messageOf(detectError),
        }),
      );
  }, []);

  const run = useCallback(() => {
    setTest((current) => ({ ...current, phase: "testing", error: null }));
    void bridge
      .testNetworkProxy({ proxy, noProxy, testHost })
      .then((outcome) => setTest({ phase: "done", outcome, error: null }))
      .catch((testError: unknown) =>
        setTest({
          phase: "done",
          outcome: null,
          error: messageOf(testError),
        }),
      );
  }, [proxy, noProxy, testHost]);

  return {
    proxy,
    noProxy,
    testHost,
    setProxy,
    setNoProxy,
    setTestHost,
    save,
    phase,
    error,
    detection: { ...detection, detect },
    test: { ...test, run },
  };
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
