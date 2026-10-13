import { useCallback, useEffect, useRef, useState } from "react";
import {
  bridge,
  type LocalProxyCandidate,
  type NetworkProxySettings,
  type ProxyTestOutcome,
} from "../../bridge";
import { PROXY_TEST_TARGETS } from "../projects/proxy-test-targets";

export interface NetworkProxyController {
  proxy: string;
  noProxy: string;
  testHost: string;
  setProxy: (value: string) => void;
  setNoProxy: (value: string) => void;
  setTestHost: (value: string) => void;
  savePhase: "loading" | "idle" | "saving" | "saved" | "error";
  error: string | null;
  detection: {
    phase: "idle" | "detecting" | "done" | "error";
    candidates: LocalProxyCandidate[];
    error: string | null;
    detect: () => void;
  };
  sweep: {
    phase: "idle" | "running";
    running: Record<string, boolean>;
    outcomes: Record<string, ProxyTestOutcome | undefined>;
    errors: Record<string, string | undefined>;
    checkAll: () => void;
    checkHost: (host: string) => void;
  };
}

// The proxy is a host-level setting: Atrium hands it to every captured command
// as environment variables, so no project needs a hard-coded mirror. It is
// stored as it is typed — clearing the field is how the user turns the proxy
// off, which is the same gesture as turning it on.
//
// Typing produces half-finished values, so persistence waits for a pause and
// then only happens when the value is already well formed. Without that gate
// every keystroke would race the backend and the field would fill with errors
// while a perfectly good address was being typed.
const SETTLE_MS = 500;

