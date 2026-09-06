import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';

export type ImageUploadPreset = 'avatar' | 'chat' | 'plan';

const PRESETS: Record<ImageUploadPreset, { maxWidth: number; compress: number }> = {
  avatar: { maxWidth: 512, compress: 0.75 },
  chat: { maxWidth: 1280, compress: 0.72 },
  plan: { maxWidth: 1280, compress: 0.78 },
};

export async function prepareImageForUpload(uri: string, preset: ImageUploadPreset) {
  const { maxWidth, compress } = PRESETS[preset];
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress, format: ImageManipulator.SaveFormat.JPEG },
  );
  const response = await fetch(manipulated.uri);
  const arrayBuffer = await response.arrayBuffer();
  return {
    arrayBuffer,
    contentType: 'image/jpeg' as const,
    extension: 'jpg' as const,
  };
}

/** Resize/compress then upload to Supabase Storage. Returns public URL or null. */
export async function uploadCompressedImage(
  uri: string,
  options: {
    bucket: string;
    path: string;
    preset: ImageUploadPreset;
    upsert?: boolean;
  },
): Promise<string | null> {
  try {
    const prepared = await prepareImageForUpload(uri, options.preset);
    const { error } = await supabase.storage.from(options.bucket).upload(options.path, prepared.arrayBuffer, {
      contentType: prepared.contentType,
      upsert: options.upsert ?? true,
    });
    if (error) {
      console.error(`Image upload error (${options.bucket}/${options.path}):`, error);
      return null;
    }
    const { data } = supabase.storage.from(options.bucket).getPublicUrl(options.path);
    return data.publicUrl;
  } catch (error) {
    console.error('Image upload failed:', error);
    return null;
  }
}
