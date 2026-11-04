// Lecture locale uniquement ; aucune requête réseau vers Pronote ou un service d'OCR.
export const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const yearKey = value => String(value || '').replace(/\D/g, '');
export function readCSV(text, delimiter = ';') {
  const rows = []; let row = [], value = '', quoted = false;
  text = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else if (quoted || !value) quoted = !quoted; else throw new Error('Guillemet inattendu dans le CSV.'); }
    else if (c === delimiter && !quoted) { row.push(value); value = ''; }
    else if ((c === '\r' || c === '\n') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(value); if (row.some(v => v.trim())) rows.push(row); row = []; value = ''; }
    else value += c;
  }
  if (quoted) throw new Error('Le CSV contient un champ entre guillemets non terminé.');
  row.push(value); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
export function parseRosterCSV(text) {
  const headerLine = String(text).replace(/^\uFEFF/, '').split(/\r?\n/)[0];
  const delimiter = headerLine.includes(';') ? ';' : headerLine.includes('\t') ? '\t' : ',';
  const data = readCSV(text, delimiter);
  if (data.length < 2) throw new Error('Le CSV ne contient pas de liste d’élèves.');
  const header = data[0].map(norm), studentCol = header.findIndex(h => ['eleves', 'eleve'].includes(h));
  if (studentCol < 0) throw new Error('Profil CSV non reconnu : colonne « Élèves » attendue.');
  const classCol = header.indexOf('classe de rattachement');
  const rows = data.slice(1).map((r, i) => {
    if (r.length !== header.length) throw new Error(`La ligne ${i + 2} contient ${r.length} colonnes au lieu de ${header.length}.`);
    return { sourceRow: i + 2, label: r[studentCol].trim(), sourceClass: classCol >= 0 ? r[classCol].trim() : '' };
  });
  const counts = new Map(); rows.forEach(r => counts.set(norm(r.label), (counts.get(norm(r.label)) || 0) + 1));
  rows.forEach(r => { r.ambiguous = !r.label || counts.get(norm(r.label)) > 1; });
  return { profile: 'roster', label: 'Liste d’élèves CSV', rows, warnings: ['Cette liste sert à vérifier les correspondances avec le Carnet. Elle ne crée ni ne remplace automatiquement les élèves.', 'Les colonnes administratives, coordonnées et dates de connexion ne sont pas reprises.'] };
}
export function suggestStudent(label, pupils, ambiguous = false) {
  if (ambiguous || !norm(label)) return '';
  const matches = pupils.filter(p => norm(p.nom + ' ' + p.prenom) === norm(label) || norm(p.prenom + ' ' + p.nom) === norm(label));
  return matches.length === 1 ? matches[0].id : '';
}
let library;
async function pdfLibrary() {
  if (!library) { library = await import('../vendor/pdfjs/pdf.min.mjs'); library.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href; }
  return library;
}
export async function renderPDFPage(file, number = 1) {
  const lib = await pdfLibrary();
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const page = await pdf.getPage(number), size = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(1.6, 1600 / Math.max(size.width, size.height)) });
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return { src: canvas.toDataURL('image/png'), page: number, pages: pdf.numPages };
  } finally { await pdf.destroy(); }
}
export async function readPDF(file) {
  await pdfLibrary();
  const task = library.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  const pdf = await task.promise;
  try {
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter(i => i.str?.trim()).map(i => { const matrix = library.Util.transform(viewport.transform, i.transform); return { text: i.str, x: matrix[4], y: matrix[5], width: i.width, height: i.height }; });
      pages.push({ number, width: viewport.width, height: viewport.height, items });
    }
    if (!pages.some(p => p.items.length)) throw new Error('Ce PDF ne contient pas de texte exploitable. Une saisie ou une reconnaissance de texte sera nécessaire.');
    return pages;
  } finally { await pdf.destroy(); }
}
export function lines(items, tolerance = 2.5) {
  const grouped = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let line = grouped.find(l => Math.abs(l.y - item.y) <= tolerance);
    if (!line) { line = { y: item.y, items: [] }; grouped.push(line); }
    line.items.push(item);
  }
  return grouped.map(l => ({ y: l.y, items: l.items.sort((a, b) => a.x - b.x), text: l.items.sort((a, b) => a.x - b.x).map(i => i.text).join(' ') }));
}
export function grade(raw) {
  raw = String(raw || '').trim();
  if (!raw) return { raw, value: null, status: 'missing' };
  if (/^\d+(?:[,.]\d+)?$/.test(raw)) return { raw, value: Number(raw.replace(',', '.')), status: 'numeric' };
  return { raw, value: null, status: /^(N\.Not|Non noté|N\.Noté)$/i.test(raw) ? 'not_graded' : 'review' };
}
export function extractMeta(pages) {
  const text = pages.flatMap(p => lines(p.items).map(l => l.text)).join('\n');
  const year = text.match(/Année scolaire\s*:\s*(\d{4})\s*[\/–-]\s*(\d{4})/i);
  const trimester = text.match(/Bulletin du\s+(\d)(?:er|e|ème)?\s+Trimestre/i);
  const period = text.match(/Période du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})/i);
  return { year: year ? `${year[1]}–${year[2]}` : '', trimester: trimester ? +trimester[1] : null, period: period ? [period[1], period[2]] : null, text };
}
export function parseBulletin(pages) {
  const meta = extractMeta(pages), subjects = [], headerCandidates = [];
  let generalAppreciation = '', sourceClass = '', generalMeans = null;
  for (const page of pages) {
    const all = page.items, mat = all.find(i => norm(i.text) === 'matieres'), appreciation = all.find(i => norm(i.text) === 'appreciations');
    const pupilHeader = all.find(i => norm(i.text) === 'eleve'), classHeader = all.find(i => norm(i.text) === 'clas');
    const positionHeader = all.find(i => norm(i.text) === 'pos');
    if (!mat || !appreciation || !pupilHeader || !classHeader || !positionHeader) throw new Error(`Structure du bulletin non reconnue sur la page ${page.number}. Vérifiez le document avant import.`);
    const footer = all.find(i => norm(i.text) === 'moyennes generales');
    const endY = footer?.y || page.height - 50;
    const body = all.filter(i => i.y > mat.y + 6 && i.y < endY - 1);
    const subjectX = Math.min(...body.filter(i => i.x < positionHeader.x - 10).map(i => i.x));
    const anchors = body.filter(i => Math.abs(i.x - subjectX) < 4 && /[A-ZÀ-Ÿ]/.test(i.text) && i.text === i.text.toUpperCase() && !/^M\./.test(i.text));
    if (!anchors.length) throw new Error('Aucune matière reconnue dans le bulletin.');
    const rightStarts = body.filter(i => i.x > page.width * .60 && i.x < appreciation.x).map(i => i.x);
    const appreciationX = rightStarts.length ? Math.min(...rightStarts) : page.width * .635;
    const texts = items => lines(items, 1.5).map(l => l.text.trim()).join('\n').trim();
    for (let index = 0; index < anchors.length; index++) {
      const anchor = anchors[index], bottom = anchors[index + 1]?.y || endY;
      const band = body.filter(i => i.y >= anchor.y - 1 && i.y < bottom - 1);
      const teacher = band.filter(i => i.x < positionHeader.x - 8 && /^(M\.|Mme\b|Mlle\b)/.test(i.text)).map(i => i.text).join(' ');
      const studentResults = band.filter(i => i.x >= pupilHeader.x - 4 && i.x < classHeader.x - 3).map(i => ({ y: i.y, ...grade(i.text) }));
      const classResults = band.filter(i => i.x >= classHeader.x - 4 && i.x < classHeader.x + 18).map(i => ({ y: i.y, ...grade(i.text.match(/^(\d+(?:[,.]\d+)?|N\.Not(?:é)?|Abs|Disp)\b/)?.[1] || i.text) }));
      subjects.push({ subject: anchor.text.trim(), teacher, appreciation: texts(band.filter(i => i.x >= appreciationX - 1)) || null,
        studentResults, classResults, positionRaw: texts(band.filter(i => i.x >= positionHeader.x - 5 && i.x < pupilHeader.x - 5)) || null,
        sourcePage: page.number, sourceRow: subjects.length + 1 });
    }
    const headerItems = all.filter(i => i.y < mat.y - 4);
    headerCandidates.push(...lines(headerItems).map(l => l.text), ...headerItems.map(i => i.text));
    const classMatch = texts(headerItems).match(/\b([3456]\s*[A-Z0-9]+)\s*\(\s*\d+\s+élèves?\)/i);
    if (classMatch) sourceClass = classMatch[1];
    const globalHeader = all.find(i => /^Appréciation globale\s*:/i.test(i.text));
    if (globalHeader) {
      const stop = all.filter(i => i.y > globalHeader.y && /^(Le chef d|©|Décision du conseil)/i.test(i.text)).sort((a, b) => a.y - b.y)[0]?.y || page.height - 20;
      generalAppreciation = texts(all.filter(i => i.y >= globalHeader.y - 1 && i.y < stop - 1)).replace(/^Appréciation globale\s*:\s*/i, '');
    }
    if (footer) {
      const band = all.filter(i => Math.abs(i.y - footer.y) < 2);
      generalMeans = { student: grade(band.find(i => i.x >= pupilHeader.x - 4 && i.x < classHeader.x - 3)?.text), class: grade(band.find(i => i.x >= classHeader.x - 4 && i.x < classHeader.x + 18)?.text) };
    }
  }
  return { profile: 'bulletin', label: 'Bulletin scolaire PDF', year: meta.year, trimester: meta.trimester, sourceClass,
    rows: [{ label: 'Élève du bulletin — identité à confirmer', sourceRow: 1, identityCandidates: headerCandidates, subjects, generalAppreciation, generalMeans }],
    warnings: ['Vérifiez les matières, les avis et le trimestre dans l’aperçu avant validation.', 'Un avis importé ne remplace pas votre synthèse personnelle. Les cases vides ne deviennent pas des appréciations.'] };
}
export async function fileHash(file) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join(''); }

