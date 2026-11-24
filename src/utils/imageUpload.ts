export const DEFAULT_MAX_COMPRESSED_DATA_URL_CHARS = 220_000;

/**
 * Pure helper computing iterative compression dimensions while capping aspect ratios cleanly.
 */
export function computeScaledDimensions(
  width: number,
  height: number,
  maxWidth: number
): { targetWidth: number; targetHeight: number } {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  const scale = safeW > maxWidth ? maxWidth / safeW : 1;
  return {
    targetWidth: Math.max(1, Math.round(safeW * scale)),
    targetHeight: Math.max(1, Math.round(safeH * scale)),
  };
}

/**
 * Reads an image file from device and iteratively compresses it to a lightweight JPEG Data URL
 * strictly bounded under maxDataUrlChars so uploaded photos never bloat or break localStorage / Firestore.
 */
export function compressImageFileToDataUrl(
  file: File,
  maxWidth = 640,
  initialQuality = 0.76,
  maxDataUrlChars = DEFAULT_MAX_COMPRESSED_DATA_URL_CHARS
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select a valid image file (JPG, PNG, WebP).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected file read result.'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode the uploaded image.'));
      img.onload = () => {
        const widthSteps = Array.from(
          new Set([maxWidth, Math.min(maxWidth, 480), Math.min(maxWidth, 360)])
        ).filter((w) => w > 0);
        const qualitySteps = [initialQuality, 0.62, 0.48, 0.35];

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (result.length <= maxDataUrlChars) {
            resolve(result);
          } else {
            reject(new Error('Image compression canvas is unavailable on this browser.'));
          }
          return;
        }

        let smallestCandidate = '';

        for (const widthCap of widthSteps) {
          const { targetWidth, targetHeight } = computeScaledDimensions(
            img.width,
            img.height,
            widthCap
          );
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          ctx.clearRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          for (const q of qualitySteps) {
            try {
              const candidate = canvas.toDataURL('image/jpeg', q);
              if (!smallestCandidate || candidate.length < smallestCandidate.length) {
                smallestCandidate = candidate;
              }
              if (candidate.length <= maxDataUrlChars) {
                resolve(candidate);
                return;
              }
            } catch {
              // Try next step
            }
          }
        }

        if (smallestCandidate && smallestCandidate.length <= maxDataUrlChars) {
          resolve(smallestCandidate);
          return;
        }

        reject(
          new Error(
            'Image is still too large after compression. Please pick a smaller image or clear old photos first.'
          )
        );
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}
