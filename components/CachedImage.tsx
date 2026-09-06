import React, { useMemo, useState } from 'react';
import { Image as ExpoImage, type ImageContentFit, type ImageProps as ExpoImageProps } from 'expo-image';
import { type ImageSourcePropType, type StyleProp, type ImageStyle } from 'react-native';
import {
  optimizedImageSource,
  type StorageImageDisplayPreset,
} from '@/lib/storageImageUrl';

/** Off by default — enable in .env once Supabase Image Transformations is on (Pro+). */
const STORAGE_TRANSFORMS_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_STORAGE_IMAGE_TRANSFORMS === 'true';

type CachedImageProps = {
  source: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  /** Matches React Native Image `resizeMode`. */
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center' | 'repeat';
  contentFit?: ImageContentFit;
  recyclingKey?: string;
  /** Resize Supabase Storage URLs at the CDN (cuts egress for dense legacy photos). */
  displayPreset?: StorageImageDisplayPreset;
  maxDisplayWidth?: number;
  displayQuality?: number;
  /** Use Supabase /render/image/ URLs. Requires transforms enabled on the project. */
  optimizeRemote?: boolean;
};

const RESIZE_TO_FIT: Record<NonNullable<CachedImageProps['resizeMode']>, ImageContentFit> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'none',
  repeat: 'cover',
};

function resolveRemoteUri(
  raw: { uri: string },
  options: {
    optimize: boolean;
    preset?: StorageImageDisplayPreset;
    maxWidth?: number;
    quality?: number;
    forceOriginal?: boolean;
  },
): string {
  if (!options.optimize || options.forceOriginal) {
    return raw.uri;
  }
  const optimized = optimizedImageSource(raw, {
    preset: options.preset,
    maxWidth: options.maxWidth,
    quality: options.quality,
  });
  return typeof optimized === 'object' && 'uri' in optimized ? optimized.uri : raw.uri;
}

/** Remote images with disk cache — cuts repeat Supabase Storage egress. */
export function CachedImage({
  source,
  style,
  resizeMode = 'cover',
  contentFit,
  recyclingKey,
  displayPreset,
  maxDisplayWidth,
  displayQuality,
  optimizeRemote = STORAGE_TRANSFORMS_ENABLED,
}: CachedImageProps) {
  const fit = contentFit ?? RESIZE_TO_FIT[resizeMode];
  const raw = source as ExpoImageProps['source'];
  const remoteUri =
    typeof raw === 'object' && raw != null && 'uri' in raw && raw.uri ? raw.uri : null;

  const [useOriginalUrl, setUseOriginalUrl] = useState(false);

  const expoSource = useMemo(() => {
    if (!remoteUri) return raw;
    const uri = resolveRemoteUri(
      { uri: remoteUri },
      {
        optimize: optimizeRemote,
        preset: displayPreset,
        maxWidth: maxDisplayWidth,
        quality: displayQuality,
        forceOriginal: useOriginalUrl,
      },
    );
    return { uri } as ExpoImageProps['source'];
  }, [
    raw,
    remoteUri,
    optimizeRemote,
    displayPreset,
    maxDisplayWidth,
    displayQuality,
    useOriginalUrl,
  ]);

  return (
    <ExpoImage
      source={expoSource}
      style={style}
      contentFit={fit}
      cachePolicy="disk"
      transition={0}
      recyclingKey={recyclingKey}
      onError={() => {
        if (optimizeRemote && remoteUri && !useOriginalUrl) {
          setUseOriginalUrl(true);
        }
      }}
    />
  );
}
