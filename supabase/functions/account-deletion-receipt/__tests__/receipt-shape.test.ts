import { publicReceipt, receiptIdFromBody } from '../receipt-shape';

const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('receiptIdFromBody', () => {
  test('accepts exactly one lowercase receipt number', () => {
    expect(receiptIdFromBody({ receipt_id: ID })).toBe(ID);
  });

  test.each([
    ['an uppercase number', { receipt_id: ID.toUpperCase() }],
    ['a second key', { receipt_id: ID, user_id: ID }],
    ['no key', {}],
    ['a non-string', { receipt_id: 42 }],
    ['a short value', { receipt_id: 'aaaaaaaa-bbbb' }],
  ])('rejects %s', (_label, body) => {
    expect(receiptIdFromBody(body as Record<string, unknown>)).toBeNull();
  });
});

describe('publicReceipt', () => {
  const row = {
    id: ID,
    erased_at: '2026-10-05T12:00:00+00:00',
    expires_at: '2027-10-05T12:00:00+00:00',
    sweeps: {
      profile_erased: true,
      raw_clippings_erased: false,
      record_photos_erased: null,
      unexpected: true,
      deletion_fenced: 'yes',
    },
    sweeps_reported: true,
    // A column the table might grow later must never leave the server.
    internal_note: 'never shown',
  };

  test('copies only the known fields and three-valued known flags', () => {
    expect(publicReceipt(row)).toEqual({
      id: ID,
      erased_at: row.erased_at,
      expires_at: row.expires_at,
      sweeps: { profile_erased: true, raw_clippings_erased: false, record_photos_erased: null },
      sweeps_reported: true,
    });
  });

  test.each([
    ['null', null],
    ['an array', [row]],
    ['a bad id', { ...row, id: 'x' }],
    ['missing dates', { ...row, expires_at: undefined }],
  ])('refuses %s', (_label, value) => {
    expect(publicReceipt(value)).toBeNull();
  });

  test('sweeps_reported is true only when the row says so', () => {
    expect(publicReceipt({ ...row, sweeps_reported: 'true' })?.sweeps_reported).toBe(false);
  });
});
