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

// Ouvre l'appareil photo de la tablette (camera = true) ou la galerie / les fichiers (camera = false)
// et renvoie la photo recadrée et compressée, ou null.
export function takePhoto({ camera = true } = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (camera) input.setAttribute('capture', 'environment');
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      resolve(f ? await compressPhoto(f).catch(() => null) : null);
    }, { once: true });
    input.click();
  });
}

// Petit menu « Prendre une photo / Choisir une image » près du bouton touché ; renvoie la photo ou null.
export function askPhoto(anchor, openMenu) {
  return new Promise(resolve => {
    openMenu({
      anchor, width: 280, align: 'right',
      items: [
        { label: 'Prendre une photo', sub: 'Appareil photo de la tablette', onPick: async () => resolve(await takePhoto({ camera: true })) },
        { label: 'Choisir une image', sub: 'Galerie ou fichiers', onPick: async () => resolve(await takePhoto({ camera: false })) },
      ],
    });
    // Menu fermé sans choix : on ne renvoie rien.
    document.getElementById('layer').querySelector('[data-close]').addEventListener('pointerdown', () => resolve(null), { once: true });
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
