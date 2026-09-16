import type { Language } from "../i18n";
import { translate } from "../i18n";
import type { WorkspaceMessage } from "../features/projects/use-project-workspace";
import type { RunMessage } from "../features/runs/use-project-runner";
import { fill } from "../shared/format";

export type ActivityMessage = RunMessage | WorkspaceMessage;

export const formatActivityMessage = (
  message: ActivityMessage,
  language: Language,
): string => {
  switch (message.type) {
    case "ready":
      return translate(language, "readyMessage");
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
    case "localized":
      return translate(language, message.key);
    case "projectRefreshed":
      return translate(language, "projectRefreshed");
    case "refreshingWorkspace":
      return translate(language, "refreshingWorkspace");
    case "scanning":
      return translate(language, "scanningWorkspace");
    case "cancelled":
      return translate(language, "runCancellationRequested");
    case "command": {
      const label =
        message.commandKind === "run"
          ? translate(language, "run")
          : message.commandKind === "check"
            ? translate(language, "check")
            : message.commandKind === "build"
              ? translate(language, "build")
              : message.label;
      return `${label} · ${message.displayCommand}`;
    }
    case "demo":
      return `${message.displayCommand} · ${translate(language, "succeeded")}`;
    case "finished":
      return `${message.displayCommand} · ${translate(language, message.status)}`;
  }
};
