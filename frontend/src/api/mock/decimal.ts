/**
 * Exact decimal handling for the mock backend. Measurements stay strings end to end, as the real
 * API requires; commas are accepted only in input.
 */

import type { DecimalString } from "@/api/types";

const DECIMAL_RE = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/** Canonical "0.10"-style string, or null when the input is not a number. */
export function normalizeDecimal(raw: string): DecimalString | null {
  const trimmed = raw.trim();
  if (trimmed === "" || !DECIMAL_RE.test(trimmed)) {
    return null;
  }

  let body = trimmed;
  let negative = false;
  if (body.startsWith("+")) {
    body = body.slice(1);
  } else if (body.startsWith("-")) {
    negative = true;
    body = body.slice(1);
  }

  const dot = body.indexOf(".");
  const comma = body.indexOf(",");
  const separator = dot === -1 ? comma : dot;
  const integerPart = separator === -1 ? body : body.slice(0, separator);
  const fractionPart = separator === -1 ? "" : body.slice(separator + 1);
  const integer = integerPart.replace(/^0+(?=\d)/, "") || "0";
  const isZero = /^0*$/.test(integer) && /^0*$/.test(fractionPart);
  const magnitude = `${integer}${fractionPart ? `.${fractionPart}` : ""}`;

  return isZero ? "0" : `${negative ? "-" : ""}${magnitude}`;
}

function scaled(value: DecimalString): { units: bigint; scale: number } | null {
  const normalized = normalizeDecimal(value);
  if (normalized === null) {
    return null;
  }
  const negative = normalized.startsWith("-");
  const magnitude = negative ? normalized.slice(1) : normalized;
  const [integerPart = "0", fractionPart = ""] = magnitude.split(".");
  const digits = `${integerPart}${fractionPart}`.replace(/^0+(?=\d)/, "");
  const units = BigInt(digits) * (negative ? -1n : 1n);
  return { units, scale: fractionPart.length };
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function align(
  left: { units: bigint; scale: number },
  right: { units: bigint; scale: number },
): { left: bigint; right: bigint; scale: number } {
  const scale = Math.max(left.scale, right.scale);
  return {
    left: left.units * pow10(scale - left.scale),
    right: right.units * pow10(scale - right.scale),
    scale,
  };
}

export function formatScaled(units: bigint, scale: number): DecimalString {
  if (units === 0n) {
    return "0";
  }
  const negative = units < 0n;
  let digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  if (scale > 0) {
    digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
    digits = digits.replace(/\.?0+$/, "");
  }
  return `${negative ? "-" : ""}${digits}`;
}

export function compareDecimals(left: DecimalString, right: DecimalString): number {
  const a = scaled(left);
  const b = scaled(right);
  if (a === null || b === null) {
    throw new Error(`Invalid decimal: ${left} / ${right}`);
  }
  const aligned = align(a, b);
  if (aligned.left === aligned.right) {
    return 0;
  }
  return aligned.left < aligned.right ? -1 : 1;
}

export function addDecimals(left: DecimalString, right: DecimalString): DecimalString {
  const a = scaled(left);
  const b = scaled(right);
  if (a === null || b === null) {
    throw new Error(`Invalid decimal: ${left} / ${right}`);
  }
  const aligned = align(a, b);
  return formatScaled(aligned.left + aligned.right, aligned.scale);
}

export function subtractDecimals(left: DecimalString, right: DecimalString): DecimalString {
  const a = scaled(left);
  const b = scaled(right);
  if (a === null || b === null) {
    throw new Error(`Invalid decimal: ${left} / ${right}`);
  }
  const aligned = align(a, b);
  return formatScaled(aligned.left - aligned.right, aligned.scale);
}

export function isInRange(
  value: DecimalString,
  min: DecimalString | null,
  max: DecimalString | null,
): boolean {
  if (min !== null && compareDecimals(value, min) < 0) {
    return false;
  }
  if (max !== null && compareDecimals(value, max) > 0) {
    return false;
  }
  return true;
}
