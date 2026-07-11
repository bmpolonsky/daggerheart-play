import { optimizeImageForStorage } from '../../../../core/images/optimizeImage';

export async function readFileAsDataUrl(file: File): Promise<string> {
  const optimized = await optimizeImageForStorage(file, file.name, { maxDimension: 1600, quality: 0.84 });
  return blobAsDataUrl(optimized.blob);
}

function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Не удалось прочитать файл.'));
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Не удалось прочитать файл.')));
    reader.readAsDataURL(blob);
  });
}
