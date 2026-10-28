import { sectorBests } from "./sectorTimes";
import type { SectorTimes } from "./types";

export interface SectorComparisonRow {
  n: number;
  name: string;
  referenceMs: number | null;
  bestMs: number | null;
  /** Best sector minus reference sector. Negative means faster. */
  deltaMs: number | null;
}

export interface SectorComparisonSummary {
  referenceLapNumber: number;
  referenceLapMs: number;
  sectors: SectorComparisonRow[];
  theoreticalBestMs: number | null;
  /** Theoretical best minus the reference's full lap time. */
  theoreticalDeltaMs: number | null;
}

function validTime(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/**
 * Compare the selected reference with the best eligible sectors in its session.
 *
 * The API data belongs to one session. A guest reference from another session
 * is deliberately not substituted with the session's automatic reference.
 */
export function sectorComparison(
  data: SectorTimes,
  referenceLapId: number | null,
): SectorComparisonSummary | null {
  if (referenceLapId == null || data.sectors.length === 0) return null;

  const reference = data.laps.find((lap) => lap.id === referenceLapId);
  if (!reference) return null;

  const referenceLapMs = validTime(reference.time_ms);
  if (referenceLapMs == null) return null;

  const bests = sectorBests(data.laps, data.sectors.length);

  const sectors = data.sectors.map((sector, index): SectorComparisonRow => {
    const referenceMs = validTime(reference.splits_ms?.[index]);
    const bestMs = validTime(bests.splits[index]);

    return {
      n: sector.n,
      name: sector.name,
      referenceMs,
      bestMs,
      deltaMs:
        referenceMs != null && bestMs != null
          ? bestMs - referenceMs
          : null,
    };
  });

  const theoreticalBestMs = sectors.every((sector) => sector.bestMs != null)
    ? sectors.reduce((total, sector) => total + sector.bestMs!, 0)
    : null;

  return {
    referenceLapNumber: reference.number,
    referenceLapMs,
    sectors,
    theoreticalBestMs,
    theoreticalDeltaMs:
      theoreticalBestMs == null
        ? null
        : theoreticalBestMs - referenceLapMs,
  };
}
