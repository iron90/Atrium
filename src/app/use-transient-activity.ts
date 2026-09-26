import { useEffect } from "react";
import type { ActivityMessage } from "../shared/activity";

export const ACTIVITY_BANNER_TTL_MS = 4500;

// Status-banner messages used to be overwritten every ten seconds by the
// background poll; with silent polls they would otherwise stay forever.
// Result and acknowledgement messages self-clear, while in-progress
// indicators (scanning) persist until their result replaces them.
export const useTransientActivityMessage = (
  message: ActivityMessage | null,
  clear: () => void,
): void => {
  useEffect(() => {
    if (!message || message.type === "scanning") return undefined;
    const timer = window.setTimeout(clear, ACTIVITY_BANNER_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [message, clear]);
};
