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

/** Time spent between two sector boundaries, using the lap's own clock. */
export function sectorDurationMs(
  sector: Sector,
  series: TimedSeries | null | undefined,
): number | null {
  const dist = series?.dist;
  const time = series?.t;

  if (!dist || !time || dist.length < 2 || time.length !== dist.length) {
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
  const startTime = timeAtDist(series!, Math.max(start, first));
  const endTime = timeAtDist(series!, Math.min(end, last));

  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime <= startTime
  ) {
    return null;
  }

  return Math.round((endTime - startTime) * 1000);
}

/** Compare the same sector on aligned reference and focused laps. */
export function compareSectorTimes(
  sector: Sector,
  reference: TimedSeries | null | undefined,
  selected: TimedSeries | null | undefined,
  aligned = true,
): SectorTiming {
  const referenceMs = sectorDurationMs(sector, reference);

  const selectedMs =
    selected == null
      ? referenceMs
      : aligned
        ? sectorDurationMs(sector, selected)
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