export function importProblems(parsed, mappings, targetClass, year, pupils) {
  const problems = [];
  if (!targetClass) return ['Choisissez une classe PP.'];
  if (parsed.year && yearKey(parsed.year) !== yearKey(year)) problems.push(`Année du document : ${parsed.year}. Le suivi actif est ${year}. Ce document ne sera pas classé dans la mauvaise année.`);
  if (parsed.profile === 'bulletin' && (!parsed.year || ![1, 2, 3].includes(parsed.trimester))) problems.push('Année scolaire ou trimestre non reconnu : import bloqué.');
  const classKey = s => norm(s).replace(/\s/g, '').replace(/^([3456])e(?=[a-z])/, '$1');
  if (parsed.sourceClass && !classKey(targetClass.name).includes(classKey(parsed.sourceClass))) problems.push(`Classe du bulletin : ${parsed.sourceClass}. Vérifiez la classe choisie (${targetClass.name}).`);
  const ids = new Set(pupils.map(p => p.id)), used = new Set();
  if (mappings.length !== parsed.rows.length) problems.push('Correspondances incomplètes : vérifiez toutes les lignes.');
  mappings.forEach((id, i) => {
    if (id === 'skip') return;
    if (!ids.has(id)) problems.push(`Ligne ${i + 1} : choisissez l’élève ou « Ignorer ». `);
    else if (used.has(id)) problems.push(`Ligne ${i + 1} : cet élève est déjà associé à une autre ligne du fichier.`);
    else used.add(id);
  });
  if (!used.size) problems.push('Sélectionnez au moins un élève à traiter.');
  return problems;
}
export async function parseFile(file) {
  if (!file?.size || file.size > 20 * 1048576) throw new Error('Choisissez un fichier non vide de 20 Mo maximum.');
  if (/\.csv$/i.test(file.name)) {
    const bytes = await file.arrayBuffer(); let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder('windows-1252').decode(bytes); }
    return parseRosterCSV(text);
  }
  if (!/\.pdf$/i.test(file.name)) throw new Error('Choisissez un CSV Pronote ou un bulletin PDF.');
  const pages = await readPDF(file), meta = extractMeta(pages);
  if (!/Bulletin du\s+\d/i.test(meta.text)) throw new Error('Ce PDF n’est pas un bulletin reconnu. Les récapitulatifs d’assiduité et de punitions feront l’objet de profils d’import distincts ; aucune donnée n’a été enregistrée.');
  return parseBulletin(pages);
}
