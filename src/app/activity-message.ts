import type { Language } from "../i18n";
import { translate } from "../i18n";
import { fill } from "../shared/format";
import type { ActivityMessage } from "../shared/activity";

export type { ActivityMessage } from "../shared/activity";

export const formatActivityMessage = (
  message: ActivityMessage,
  language: Language,
): string => {
  switch (message.type) {
    case "projects":
      return fill(
        translate(language, "projectsDiscovered"),
        "count",
        String(message.count),
      );
    case "workspaceUpdated":
      return fill(
        translate(language, "workspaceUpdated"),
        "count",
        String(message.count),
      );
    case "projectRefreshed":
      return translate(language, "projectRefreshed");
    case "scanning":
      return translate(language, "scanningWorkspace");
    case "cancelled":
      return translate(language, "runCancellationRequested");
    case "demo":
      return `${message.displayCommand} · ${translate(language, "succeeded")}`;
    case "finished":
      return `${message.displayCommand} · ${translate(language, message.status)}`;
  }
};
