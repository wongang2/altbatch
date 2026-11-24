import { describe, type Handles } from './ai';
import { afterDeviceRoute, deviceFailureRoute, REASONS, staticRoute, type Route } from './routing';
import type { AltResult, ImageCard } from './types';

export interface DraftContext {
  handles: Handles | null;
  tokenMargin: number;
  /** Chrome Prompt API reports the model as available */
  deviceReady: boolean;
  /** asks the owner once before the first cloud call */
  confirmCloud: () => Promise<boolean>;
}

function apply(card: ImageCard, r: AltResult, route: Route, source: 'device' | 'cloud') {
  card.kind = r.kind;
  card.alt = r.kind === 'decorative' ? '' : r.alt;
  card.decorative = r.kind === 'decorative';
  card.longDescription = r.longDescription;
  card.source = source;
  card.reason = source === 'cloud' ? route.reason : undefined;
  card.status = 'done';
  card.error = undefined;
}

async function viaCloud(card: ImageCard, ctx: DraftContext, route: Route): Promise<void> {
  if (!ctx.handles) {
    card.status = 'error';
    card.error = 'Firebase is not configured, so the cloud handle is unavailable.';
    return;
  }
  if (!(await ctx.confirmCloud())) {
    card.status = 'skipped';
    card.source = undefined;
    card.reason = route.reason;
    return;
  }
  const { result } = await describe(ctx.handles.cloud, card.blob!, card.mime, true);
  apply(card, result, route, 'cloud');
}

/** Drafts one card with the routing rules. Never throws: failures land on the card. */
export async function draftCard(card: ImageCard, ctx: DraftContext): Promise<void> {
  if (!card.blob) return;
  card.status = 'working';
  try {
    let route: Route = card.forceCloud
      ? { source: 'cloud', reason: REASONS.manual }
      : staticRoute(card.mime, card.width ?? 0, card.height ?? 0, ctx.tokenMargin);

    if (route.source === 'device' && (!ctx.deviceReady || !ctx.handles)) route = deviceFailureRoute();

    if (route.source === 'device') {
      try {
        const out = await describe(ctx.handles!.hybrid, card.blob, card.mime, false);
        if (out.source === 'cloud') {
          // The prefer-on-device handle fell back to the cloud by itself.
          apply(card, out.result, deviceFailureRoute(), 'cloud');
          return;
        }
        route = afterDeviceRoute(out.result.kind);
        if (route.source === 'device') {
          apply(card, out.result, route, 'device');
          return;
        }
      } catch {
        route = deviceFailureRoute();
      }
    }
    await viaCloud(card, ctx, route);
  } catch (e) {
    card.status = 'error';
    card.error = (e as Error).message;
  }
}
