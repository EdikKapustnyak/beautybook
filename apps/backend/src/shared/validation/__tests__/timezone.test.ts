import { describe, expect, it } from 'vitest';

import { isValidIanaTimezone } from '../timezone.js';

describe('isValidIanaTimezone', () => {
  it('accepts well-known IANA timezones', () => {
    expect(isValidIanaTimezone('Europe/Oslo')).toBe(true);
    expect(isValidIanaTimezone('UTC')).toBe(true);
    expect(isValidIanaTimezone('America/New_York')).toBe(true);
  });

  it('rejects an unknown timezone identifier', () => {
    expect(isValidIanaTimezone('Not/A_Timezone')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidIanaTimezone('')).toBe(false);
  });

  it('rejects a plain UTC offset string (not an IANA name)', () => {
    expect(isValidIanaTimezone('GMT+2')).toBe(false);
  });
});
