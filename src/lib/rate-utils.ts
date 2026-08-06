/**
 * Shared Rate Threshold Helper (Rule 0 outranking all others in Phase 6)
 *
 * Denominator Rules:
 *  - < 30 calls: SUPPRESS percentage entirely. Return raw counts ("2 of 5")
 *    with a quiet note ("Not enough data yet (<30 calls)").
 *  - 30 to 100 calls: Display percentage marked as provisional ("40% (provisional, 40 of 100)").
 *  - > 100 calls: Standard percentage display ("45% (450 of 1000)").
 */

export interface FormattedRateResult {
  suppressed: boolean;
  isProvisional: boolean;
  percentage: number | null;
  displayString: string;
  note: string | null;
  numerator: number;
  denominator: number;
}

export function formatRateWithThreshold(
  numerator: number,
  denominator: number
): FormattedRateResult {
  if (denominator <= 0 || denominator < 30) {
    return {
      suppressed: true,
      isProvisional: false,
      percentage: null,
      displayString: `${numerator} of ${denominator}`,
      note: "Not enough data yet (<30 calls)",
      numerator,
      denominator,
    };
  }

  const pct = Math.round((numerator / denominator) * 100);

  if (denominator <= 100) {
    return {
      suppressed: false,
      isProvisional: true,
      percentage: pct,
      displayString: `${pct}% (provisional, ${numerator} of ${denominator})`,
      note: "Provisional rate (30-100 calls)",
      numerator,
      denominator,
    };
  }

  return {
    suppressed: false,
    isProvisional: false,
    percentage: pct,
    displayString: `${pct}% (${numerator} of ${denominator})`,
    note: null,
    numerator,
    denominator,
  };
}

/**
 * Connect Rate Low Warning (< 7% when denominator >= 30)
 */
export function getConnectRateWarning(
  connected: number,
  dialled: number
): string | null {
  if (dialled < 30) return null;
  const rate = connected / dialled;
  if (rate < 0.07) {
    return "⚠️ Connect rate is below 7%. This usually indicates phone data quality or calling hours issues rather than pitch performance.";
  }
  return null;
}
