import { timeAtDist } from "@/lib/playback";
import type { Sector } from "@/lib/types";

type TimedSeries = Parameters<typeof timeAtDist>[0];

// Sector boundaries arrive rounded to 0.1 m and the series' distances to
// 0.01 m, so a complete lap's line can sit up to 0.05 m past its last sample
// (a lap ending at 300.06 m has its final boundary at 300.1 m). That much is
// rounding; a boundary any further out is telemetry that stops short of it.
// The extra millimetre absorbs float error in the comparison.
const BOUNDARY_ROUNDING_M = 0.051;

export interface SectorTiming {
  /** Duration for the reference lap, in milliseconds. */
  referenceMs: number | null;
  /** Duration for the focused comparison lap, or the reference if alone. */
  selectedMs: number | null;
  /** Positive means slower than reference; negative means faster. */
  deltaMs: number | null;
  /** Fallback distance thirds are not official circuit sectors. */
  approximate: boolean;
}

/** A lap as sector timing reads it. */
export interface TimedLap {
  /** The distance series, with the lap's own clock in `t` (seconds). */
  series: TimedSeries;
  /** The lap time GT7 reported, in milliseconds: the clock at the finish. */
  timeMs: number | null | undefined;
}

/** Which ends of a sector lie on the start/finish line. */
export interface LineEnds {
  /** The first sector: its clock starts at 0, the moment the lap began. */
  start: boolean;
  /** The last sector: its clock stops at the reported lap time. */
  finish: boolean;
}

const INSIDE_LAP: LineEnds = { start: false, finish: false };

/** Time spent between two sector boundaries, using the lap's own clock.
 *
 *  The clock is anchored on the line (t = 0 is the crossing), but the
 *  series' first and last samples fall up to a frame inside the lap, and
 *  further where packets were dropped: read there, the first and last
 *  sectors come up short and two laps differ by where their samples fell.
 *  A boundary on the line reads 0 at the start and the lap time at the
 *  finish instead, as processing.sectors.splits_ms does; only the
 *  boundaries inside the lap are interpolated. */
export function sectorDurationMs(
  sector: Sector,
  lap: TimedLap | null | undefined,
  line: LineEnds = INSIDE_LAP,
): number | null {
  const series = lap?.series;
  const dist = series?.dist;
  const time = series?.t;

  if (
    !lap ||
    !series ||
    !dist ||
    !time ||
    dist.length < 2 ||
    time.length !== dist.length
  ) {
    return null;
  }

  const start = sector.start_dist;
  const end = sector.end_dist;
  const first = dist[0];
  const last = dist[dist.length - 1];

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    start < first - BOUNDARY_ROUNDING_M ||
    end > last + BOUNDARY_ROUNDING_M
  ) {
    return null;
  }

  // A boundary inside the rounding margin is read at the recorded end.
  const startMs = line.start
    ? 0
    : timeAtDist(series, Math.max(start, first)) * 1000;
  // Without a lap time there is no clock at the finish to read.
  const endMs = line.finish
    ? lap.timeMs
    : timeAtDist(series, Math.min(end, last)) * 1000;

  if (
    endMs == null ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return null;
  }

  return Math.round(endMs - startMs);
}

/** Compare the same sector on aligned reference and focused laps. */
export function compareSectorTimes(
  sector: Sector,
  reference: TimedLap | null | undefined,
  selected: TimedLap | null | undefined,
  aligned = true,
  line: LineEnds = INSIDE_LAP,
): SectorTiming {
  const referenceMs = sectorDurationMs(sector, reference, line);

  const selectedMs =
    selected == null
      ? referenceMs
      : aligned
        ? sectorDurationMs(sector, selected, line)
        : null;

  const deltaMs =
    selected != null &&
    aligned &&
    referenceMs != null &&
    selectedMs != null
      ? selectedMs - referenceMs
      : null;

  return {
    referenceMs,
    selectedMs,
    deltaMs,
    approximate: !sector.authored,
  };
}

/** Every sector of the lap compared, keyed by sector number. The sectors
 *  run in order from the line to the line: the first starts on it and the
 *  last ends on it. */
export function timeSectors(
  sectors: Sector[],
  reference: TimedLap | null | undefined,
  selected: TimedLap | null | undefined,
  aligned = true,
): Record<number, SectorTiming> {
  return Object.fromEntries(
    sectors.map((sector, i) => [
      sector.n,
      compareSectorTimes(sector, reference, selected, aligned, {
        start: i === 0,
        finish: i === sectors.length - 1,
      }),
    ]),
  );
}
