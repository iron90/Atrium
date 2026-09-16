export type DropPosition = "before" | "after";

export function reorderProjectIds(
  currentIds: string[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): string[] {
  if (draggedId === targetId || !currentIds.includes(targetId)) {
    return currentIds;
  }

  const nextIds = currentIds.filter((projectId) => projectId !== draggedId);
  let insertionIndex = nextIds.indexOf(targetId);
  if (insertionIndex < 0) return currentIds;
  if (position === "after") insertionIndex += 1;
  nextIds.splice(insertionIndex, 0, draggedId);
  return nextIds;
}

export function orderChanged(
  originalIds: string[],
  nextIds: string[],
): boolean {
  return (
    originalIds.length !== nextIds.length ||
    nextIds.some((projectId, index) => projectId !== originalIds[index])
  );
}
