// Which bugs this browser has opened, for the "NEW" badge. Per-viewer convenience only.
const key = (projectId: string) => `bugswarm:opened:${projectId}`;
const MAX_IDS = 5000;

export function readOpened(projectId: string): Set<number> {
  try {
    const raw = localStorage.getItem(key(projectId));
    return new Set(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

export function markOpened(projectId: string, bugId: number) {
  try {
    const ids = readOpened(projectId);
    if (ids.has(bugId)) return;
    ids.add(bugId);
    localStorage.setItem(key(projectId), JSON.stringify([...ids].slice(-MAX_IDS)));
  } catch {
    // storage unavailable (private mode): the badge just stays
  }
}
