const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/**
 * Shared currency formatter for all AquaLicious Peso amounts (e.g. ₱2,420.00).
 */
export function formatPeso(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  return pesoFormatter.format(safe).replace(/^PHP\s*/, '₱');
}

/**
 * Signed Peso formatter preserving '+' for positive trends (e.g. +₱15.25).
 */
export function formatSignedPeso(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  return safe > 0 ? `+${formatPeso(safe)}` : formatPeso(safe);
}
