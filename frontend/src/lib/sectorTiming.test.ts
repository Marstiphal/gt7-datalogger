import { describe, expect, it } from "vitest";
import { timeAtDist } from "./playback";
import {
  compareSectorTimes,
  sectorDurationMs,
  timeSectors,
  type TimedLap,
} from "./sectorTiming";
import type { Sector } from "./types";

type Series = Parameters<typeof timeAtDist>[0];

const lap = (
  times: number[],
  timeMs: number | null = null,
  dist = [0, 100, 200, 300],
): TimedLap => ({ series: { dist, t: times } as Series, timeMs });

const sector: Sector = {
  n: 2,
  name: "Sector 2",
  start_dist: 100,
  end_dist: 200,
  authored: true,
};

const reference = lap([0, 10, 20, 30]);

// A lap whose distance grid ends at `last`.
const lapEndingAt = (
  last: number,
  times = [0, 10, 20, 30],
  timeMs: number | null = null,
): TimedLap => lap(times, timeMs, [0, 100, 200, last]);

const firstSector: Sector = {
  n: 1,
  name: "Sector 1",
  start_dist: 0,
  end_dist: 100,
  authored: true,
};

const finalSector: Sector = {
  n: 3,
  name: "Sector 3",
  start_dist: 200,
  end_dist: 300.1,
  authored: true,
};

const toLine = { start: false, finish: true };

describe("sectorDurationMs", () => {
  it("calculates the time between sector boundaries", () => {
    expect(sectorDurationMs(sector, reference)).toBe(10_000);
  });

  it("interpolates boundaries between recorded samples", () => {
    const partial = {
      ...sector,
      start_dist: 150,
      end_dist: 250,
    };

    expect(sectorDurationMs(partial, reference)).toBe(10_000);
  });

  it("returns null for missing or incomplete telemetry", () => {
    expect(sectorDurationMs(sector, null)).toBeNull();
    expect(sectorDurationMs(sector, lap([], null, []))).toBeNull();
    expect(sectorDurationMs(sector, lap([0, 10]))).toBeNull();
  });

  it("rejects boundaries outside the recorded distance", () => {
    expect(
      sectorDurationMs({ ...sector, end_dist: 400 }, reference),
    ).toBeNull();

    expect(
      sectorDurationMs({ ...sector, start_dist: 200 }, reference),
    ).toBeNull();
  });

  it("rejects zero-duration sectors", () => {
    expect(
      sectorDurationMs(sector, lap([0, 10, 10, 30])),
    ).toBeNull();
  });

  it("accepts a final boundary rounded past the lap's last sample", () => {
    // The grid ends at 300.06 m; the boundary, rounded to 0.1 m, at 300.1 m.
    expect(sectorDurationMs(finalSector, lapEndingAt(300.06))).toBe(10_000);
    // 0.05 m is as far apart as the two roundings can put them.
    expect(sectorDurationMs(finalSector, lapEndingAt(300.05))).toBe(10_000);
    // The same at the start of the lap.
    expect(
      sectorDurationMs(firstSector, lap([0, 10, 20, 30], null, [0.04, 100, 200, 300])),
    ).toBe(10_000);
  });

  it("rejects telemetry that stops short by more than the rounding", () => {
    expect(sectorDurationMs(finalSector, lapEndingAt(300.04))).toBeNull();
    expect(sectorDurationMs(finalSector, lapEndingAt(299))).toBeNull();
    expect(
      sectorDurationMs(firstSector, lap([0, 10, 20, 30], null, [0.1, 100, 200, 300])),
    ).toBeNull();
  });
});

describe("compareSectorTimes", () => {
  it("reports a positive delta when the comparison is slower", () => {
    const result = compareSectorTimes(
      sector,
      reference,
      lap([0, 10, 21.25, 32]),
    );

    expect(result.referenceMs).toBe(10_000);
    expect(result.selectedMs).toBe(11_250);
    expect(result.deltaMs).toBe(1_250);
    expect(result.approximate).toBe(false);
  });

  it("reports a negative delta when the comparison is faster", () => {
    const result = compareSectorTimes(
      sector,
      reference,
      lap([0, 10, 19.5, 29]),
    );

    expect(result.deltaMs).toBe(-500);
  });

  it("shows the reference duration when no comparison is selected", () => {
    const result = compareSectorTimes(sector, reference, null);

    expect(result.selectedMs).toBe(10_000);
    expect(result.referenceMs).toBe(10_000);
    expect(result.deltaMs).toBeNull();
  });

  it("does not compare laps that could not be aligned", () => {
    const result = compareSectorTimes(
      sector,
      reference,
      lap([0, 10, 22, 34]),
      false,
    );

    expect(result.referenceMs).toBe(10_000);
    expect(result.selectedMs).toBeNull();
    expect(result.deltaMs).toBeNull();
  });

  it("identifies fallback thirds as approximate", () => {
    const result = compareSectorTimes(
      { ...sector, authored: false },
      reference,
      lap([0, 10, 21, 31]),
    );

    expect(result.approximate).toBe(true);
    expect(result.selectedMs).toBe(11_000);
    expect(result.deltaMs).toBe(1_000);
  });

  it("keeps the final sector's time and delta on complete laps", () => {
    const result = compareSectorTimes(
      finalSector,
      lapEndingAt(300.06, [0, 10, 20, 29.99], 30_000),
      lapEndingAt(300.08, [0, 10, 20, 31.49], 31_500),
      true,
      toLine,
    );

    expect(result.referenceMs).toBe(10_000);
    expect(result.selectedMs).toBe(11_500);
    expect(result.deltaMs).toBe(1_500);
  });

  it("gives no final-sector delta when the compared lap stops short", () => {
    const result = compareSectorTimes(
      finalSector,
      lapEndingAt(300.06, [0, 10, 20, 29.99], 30_000),
      lapEndingAt(299, [0, 10, 20, 31.49], 31_500),
      true,
      toLine,
    );

    expect(result.referenceMs).toBe(10_000);
    expect(result.selectedMs).toBeNull();
    expect(result.deltaMs).toBeNull();
  });
});

describe("timeSectors", () => {
  const thirds: Sector[] = [1, 2, 3].map((n) => ({
    n,
    name: "",
    start_dist: (n - 1) * 100,
    end_dist: n * 100,
    authored: false,
  }));

  // A 90 s lap whose first and last samples fall half a frame inside it.
  const sampled = lap([0.0083, 25, 55, 89.9917], 90_000);

  it("runs the lap's clock from 0 at the start to the lap time at the finish", () => {
    const timings = timeSectors(thirds, sampled, null);
    const times = [1, 2, 3].map((n) => timings[n].selectedMs);

    // The boundaries inside the lap are still interpolated.
    expect(times).toEqual([25_000, 30_000, 35_000]);
    expect(times.reduce((sum, ms) => sum! + ms!, 0)).toBe(90_000);
  });

  it("gives no delta between laps whose samples fell differently", () => {
    // The same lap, sampled a frame later against the line at both ends.
    const other = lap([0.0166, 25, 55, 89.9834], 90_000);
    const timings = timeSectors(thirds, sampled, other);

    expect([1, 2, 3].map((n) => timings[n].deltaMs)).toEqual([0, 0, 0]);
  });

  it("leaves the last sector untimed without a lap time", () => {
    const timings = timeSectors(thirds, lap([0.0083, 25, 55, 89.9917]), null);

    expect(timings[1].selectedMs).toBe(25_000);
    expect(timings[2].selectedMs).toBe(30_000);
    expect(timings[3].selectedMs).toBeNull();
  });
});
