import { describe, expect, it } from 'vitest';
import {
  afterDeviceRoute, deviceFailureRoute, estimateImageTokens, isDeviceFormat, REASONS, staticRoute, tooLargeForDevice,
} from '../src/routing';
import { buildCsv } from '../src/export';
import type { ImageCard } from '../src/types';

describe('format', () => {
  it('accepts JPEG and PNG only', () => {
    expect(isDeviceFormat('image/jpeg')).toBe(true);
    expect(isDeviceFormat('image/png')).toBe(true);
    for (const m of ['image/webp', 'image/gif', 'image/svg+xml', 'image/avif']) expect(isDeviceFormat(m)).toBe(false);
  });
  it('routes non JPEG/PNG to cloud with the format reason', () => {
    expect(staticRoute('image/webp', 100, 100)).toEqual({ source: 'cloud', reason: 'Format not supported on device' });
  });
});

describe('token estimate', () => {
  it('grows with area', () => {
    expect(estimateImageTokens(280, 280)).toBe(100);
    expect(estimateImageTokens(0, 10)).toBe(0);
  });
  it('flags big images with the margin', () => {
    expect(tooLargeForDevice(800, 600)).toBe(false);
    expect(tooLargeForDevice(3200, 2400)).toBe(true);
    // 2688x2688 = 96*96 = 9216 tokens: over 0.8 margin, under margin 1
    expect(tooLargeForDevice(2688, 2688, 0.8)).toBe(true);
    expect(tooLargeForDevice(2688, 2688, 1)).toBe(false);
  });
  it('routes large PNG to cloud with the size reason', () => {
    expect(staticRoute('image/png', 3200, 2400)).toEqual({ source: 'cloud', reason: REASONS.large });
  });
});

describe('reasons', () => {
  it('keeps ordinary photos on device', () => {
    expect(staticRoute('image/jpeg', 1200, 800)).toEqual({ source: 'device' });
    expect(afterDeviceRoute('photo')).toEqual({ source: 'device' });
  });
  it('sends charts to cloud for a long description', () => {
    expect(afterDeviceRoute('chart')).toEqual({ source: 'cloud', reason: 'Needs a long description' });
  });
  it('device failure reason', () => {
    expect(deviceFailureRoute().reason).toBe('On-device model unavailable');
  });
});

describe('csv', () => {
  it('escapes cells and writes the five columns', () => {
    const c = { file: 'a,b.png', kind: 'photo', alt: 'He said "hi"', decorative: false, source: 'device', reason: undefined } as unknown as ImageCard;
    expect(buildCsv([c])).toBe('file,kind,alt,source,reason\n"a,b.png",photo,"He said ""hi""",device,\n');
  });
});
