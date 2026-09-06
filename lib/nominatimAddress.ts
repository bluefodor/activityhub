/**
 * Build a short "street, city, state" line from a Nominatim reverse/search JSON `address` object.
 */
export function formatNominatimAddressShort(feature: {
  address?: Record<string, string>;
  display_name?: string;
}): string {
  const a = feature.address;
  if (!a) {
    const full = feature.display_name?.trim();
    if (!full) return '';
    const parts = full.split(',').map((s) => s.trim()).filter(Boolean);
    return parts.slice(0, 3).join(', ');
  }

  const num = a.house_number;
  const street =
    a.road ||
    a.pedestrian ||
    a.footway ||
    a.path ||
    a.neighbourhood ||
    a.residential ||
    a.quarter;
  const line1 = [num, street].filter(Boolean).join(' ').trim();

  const city =
    a.city ||
    a.town ||
    a.village ||
    a.hamlet ||
    a.municipality ||
    a.suburb ||
    '';

  const state = a.state || a.region || '';

  const parts: string[] = [];
  if (line1) parts.push(line1);
  if (city) parts.push(city);
  if (state) parts.push(state);
  if (parts.length > 0) return parts.join(', ');

  const full = feature.display_name?.trim();
  if (!full) return '';
  const fallback = full.split(',').map((s) => s.trim()).filter(Boolean);
  return fallback.slice(0, 3).join(', ');
}
