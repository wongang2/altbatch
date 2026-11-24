import type { Kind, Source } from './types';

/** Documented on-device image input limit (Firebase AI Logic hybrid docs). */
export const DEVICE_TOKEN_LIMIT = 9216;
export const DEFAULT_TOKEN_MARGIN = 0.8;

export const REASONS = {
  format: 'Format not supported on device',
  large: 'Too large for on-device model',
  chart: 'Needs a long description',
  unavailable: 'On-device model unavailable',
  manual: 'Sent to cloud by you',
} as const;

export type Reason = (typeof REASONS)[keyof typeof REASONS];

export interface Route {
  source: Source;
  reason?: Reason;
}

/** On-device image input accepts JPEG and PNG only. */
export function isDeviceFormat(mime: string): boolean {
  const m = mime.toLowerCase().split(';')[0].trim();
  return m === 'image/jpeg' || m === 'image/jpg' || m === 'image/png';
}

/**
 * The SDK has no token counter for hybrid inference, so this is a heuristic:
 * one token per 28x28 pixel patch. It is a documented estimate, not the model's real count.
 */
export function estimateImageTokens(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 0;
  return Math.ceil(width / 28) * Math.ceil(height / 28);
}

export function tooLargeForDevice(
  width: number,
  height: number,
  margin = DEFAULT_TOKEN_MARGIN,
): boolean {
  return estimateImageTokens(width, height) > DEVICE_TOKEN_LIMIT * margin;
}

/** Route decided before any model call, from file facts only. */
export function staticRoute(
  mime: string,
  width: number,
  height: number,
  margin = DEFAULT_TOKEN_MARGIN,
): Route {
  if (!isDeviceFormat(mime)) return { source: 'cloud', reason: REASONS.format };
  if (tooLargeForDevice(width, height, margin)) return { source: 'cloud', reason: REASONS.large };
  return { source: 'device' };
}

/** After the device answered: charts need the cloud for a long description. */
export function afterDeviceRoute(kind: Kind): Route {
  return kind === 'chart' ? { source: 'cloud', reason: REASONS.chart } : { source: 'device' };
}

/** Device model missing or the device call failed. */
export function deviceFailureRoute(): Route {
  return { source: 'cloud', reason: REASONS.unavailable };
}
