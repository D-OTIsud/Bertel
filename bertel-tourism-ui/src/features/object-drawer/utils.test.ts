import { describe, expect, it } from 'vitest';
import { mockObjectDetails } from '../../data/mock';
import { parseActors, parseExternalSyncs, parseMemberships, parseOpenings, parsePrices } from './utils';

describe('object drawer utils', () => {
  it('parses memberships from structured object payloads', () => {
    const raw = (mockObjectDetails.HOTRUN0000000001.raw ?? {}) as Record<string, unknown>;
    const memberships = parseMemberships(raw);

    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      name: 'Club Hebergement Premium',
      tier: 'Gold',
      status: 'Active',
    });
  });

  it('parses external sync references from structured object payloads', () => {
    const raw = (mockObjectDetails.HOTRUN0000000001.raw ?? {}) as Record<string, unknown>;
    const syncItems = parseExternalSyncs(raw);

    expect(syncItems).toHaveLength(2);
    expect(syncItems[0]).toMatchObject({
      source: 'APIDAE',
      externalId: 'api-974-HOT-1001',
      status: 'Synced',
    });
  });

  it('parses deep-data actors and nested contacts', () => {
    const raw = {
      actors: [
        {
          id: 'actor-1',
          display_name: 'Jean Dupont',
          role: { code: 'manager', name: 'Gestionnaire' },
          contacts: [
            {
              id: 'contact-1',
              kind: { code: 'email', name: 'Email' },
              role: { code: 'work', name: 'Professionnel' },
              value: 'jean@example.com',
            },
          ],
        },
      ],
    } as Record<string, unknown>;

    const actors = parseActors(raw);

    expect(actors).toHaveLength(1);
    expect(actors[0]).toMatchObject({
      name: 'Jean Dupont',
      role: 'Gestionnaire',
    });
    expect(actors[0].contacts).toContain('Professionnel: jean@example.com');
  });

  it('flattens nested price periods and opening schedules from backend payloads', () => {
    const raw = {
      object_prices: [
        {
          kind: { name: 'Chambre double' },
          currency_code: 'EUR',
          object_price_periods: [
            {
              amount: 180,
              start_date: '2026-07-01',
              end_date: '2026-08-31',
              conditions: 'Haute saison',
            },
          ],
        },
      ],
      opening_periods: [
        {
          label: 'Vacances',
          date_start: '2026-07-01',
          date_end: '2026-08-31',
          opening_schedules: [
            {
              schedule_type: { name: 'Hebdomadaire' },
              opening_time_periods: [
                {
                  opening_time_period_weekdays: [
                    { weekday: { code: 'mon', name: 'Lundi' } },
                    { weekday: { code: 'tue', name: 'Mardi' } },
                  ],
                  opening_time_frames: [
                    { start_time: '09:00', end_time: '18:00' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as Record<string, unknown>;

    const prices = parsePrices(raw);
    const openings = parseOpenings(raw);

    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({
      label: 'Chambre double',
      amount: '180',
      currency: 'EUR',
    });
    expect(prices[0].details).toContain('Haute saison');

    expect(openings).toHaveLength(1);
    expect(openings[0].slots).toContain('09:00 -> 18:00');
    expect(openings[0].weekdays).toContain('Lundi');
  });
});
