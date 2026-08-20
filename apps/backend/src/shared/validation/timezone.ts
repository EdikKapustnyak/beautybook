export function isValidIanaTimezone(value: string): boolean {
  try {
    // Throws RangeError for an unknown/invalid IANA timezone identifier.
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
