// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsProvider, useAnalytics } from '../src/analytics/provider';
import { I18nProvider } from '../src/i18n';
import { capture } from '../src/analytics/client';

vi.mock('../src/analytics/client', () => ({
  applyConsent: vi.fn(),
  applyIdentity: vi.fn(),
  capture: vi.fn(),
  getAnalyticsClient: vi.fn(async () => ({ register: vi.fn() })),
  getResolvedAnonymousId: vi.fn(() => null),
}));

const V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function Probe() {
  const analytics = useAnalytics();
  return (
    <>
      <button type="button" onClick={() => analytics.track('home_view_asset_panel', {})}>
        track
      </button>
      <button type="button" onClick={() => analytics.newRequestId()}>
        request
      </button>
    </>
  );
}

describe('AnalyticsProvider UUID generation', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    cleanup();
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('does not call crypto.randomUUID directly in LAN HTTP contexts', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: undefined,
        getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      },
      configurable: true,
      writable: true,
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: { version: '0.7.0' } }))));

    render(
      <I18nProvider initial="en">
        <AnalyticsProvider>
          <Probe />
        </AnalyticsProvider>
      </I18nProvider>,
    );

    expect(() => fireEvent.click(screen.getByRole('button', { name: 'track' }))).not.toThrow();
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'request' }))).not.toThrow();

    await waitFor(() => expect(capture).toHaveBeenCalled());
    const args = vi.mocked(capture).mock.calls[0]![1];
    expect(args.insertId).toMatch(V4_RE);
  });
});
