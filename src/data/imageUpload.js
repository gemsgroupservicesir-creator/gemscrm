const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_EDGE = 900;

export async function compressLeadImage(file, { maxEdge = MAX_IMAGE_EDGE } = {}) {
  if (!file || file.size === 0) return '';
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 5 MB.');
  if (!window.createImageBitmap) throw new Error('Image uploads are not supported by this browser.');

  let bitmap;
  try {
    bitmap = await window.createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not process that image.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.76);
  } catch (error) {
    throw new Error(error.message || 'Could not process that image.');
  } finally {
    bitmap?.close?.();
  }
}
