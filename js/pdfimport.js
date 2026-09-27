// pdfimport.js — Lecture d'un trombinoscope PDF directement sur l'appareil (aucun envoi).
// Principe : pour chaque page, on repère les images (photos) et leur position, on associe à chaque
// photo le texte situé juste en dessous (« NOM Prénom », parfois sur deux lignes), puis on découpe
// la photo dans le rendu de la page. Les avatars génériques (autre taille, image répétée) = photo manquante.
import { PHOTO_W, PHOTO_H, canvasToJpeg } from './photos.js';

let pdfjs = null;
async function lib() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
function bbox(m) {
  const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) };
}

// Images peintes sur la page, avec leur rectangle en coordonnées PDF (origine en bas à gauche).
async function pageImages(page, OPS) {
  const ops = await page.getOperatorList();
  const out = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args && args[0]) ctm = mul(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageXObjectRepeat) {
      const b = bbox(ctm);
      const key = typeof args[0] === 'string' ? args[0] : null;
      const pw = args[1] || (args[0] && args[0].width) || 0, ph = args[2] || (args[0] && args[0].height) || 0;
      out.push({ ...b, w: b.x2 - b.x1, h: b.y2 - b.y1, key, pw, ph });
    }
  }
  return out;
}

// Lignes de texte : morceaux regroupés par hauteur (y) puis triés de gauche à droite.
async function pageLines(page) {
  const tc = await page.getTextContent();
  const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({
    str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 8,
  }));
  return items;
}

const UPPER = /^[A-ZÀ-ÖØ-Þ'’\-]+$/;
const isUpperWord = w => UPPER.test(w) && /[A-ZÀ-ÖØ-Þ]/.test(w);
const cap = s => s.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

// « DA SILVA Manon » → { nom: 'DA SILVA', prenom: 'Manon' }
export function splitName(text) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  let i = 0;
  while (i < words.length && isUpperWord(words[i])) i++;
  if (i === 0) return { nom: words.slice(-1).join(' ').toUpperCase(), prenom: words.slice(0, -1).join(' ') };
  if (i === words.length) {
    if (words.length === 1) return { nom: words[0], prenom: '' };
    return { nom: words.slice(0, -1).join(' '), prenom: cap(words[words.length - 1]) };
  }
  return { nom: words.slice(0, i).join(' '), prenom: words.slice(i).join(' ') };
}

// Point d'entrée : file (File/Blob du PDF), onProgress(texte). Renvoie la classe proposée.
export async function readTrombinoscope(file, onProgress = () => {}) {
  const { getDocument, OPS } = await lib();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data, isEvalSupported: false }).promise;
  let className = '';
  const found = [];
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress(`Lecture de la page ${p} / ${doc.numPages}…`);
    const page = await doc.getPage(p);
    const [imgs, texts] = await Promise.all([pageImages(page, OPS), pageLines(page)]);
    if (!className) {
      const all = texts.map(t => t.str).join(' ');
      const m = /Classe\s*:?\s*([^\s,;]+(?:\s+SEGPA)?)/i.exec(all);
      if (m) className = m[1].trim();
    }
    // Photos candidates : images plus hautes que larges, d'une taille raisonnable.
    const photos = imgs.filter(im => im.h > 30 && im.w > 20 && im.h / im.w > 1.05 && im.h / im.w < 2.2);
    if (!photos.length) continue;
    // Chaque texte est rattaché à la photo située juste au-dessus de lui (même colonne).
    const lines = new Map();
    for (const t of texts) {
      const cx = t.x + t.w / 2;
      let best = null, bestGap = Infinity;
      for (const ph of photos) {
        const overlap = cx >= ph.x1 - 12 && cx <= ph.x2 + 12;
        const gap = ph.y1 - (t.y + t.h * 0.2);
        if (overlap && gap >= -2 && gap < 70 && gap < bestGap) { best = ph; bestGap = gap; }
      }
      if (best) { if (!lines.has(best)) lines.set(best, []); lines.get(best).push(t); }
    }
    // Rendu de la page pour découper les photos.
    const scale = Math.min(4, Math.max(2, PHOTO_W / Math.min(...photos.map(ph => ph.w))));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    // intent « print » : rendu sans attendre le rafraîchissement de l'écran (plus fiable, même en arrière-plan).
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, intent: 'print' }).promise;
    for (const ph of photos) {
      const ts = (lines.get(ph) || []).sort((a, b) => (b.y - a.y) || (a.x - b.x));
      if (!ts.length) continue; // image sans nom dessous (logo…) : ignorée
      // On regroupe en lignes et on s'arrête au premier grand écart vertical.
      const rows = [];
      for (const t of ts) {
        const last = rows[rows.length - 1];
        if (last && Math.abs(last.y - t.y) < t.h * 0.6) last.parts.push(t);
        else { if (last && last.y - t.y > t.h * 2.2) break; rows.push({ y: t.y, parts: [t] }); }
      }
      const text = rows.map(r => r.parts.sort((a, b) => a.x - b.x).map(x => x.str).join(' ')).join(' ');
      const [x1, y1, x2, y2] = vp.convertToViewportRectangle([ph.x1, ph.y1, ph.x2, ph.y2]);
      found.push({ page: p, ph, text, rect: { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }, canvas });
    }
  }
  if (!found.length) throw new Error('Aucune photo accompagnée d’un nom n’a été trouvée dans ce PDF.');

  // Avatars génériques : même image répétée plusieurs fois, ou taille nettement différente de la taille la plus courante.
  const keyCount = new Map();
  for (const f of found) if (f.ph.key) { f.ph.key = f.page + ':' + f.ph.key; keyCount.set(f.ph.key, (keyCount.get(f.ph.key) || 0) + 1); }
  const sizeKey = f => Math.round(f.ph.w / 4) + 'x' + Math.round(f.ph.h / 4);
  const sizeCount = new Map();
  for (const f of found) sizeCount.set(sizeKey(f), (sizeCount.get(sizeKey(f)) || 0) + 1);
  const common = [...sizeCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const ref = found.find(f => sizeKey(f) === common).ph;

  const students = [];
  for (const f of found) {
    const repeated = !!f.ph.key && keyCount.get(f.ph.key) > 1;
    const odd = Math.abs(f.ph.w - ref.w) / ref.w > 0.12 || Math.abs(f.ph.h - ref.h) / ref.h > 0.12;
    const missing = odd || repeated;
    let photoBlob = null;
    if (!missing) {
      const c = document.createElement('canvas');
      c.width = PHOTO_W; c.height = PHOTO_H;
      const g = c.getContext('2d');
      // Recadrage 2:3 centré sur la photo.
      const { x, y, w, h } = f.rect;
      const targetRatio = PHOTO_W / PHOTO_H;
      let sw = w, sh = h;
      if (w / h > targetRatio) sw = h * targetRatio; else sh = w / targetRatio;
      g.drawImage(f.canvas, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh, 0, 0, PHOTO_W, PHOTO_H);
      photoBlob = await canvasToJpeg(c);
    }
    students.push({ ...splitName(f.text), raw: f.text, photoBlob, missing });
  }
  onProgress('');
  const digit = /^(\d)/.exec(className);
  return {
    className, pages: doc.numPages, students,
    level: digit ? { 6: '6e', 5: '5e', 4: '4e', 3: '3e' }[digit[1]] || null : null,
    segpa: /SEGPA/i.test(className),
  };
}
