const WEBP_MIME_TYPE = 'image/webp';
const OPTIMIZABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

export interface OptimizedImage {
  blob: Blob;
  name: string;
  optimized: boolean;
}

export function isOptimizableImageType(mimeType: string): boolean {
  return OPTIMIZABLE_IMAGE_TYPES.has(mimeType.toLowerCase());
}

export function webpFileName(name: string): string {
  const trimmed = name.trim() || 'image';
  return `${trimmed.replace(/\.[^.]+$/, '')}.webp`;
}

export async function optimizeImageForStorage(
  source: Blob,
  name: string,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<OptimizedImage> {
  if (!isOptimizableImageType(source.type) || typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return { blob: source, name, optimized: false };
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(source);
    const maxDimension = options.maxDimension ?? 3072;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return { blob: source, name, optimized: false };
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, WEBP_MIME_TYPE, options.quality ?? 0.84));
    if (!blob || blob.type !== WEBP_MIME_TYPE) return { blob: source, name, optimized: false };
    return { blob, name: webpFileName(name), optimized: true };
  } catch (error) {
    console.warn('Image optimization failed; keeping the original asset.', error);
    return { blob: source, name, optimized: false };
  } finally {
    bitmap?.close();
  }
}
