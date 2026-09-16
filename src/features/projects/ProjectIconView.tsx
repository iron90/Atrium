import type { ProjectSnapshot } from "../../bridge";

const glyphForProject = (name: string): string => {
  if (name.toLowerCase().includes("pipeline")) return "◈";
  if (name.toLowerCase().includes("note")) return "⌁";
  if (name.toLowerCase().includes("cutout")) return "✦";
  if (name.toLowerCase().includes("rhythm")) return "∿";
  if (name.toLowerCase().includes("website")) return "◎";
  return "◇";
};

export function ProjectIconView({
  project,
  variant,
}: {
  project: ProjectSnapshot;
  variant: "list" | "inspector";
}) {
  if (project.icon?.dataUrl) {
    return (
      <img
        className={`project-icon project-icon-${variant}`}
        src={project.icon.dataUrl}
        alt=""
        title={project.icon.source}
      />
    );
  }

  return (
    <span
      className={variant === "list" ? "project-glyph" : "inspector-glyph"}
      aria-hidden="true"
    >
      {glyphForProject(project.name)}
    </span>
  );
}
