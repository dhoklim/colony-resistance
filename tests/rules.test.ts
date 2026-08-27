import assert from "node:assert/strict";
import { test } from "node:test";
import { drawWinners, escapeCsvCell, scoreOptions } from "../app/lib/rules.ts";

test("fewer votes earn more points without using rounded percentages", () => {
  assert.deepEqual(scoreOptions([20, 10, 5, 1]), [0, 1, 3, 5]);
});
test("equal counts share a competition rank and skip occupied positions", () => {
  assert.deepEqual(scoreOptions([5, 5, 10, 20]), [5, 5, 1, 0]);
  assert.deepEqual(scoreOptions([10, 10, 10, 10]), [5, 5, 5, 5]);
});
test("zero-vote options prevent unanimous choices from earning minority points", () => {
  assert.deepEqual(scoreOptions([0, 0, 0, 20]), [5, 5, 5, 0]);
});
test("invalid counts cannot produce scores", () => {
  for (const counts of [
    [-1, 0, 0, 0],
    [NaN, 0, 0, 0],
    [1.5, 0, 0, 0],
    [1, 2, 3],
  ]) {
    assert.throws(() => scoreOptions(counts));
  }
});
test("two winners are drawn only from the highest scoring tie when it has enough people", () => {
  assert.deepEqual(
    drawWinners(
      [
        { id: "a", score: 40 },
        { id: "b", score: 40 },
        { id: "c", score: 40 },
        { id: "d", score: 39 },
      ],
      () => 0,
    ),
    ["a", "b"],
  );
});
test("a sole highest scorer wins with one randomly chosen runner-up", () => {
  assert.deepEqual(
    drawWinners(
      [
        { id: "b", score: 40 },
        { id: "a", score: 50 },
        { id: "c", score: 40 },
      ],
      () => 1,
    ),
    ["a", "c"],
  );
});
test("drawing from too few entrants never invents or duplicates winners", () => {
  assert.deepEqual(drawWinners([]), []);
  assert.deepEqual(drawWinners([{ id: "a", score: 0 }]), ["a"]);
  assert.throws(() =>
    drawWinners([
      { id: "a", score: 1 },
      { id: "a", score: 2 },
    ]),
  );
});
test("CSV exports neutralize formulas and preserve quotes and newlines", () => {
  assert.equal(escapeCsvCell("=SUM(A1)"), '"\'=SUM(A1)"');
  assert.equal(escapeCsvCell("  @SUM(A1)"), '"\'  @SUM(A1)"');
  assert.equal(escapeCsvCell('a"b\nc'), '"a""b\nc"');
});
