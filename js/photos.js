// photos.js — Photos d'élèves : format portrait 2:3, compressées (JPEG ~20 Ko) pour tenir ~400 photos.
export const PHOTO_W = 240;
export const PHOTO_H = 360;

// Conversion synchrone (toDataURL) : ne dépend pas du rafraîchissement de l'écran.
export async function canvasToJpeg(canvas, quality = 0.82) {
  const bin = atob(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

// Photo prise à l'appareil (ou choisie dans la galerie) : recadrage 2:3 centré et réduction.
export async function compressPhoto(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const ratio = PHOTO_W / PHOTO_H;
  let sw = bmp.width, sh = bmp.height;
  if (sw / sh > ratio) sw = sh * ratio; else sh = sw / ratio;
  const c = document.createElement('canvas');
  c.width = PHOTO_W; c.height = PHOTO_H;
  c.getContext('2d').drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, PHOTO_W, PHOTO_H);
  if (bmp.close) bmp.close();
  return canvasToJpeg(c);
}

// Ouvre l'appareil photo de la tablette (ou la galerie) et renvoie la photo compressée, ou null.
export function takePhoto() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      resolve(f ? await compressPhoto(f).catch(() => null) : null);
    }, { once: true });
    input.click();
  });
}

// Ouvre le sélecteur de fichiers pour un PDF.
export function pickPdf() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null), { once: true });
    input.click();
  });
}
