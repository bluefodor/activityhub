/**
 * Supabase Storage image transforms — serves resized JPEGs from the CDN so
 * existing full-resolution uploads don't burn cached egress on every view.
 *
 * Requires Image Transformations enabled on the Supabase project (Pro+).
 * Set EXPO_PUBLIC_ENABLE_STORAGE_IMAGE_TRANSFORMS=true after enabling.
 * CachedImage falls back to the original /object/public/ URL if a transform fails.
 */

const OBJECT_PUBLIC_RE =
  /^(.+\/storage\/v1)\/object\/public\/([^?]+)$/i;
const RENDER_PUBLIC_RE =
  /^(.+\/storage\/v1)\/render\/image\/public\/([^?]+)$/i;

export type StorageImageDisplayPreset = 'avatar' | 'chat' | 'plan' | 'thumb';

const PRESET_MAX_WIDTH: Record<StorageImageDisplayPreset, number> = {
  thumb: 256,
  avatar: 512,
  chat: 1280,
  plan: 1280,
};

const PRESET_QUALITY: Record<StorageImageDisplayPreset, number> = {
  thumb: 70,
  avatar: 75,
  chat: 72,
  plan: 78,
};

export function isSupabaseStoragePublicUrl(url: string): boolean {
  return OBJECT_PUBLIC_RE.test(url) || RENDER_PUBLIC_RE.test(url);
}

/** Build a transformed Supabase render URL, or return the original when not applicable. */
export function optimizedStorageImageUrl(
  url: string | null | undefined,
  options?: {
    maxWidth?: number;
    quality?: number;
    preset?: StorageImageDisplayPreset;
  },
): string | null | undefined {
  if (!url?.trim()) return url;

  const preset = options?.preset;
  const maxWidth = options?.maxWidth ?? (preset ? PRESET_MAX_WIDTH[preset] : 1280);
  const quality = options?.quality ?? (preset ? PRESET_QUALITY[preset] : 75);

  const renderMatch = url.match(RENDER_PUBLIC_RE);
  if (renderMatch) {
    const base = `${renderMatch[1]}/render/image/public/${renderMatch[2]}`;
    const params = new URLSearchParams({
      width: String(maxWidth),
      resize: 'contain',
      quality: String(quality),
    });
    return `${base}?${params.toString()}`;
  }

  const objectMatch = url.match(OBJECT_PUBLIC_RE);
  if (!objectMatch) return url;

  const base = `${objectMatch[1]}/render/image/public/${objectMatch[2]}`;
  const params = new URLSearchParams({
    width: String(maxWidth),
    resize: 'contain',
    quality: String(quality),
  });
  return `${base}?${params.toString()}`;
}

export function optimizedImageSource(
  source: { uri: string } | number,
  options?: {
    maxWidth?: number;
    quality?: number;
    preset?: StorageImageDisplayPreset;
  },
): { uri: string } | number {
  if (typeof source === 'number') return source;
  const uri = optimizedStorageImageUrl(source.uri, options);
  return uri ? { uri } : source;
}
