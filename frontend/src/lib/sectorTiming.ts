import { timeAtDist } from "@/lib/playback";
import type { Sector } from "@/lib/types";

type TimedSeries = Parameters<typeof timeAtDist>[0];

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

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    start < dist[0] ||
    end > dist[dist.length - 1]
  ) {
    return null;
  }

  const startTime = timeAtDist(series!, start);
  const endTime = timeAtDist(series!, end);

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