const scheme = /^(https?|socks5|socks5h|socks4):\/\/[^\s]+$/;
const bareHost = /^[^\s/:@?#[\]]+$/;

/** Whether the field contents can be persisted as they stand. */
export const isSettable = (proxy: string, testHost: string): boolean => {
  const address = proxy.trim();
  if (address && !scheme.test(address)) return false;
  const host = testHost.trim();
  if (host && !bareHost.test(host)) return false;
  return true;
};

export function useNetworkProxy(): NetworkProxyController {
  // What the backend holds, so opening the card without changing anything
  // does not rewrite the settings file.
  const loaded = useRef({ proxy: "", noProxy: "", testHost: "" });
  const [proxy, setProxy] = useState("");
  const [noProxy, setNoProxy] = useState("");
  const [testHost, setTestHost] = useState("");
  const [savePhase, setSavePhase] =
    useState<NetworkProxyController["savePhase"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sweep, setSweep] = useState<
    Omit<NetworkProxyController["sweep"], "checkAll" | "checkHost">
  >({ phase: "idle", running: {}, outcomes: {}, errors: {} });
  const sweepOutcomes = useRef<Record<string, unknown>>({});
  const resetSweep = () => {
    sweepOutcomes.current = {};
    setSweep({ phase: "idle", running: {}, outcomes: {}, errors: {} });
  };
  const [detection, setDetection] = useState<
    Omit<NetworkProxyController["detection"], "detect">
  >({ phase: "idle", candidates: [], error: null });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const settings: NetworkProxySettings = await bridge.readNetworkProxy();
        if (!active) return;
        // Typing before the saved settings arrive must survive them. The
        // check runs inside the updater so it reads the value as it is now,
        // not the one captured when the effect was created.
        const keepUserEdit = (current: string, loaded: string) =>
          current || loaded;
        setProxy((current) => keepUserEdit(current, settings.proxy ?? ""));
        setNoProxy((current) => keepUserEdit(current, settings.noProxy ?? ""));
        setTestHost((current) =>
          keepUserEdit(current, settings.testHost ?? ""),
        );
        loaded.current = {
          proxy: settings.proxy ?? "",
          noProxy: settings.noProxy ?? "",
          testHost: settings.testHost ?? "",
        };
        setSavePhase("idle");
      } catch (loadError) {
        if (!active) return;
        setError(messageOf(loadError));
        setSavePhase("error");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (savePhase === "loading") return;
    if (!isSettable(proxy, testHost)) return;
    const current = { proxy, noProxy, testHost };
    if (
      current.proxy === loaded.current.proxy &&
      current.noProxy === loaded.current.noProxy &&
      current.testHost === loaded.current.testHost
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setSavePhase("saving");
      void bridge
        .saveNetworkProxy({ proxy, noProxy, testHost })
        .then((settings) => {
          // The backend trims and normalizes, so the fields show what is
          // actually stored rather than the raw text that was typed.
          setProxy(settings.proxy ?? "");
          setNoProxy(settings.noProxy ?? "");
          setTestHost(settings.testHost ?? "");
          // An earlier report was measured against a different address and
          // must not outlive it.
          if (
            (settings.proxy ?? "") !== loaded.current.proxy &&
            Object.keys(sweepOutcomes.current).length > 0
          ) {
            resetSweep();
          }
          loaded.current = {
            proxy: settings.proxy ?? "",
            noProxy: settings.noProxy ?? "",
            testHost: settings.testHost ?? "",
          };
          setError(null);
          setSavePhase("saved");
        })
        .catch((saveError: unknown) => {
          // Nothing is stored, so the previous proxy keeps working and the
          // user's text stays in the field for them to correct.
          setError(messageOf(saveError));
          setSavePhase("error");
        });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [proxy, noProxy, testHost, savePhase]);

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

  // Probed together rather than one after another: six hosts in sequence at
  // three seconds each would make the card unusable, and a slow host says
  // nothing about the fast ones.
  const checkAll = useCallback(() => {
    setSweep((current) => ({ ...current, phase: "running" }));
    const hosts = [
      ...PROXY_TEST_TARGETS.map((target) => target.host),
      // The address the user typed belongs in the same report; probing it
      // separately behind a second button is what made this card confusing.
      testHost.trim().toLowerCase(),
    ].filter(
      (host, index, all) => host.length > 0 && all.indexOf(host) === index,
    );
    void Promise.all(
      hosts.map(async (host) => {
        try {
          const outcome = await bridge.testNetworkProxy({
            proxy,
            noProxy,
            testHost: host,
          });
          return { host, outcome };
        } catch (error) {
          return { host, error: messageOf(error) };
        }
      }),
    ).then((results) => {
      sweepOutcomes.current = Object.fromEntries(
        results.flatMap((result) => ["outcome" in result ? [result.host] : []]),
      );
      setSweep((current) => ({
        phase: "idle",
        running: {},
        outcomes: {
          ...current.outcomes,
          ...Object.fromEntries(
            results.flatMap((result) =>
              "outcome" in result ? [[result.host, result.outcome]] : [],
            ),
          ),
        },
        errors: {
          ...current.errors,
          ...Object.fromEntries(
            results.flatMap((result) =>
              "error" in result ? [[result.host, result.error]] : [],
            ),
          ),
        },
      }));
    });
  }, [proxy, noProxy, testHost]);

  // Each row answers its own question. Routing this through a hidden field
  // meant pressing a button next to a host had no visible effect at all.
  const checkHost = useCallback(
    (host: string) => {
      setSweep((current) => ({
        ...current,
        running: { ...current.running, [host]: true },
        errors: { ...current.errors, [host]: undefined },
      }));
      void bridge
        .testNetworkProxy({ proxy, noProxy, testHost: host })
        .then((outcome) => {
          sweepOutcomes.current = { ...sweepOutcomes.current, [host]: outcome };
          setSweep((current) => ({
            ...current,
            running: { ...current.running, [host]: false },
            outcomes: { ...current.outcomes, [host]: outcome },
          }));
        })
        .catch((error: unknown) => {
          setSweep((current) => ({
            ...current,
            running: { ...current.running, [host]: false },
            errors: { ...current.errors, [host]: messageOf(error) },
          }));
        });
    },
    [proxy, noProxy],
  );

  return {
    proxy,
    noProxy,
    testHost,
    setProxy,
    setNoProxy,
    setTestHost,
    savePhase,
    error,
    detection: { ...detection, detect },
    sweep: { ...sweep, checkAll, checkHost },
  };
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
