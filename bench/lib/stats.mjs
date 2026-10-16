export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summarize(xs) {
  if (xs.length === 0) return null;
  const m = median(xs);
  const mad = median(xs.map((x) => Math.abs(x - m)));
  return {
    n: xs.length,
    median: m,
    min: Math.min(...xs),
    max: Math.max(...xs),
    // Median absolute deviation as a share of the median. Above 5% the report calls it noisy.
    madPct: m ? (100 * mad) / m : 0,
  };
}
