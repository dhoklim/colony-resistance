export function scoreOptions(counts: readonly number[]): number[] {
  if (
    counts.length !== 4 ||
    counts.some((count) => !Number.isSafeInteger(count) || count < 0)
  ) {
    throw new RangeError("Four non-negative integer counts are required.");
  }
  const points = [5, 3, 1, 0];
  return counts.map(
    (count) => points[counts.filter((other) => other < count).length],
  );
}

function secureRandomIndex(max: number): number {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000)
    throw new RangeError("Invalid range.");
  const limit = 0x100000000 - (0x100000000 % max);
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return values[0] % max;
}

export function drawWinners(
  candidates: readonly { id: string; score: number }[],
  randomIndex = secureRandomIndex,
): string[] {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (
      !candidate.id ||
      ids.has(candidate.id) ||
      !Number.isInteger(candidate.score) ||
      candidate.score < 0 ||
      candidate.score > 50
    ) {
      throw new RangeError("Invalid or duplicate draw candidate.");
    }
    ids.add(candidate.id);
  }
  const ordered = [...candidates].sort((a, b) => b.score - a.score);
  const winners: string[] = [];
  while (ordered.length && winners.length < 2) {
    const score = ordered[0].score;
    const group = ordered.filter((candidate) => candidate.score === score);
    ordered.splice(0, group.length);
    const needed = 2 - winners.length;
    if (group.length <= needed) {
      winners.push(...group.map((candidate) => candidate.id));
    } else {
      for (let i = 0; i < needed; i++) {
        const selected = randomIndex(group.length);
        if (
          !Number.isInteger(selected) ||
          selected < 0 ||
          selected >= group.length
        )
          throw new RangeError("Invalid random index.");
        winners.push(group.splice(selected, 1)[0].id);
      }
    }
  }
  return winners;
}

export function escapeCsvCell(value: string): string {
  const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
