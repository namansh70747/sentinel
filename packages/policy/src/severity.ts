import type { Severity, SliWindows } from "@sentinel/contracts";

function burn(good: number, total: number, slo: number): number {
  if (total <= 0) return 0;
  const errorRatio = 1 - good / total;
  const budget = 1 - slo;
  if (budget <= 0) return Number.POSITIVE_INFINITY;
  return errorRatio / budget;
}

export function severity(sample: SliWindows): Severity {
  const fastShort = burn(sample.good5m, sample.total5m, sample.availabilitySlo);
  const fastLong = burn(sample.good1h, sample.total1h, sample.availabilitySlo);
  const slowShort = burn(sample.good30m, sample.total30m, sample.availabilitySlo);
  const slowLong = burn(sample.good6h, sample.total6h, sample.availabilitySlo);
  const blackhole = sample.total5m > 0 && sample.good5m === 0;

  if (sample.dataLoss || blackhole || (fastLong >= 14.4 && fastShort >= 14.4)) {
    return "sev1";
  }
  if (slowLong >= 6 && slowShort >= 6) return "sev2";
  if (sample.p99_10m_ms > sample.latencySloMs) return "sev3";
  return "sev4";
}

export function availability(good: number, total: number): number {
  if (total <= 0) return 1;
  return good / total;
}
