/** Sort plan steps by ordinal for the feature stepper. */
export function sortStepsByOrdinal<T extends { ordinal: number }>(steps: T[]): T[] {
  return [...steps].sort((a, b) => a.ordinal - b.ordinal);
}

/** Activity feed: optional kind filter, newest-first. */
export function filterAndReverseActivity<T extends { kind: string }>(
  activity: T[],
  kindFilter: string
): T[] {
  const filtered =
    kindFilter === "all" ? [...activity] : activity.filter((a) => a.kind === kindFilter);
  return filtered.reverse();
}
