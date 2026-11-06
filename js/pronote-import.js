// Lecture locale uniquement ; aucune requête réseau vers Pronote ou un service d'OCR.
import {reportGroups,mergeConfirmed} from './pp-import-merge.js';
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
      const items = content.items.filter(i => i.str?.trim()).map(i => { const matrix = library.Util.transform(viewport.transform, i.transform); return { text: i.str, x: matrix[4], y: matrix[5], width: i.width, height: i.height, fontName: i.fontName }; });
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
export const isMasteryLayout = layout => ['competences', 'competences-programme', 'positions'].includes(layout);
export const previousResultText = result => (result.nonRepresentative ? 'NR · ' : '') + (result.mastery ? `${result.mastery.value}/4 · ${result.mastery.label}` : result.results?.map(g => g.raw).join(' / ') || 'non renseigné');
export function annualBulletinRows(sources) {
  const latest = [1, 2, 3].map(t => sources.filter(s => s.trimester === t).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]);
  const rows = new Map();
  latest.forEach((source, index) => {
    const occurrences = new Map();
    for (const s of source?.payload?.subjects || []) {
      const base = norm(s.subject) + '|' + norm(s.teacher), occurrence = (occurrences.get(base) || 0) + 1;
      occurrences.set(base, occurrence); const key = base + '|' + occurrence;
      if (!rows.has(key)) rows.set(key, { subject: s.subject, teacher: s.teacher, periods: [null, null, null] });
      const grades = s.studentResults?.map(g => g.raw).join(' / ');
      rows.get(key).periods[index] = { text: (s.nonRepresentative ? 'NR · ' : '') + ([grades, s.mastery ? `${s.mastery.value}/4` : ''].filter(Boolean).join(' · ') || 'Non renseigné'), testMode: source.testMode === true };
    }
  });
  return [...rows.values()];
}
export function extractMeta(pages) {
  const text = pages.flatMap(p => lines(p.items).map(l => l.text)).join('\n');
  const year = text.match(/Année scolaire\s*:\s*(\d{4})\s*[\/–-]\s*(\d{4})/i);
  const trimester = text.match(/Bulletin du\s+(\d)(?:er|e|ème)?\s+Trimestre/i) || text.match(/Bulletin du\s+Trimestre\s+(\d)/i);
  const period = text.match(/Période du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})/i);
  return { year: year ? `${year[1]}–${year[2]}` : '', trimester: trimester ? +trimester[1] : null, period: period ? [period[1], period[2]] : null, text };
}
export function parseBulletin(pages) {
  const meta = extractMeta(pages), subjects = [], headerCandidates = [];
  let generalAppreciation = '', sourceClass = '', generalMeans = null, layout = '', mentionsRaw = '', orientationRaw = '', engagementsRaw = '';
  for (const page of pages) {
    const all = page.items, mat = all.find(i => norm(i.text) === 'matieres'), appreciation = all.find(i => norm(i.text) === 'appreciations');
    const pupilHeader = all.find(i => norm(i.text) === 'eleve'), classHeader = all.find(i => norm(i.text) === 'clas');
    const positionHeader = all.find(i => norm(i.text) === 'pos');
    const competencyHeader = all.find(i => norm(i.text) === 'competences evaluees');
    const detailHeader = all.find(i => norm(i.text) === 'detail des evaluations');
    const programmeHeader = all.find(i => norm(i.text).startsWith('elements du programme'));
    const notesHeader = all.find(i => norm(i.text) === 'nb');
    const evolutionHeader = all.find(i => norm(i.text) === 'evol');
    const competencyLayout = !!competencyHeader && !!detailHeader;
    if (!mat || !appreciation || (competencyLayout && !positionHeader) || (!competencyLayout && (!pupilHeader || !classHeader))) throw new Error(`Structure du bulletin non reconnue sur la page ${page.number}. Vérifiez le document avant import.`);
    const pupilSymbols = pupilHeader && classHeader && all.some(i => i.y > mat.y + 6 && i.x >= pupilHeader.x - 4 && i.x < classHeader.x - 3 && /[\uE000-\uF8FF]/.test(i.text));
    const pageLayout = competencyLayout ? (programmeHeader ? 'competences-programme' : 'competences') : pupilSymbols ? 'positions' : notesHeader && evolutionHeader ? 'moyennes-detaillees' : 'moyennes';
    const masteryLayout = isMasteryLayout(pageLayout), firstDataX = positionHeader?.x || notesHeader?.x || pupilHeader.x;
    if (layout && layout !== pageLayout) throw new Error('Le PDF mélange plusieurs présentations : importez chaque bulletin séparément.');
    layout = pageLayout;
    const footer = all.find(i => norm(i.text) === 'moyennes generales');
    const footerMarkers = all.filter(i => i.y > mat.y + 25 && /^(tres bonne maitrise|maitrise satisfaisante|maitrise fragile|maitrise insuffisante|appreciation globale|aucune absence|absences|engagements|nr moyenne non representative|intentions d orientation)\b/.test(norm(i.text)));
    const endY = footer?.y || Math.min(...footerMarkers.map(i => i.y), page.height - 50);
    const body = all.filter(i => i.y > mat.y + 6 && i.y < endY - 1);
    const subjectX = Math.min(...body.filter(i => i.x < firstDataX - 10).map(i => i.x));
    const candidates = body.filter(i => Math.abs(i.x - subjectX) < 4 && /[A-ZÀ-Ÿ]/.test(i.text) && i.text === i.text.toUpperCase() && !/^M[.\s]/.test(i.text));
    const fonts = new Map(); candidates.forEach(i => { if (i.fontName) fonts.set(i.fontName, (fonts.get(i.fontName) || 0) + 1); });
    const subjectFont = [...fonts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const anchors = body.filter(i => Math.abs(i.x - subjectX) < 4 && /[A-Za-zÀ-ÿ]/.test(i.text) && !/^M[.\s]|^Mme\b|^Mlle\b/.test(i.text) && (subjectFont ? i.fontName === subjectFont : candidates.includes(i)));
    if (!anchors.length) throw new Error('Aucune matière reconnue dans le bulletin.');
    const rightStarts = body.filter(i => i.x > (competencyLayout ? positionHeader.x + 10 : page.width * .60) && i.x < appreciation.x && /[A-Za-zÀ-ÿ]/.test(i.text)).map(i => i.x);
    const appreciationX = rightStarts.length ? Math.min(...rightStarts) : page.width * .635;
    const texts = items => lines(items, 1.5).map(l => l.text.trim()).join('\n').trim();
    for (let index = 0; index < anchors.length; index++) {
      const anchor = anchors[index], bottom = anchors[index + 1]?.y || endY;
      const band = body.filter(i => i.y >= anchor.y - 3 && i.y < bottom - 3);
      const firstColumnEnd = competencyLayout ? (programmeHeader ? programmeHeader.x - 8 : mat.x + 30) : firstDataX - 5;
      const teacher = texts(band.filter(i => i.x < firstColumnEnd && i !== anchor && !/^(écrit|ecrit|oral)$/i.test(i.text.trim()))).replace(/\n/g, ' ');
      const studentResults = masteryLayout ? [] : band.filter(i => i.x >= pupilHeader.x - 4 && i.x < classHeader.x - 3).map(i => ({ y: i.y, ...grade(i.text) }));
      const classResults = masteryLayout ? [] : band.filter(i => i.x >= classHeader.x - 4 && i.x < classHeader.x + 18).map(i => ({ y: i.y, ...grade(i.text.match(/^(\d+(?:[,.]\d+)?|N\.Not(?:é)?|Abs|Disp)\b/)?.[1] || i.text) }));
      const positionItems = positionHeader ? band.filter(i => i.x >= positionHeader.x - 4 && i.x < (competencyLayout ? appreciationX - 2 : pupilHeader.x - 5)) : masteryLayout ? band.filter(i => i.x >= pupilHeader.x - 4 && i.x < classHeader.x - 3) : [];
      const positionValues = [...new Set(positionItems.filter(i => /^[1-4]$/.test(i.text.trim())).map(i => Number(i.text.trim())))];
      const mastery = (masteryLayout || positionHeader) && positionValues.length === 1 ? { value: positionValues[0], label: ['Maîtrise insuffisante', 'Maîtrise fragile', 'Maîtrise satisfaisante', 'Très bonne maîtrise'][positionValues[0] - 1] } : null;
      const competenceThreshold = competencyLayout ? (programmeHeader ? (programmeHeader.x + competencyHeader.x) / 2 : mat.x + 35) : null;
      const competenceItems = competencyLayout ? band.filter(i => i.x > competenceThreshold && i.x < detailHeader.x - 5 && /[A-Za-zÀ-ÿ]/.test(i.text)) : [];
      const headerZone = all.filter(i => Math.abs(i.y - mat.y) < 12);
      const previousHeaders = headerZone.filter(i => /^T[123]$/.test(i.text) && Number(i.text[1]) < meta.trimester).sort((a, b) => a.x - b.x);
      const previousResults = !competencyLayout ? previousHeaders.map((h, n) => {
        const cell = band.filter(i => i.x >= h.x - 5 && i.x < (previousHeaders[n + 1]?.x || pupilHeader.x) - 5 && !/[\uE000-\uF8FF]/.test(i.text));
        const values = [...new Set(cell.filter(i => /^[1-4]$/.test(i.text.trim())).map(i => Number(i.text.trim())))];
        const nonRepresentative = band.some(i => i.x >= h.x - 15 && i.x < (previousHeaders[n + 1]?.x || pupilHeader.x) - 15 && /^N\.?R\.?$/i.test(i.text.trim()));
        return { trimester: Number(h.text[1]), results: masteryLayout ? [] : cell.filter(i => !/^N\.?R\.?$/i.test(i.text.trim())).map(i => grade(i.text)), nonRepresentative, mastery: masteryLayout && values.length === 1 ? { value: values[0], label: ['Maîtrise insuffisante', 'Maîtrise fragile', 'Maîtrise satisfaisante', 'Très bonne maîtrise'][values[0] - 1] } : null };
      }) : [];
      const minimumHeader = headerZone.find(i => i.text.trim() === '-'), maximumHeader = headerZone.find(i => i.text.trim() === '+');
      let rangeRaw = minimumHeader && maximumHeader ? band.filter(i => i.x >= minimumHeader.x - 5 && i.x < maximumHeader.x + 12).map(i => i.text.match(/^(\d+(?:[,.]\d+)?|N\.Not)(?:\s+(\d+(?:[,.]\d+)?|N\.Not))?/)?.[0] || '').filter(Boolean).join('\n') : null;
      if (rangeRaw === '' && classHeader) {
        const merged = band.find(i => i.x >= classHeader.x - 4 && i.x < classHeader.x + 18 && /^(\d+(?:[,.]\d+)?)\s+(\d+(?:[,.]\d+)?)\s+(\d+(?:[,.]\d+)?)/.test(i.text));
        if (merged) rangeRaw = merged.text.match(/^(\d+(?:[,.]\d+)?)\s+(\d+(?:[,.]\d+)?)\s+(\d+(?:[,.]\d+)?)/).slice(2).join(' ');
      }
      subjects.push({ subject: anchor.text.trim(), teacher, appreciation: texts(band.filter(i => i.x >= appreciationX - 1)) || null,
        studentResults, classResults, mastery, competenciesRaw: texts(competenceItems) || null, evaluationDetail: masteryLayout ? 'graphic-in-source' : null, previousResults, rangeRaw,
        nonRepresentative: !!pupilHeader && band.some(i => i.x >= pupilHeader.x - 15 && i.x < classHeader.x - 3 && /^N\.?R\.?$/i.test(i.text.trim())),
        noteCountRaw: notesHeader ? texts(band.filter(i => i.x >= notesHeader.x - 4 && i.x < (evolutionHeader ? evolutionHeader.x - 2 : (previousHeaders[0]?.x || pupilHeader?.x || notesHeader.x + 35) - 15) && /^\d+\s*\/\s*\d+$/.test(i.text.trim()))) || null : null,
        positionRaw: texts(positionItems.filter(i => !/[\uE000-\uF8FF]/.test(i.text))) || null,
        sourcePage: page.number, sourceRow: subjects.length + 1 });
    }
    const headerItems = all.filter(i => i.y < mat.y - 4);
    headerCandidates.push(...lines(headerItems).map(l => l.text), ...headerItems.map(i => i.text));
    const classMatch = texts(headerItems).match(/\b([3456]\s*[A-Z0-9]+)\s*\(\s*\d+\s+élèves?\)/i);
    const standaloneClass = headerItems.find(i => /^[3456]\s*[A-Z](?:\s*\d+)?$/i.test(i.text.trim()));
    if (classMatch || standaloneClass) sourceClass = classMatch?.[1] || standaloneClass.text.trim();
    const globalHeader = all.find(i => /^Appréciation globale\s*:/i.test(i.text));
    if (globalHeader) {
      const stop = all.filter(i => i.y > globalHeader.y && /^(Le chef d|©|Décision du conseil|Mentions\s*:|Engagements\s*:)/i.test(i.text)).sort((a, b) => a.y - b.y)[0]?.y || page.height - 20;
      generalAppreciation = texts(all.filter(i => i.y >= globalHeader.y - 1 && i.y < stop - 1)).replace(/^Appréciation globale\s*:\s*/i, '');
    }
    for (const [field, pattern] of [['mentions', /^Mentions\s*:/i], ['orientation', /^Intentions d.orientation/i], ['engagements', /^Engagements\s*:/i]]) {
      const start = all.find(i => pattern.test(i.text));
      if (!start) continue;
      const stop = all.filter(i => i.y > start.y + 2 && /^(Le chef d|©|Appréciation globale|Absences|Aucune absence|Mentions\s*:|Engagements\s*:)/i.test(i.text)).sort((a, b) => a.y - b.y)[0]?.y || page.height - 30;
      const value = texts(all.filter(i => i.y >= start.y - 1 && i.y < stop - 1));
      if (field === 'mentions') mentionsRaw = value;
      if (field === 'orientation') orientationRaw = value;
      if (field === 'engagements') engagementsRaw = value;
    }
    if (footer && !masteryLayout) {
      const band = all.filter(i => Math.abs(i.y - footer.y) < 2);
      generalMeans = { student: grade(band.find(i => i.x >= pupilHeader.x - 4 && i.x < classHeader.x - 3)?.text), class: grade(band.find(i => i.x >= classHeader.x - 4 && i.x < classHeader.x + 18)?.text) };
    }
  }
  return { profile: 'bulletin', layout, label: isMasteryLayout(layout) ? 'Bulletin par compétences PDF' : 'Bulletin avec moyennes PDF', year: meta.year, trimester: meta.trimester, sourceClass,
    rows: [{ label: 'Élève du bulletin — identité à confirmer', sourceRow: 1, identityCandidates: headerCandidates, subjects, generalAppreciation, generalMeans, mentionsRaw, orientationRaw, engagementsRaw }],
    warnings: ['Vérifiez les matières, les avis et le trimestre dans l’aperçu avant validation.', 'Un avis importé ne remplace pas votre synthèse personnelle. Les cases vides ne deviennent pas des appréciations.'] };
}
export async function fileHash(file) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join(''); }

export const importClassKey = value => norm(value).replace(/^([3456])e\s+([a-z])(?=\s|$)/,'$1 $2').replace(/^([3456])e([a-z])$/,'$1$2').replace(/\s/g,'');
export const importClassMatches = (source,target) => !source || importClassKey(target).includes(importClassKey(source));
export function importClassDifferences(parsed,mappings,targetClass) {
  if(!targetClass)return [];
  return [...new Set([parsed.sourceClass,...parsed.rows.filter((_,i)=>mappings[i]!=='skip').map(r=>r.sourceClass)].filter(source=>source&&!importClassMatches(source,targetClass.name)))];
}
export function importProblems(parsed, mappings, targetClass, year, pupils, { testMode = false, classCorrespondence = null, mergeGroups = [] } = {}) {
  const problems = [];
  if (!targetClass) return ['Choisissez une classe PP.'];
  if (testMode !== true && parsed.year && yearKey(parsed.year) !== yearKey(year)) problems.push(`Année du document : ${parsed.year}. Le suivi actif est ${year}. Ce document ne sera pas classé dans la mauvaise année.`);
  if (parsed.profile === 'bulletin' && (!parsed.year || ![1, 2, 3].includes(parsed.trimester))) problems.push('Année scolaire ou trimestre non reconnu : import bloqué.');
  const matches = source => importClassMatches(source,targetClass.name)||(classCorrespondence?.classId===targetClass.id&&Array.isArray(classCorrespondence.sourceClasses)&&classCorrespondence.sourceClasses.some(label=>norm(label)===norm(source)));
  if (testMode !== true && parsed.sourceClass && !matches(parsed.sourceClass)) problems.push(`Classe du document : ${parsed.sourceClass}. Vérifiez la classe choisie (${targetClass.name}) et confirmez sa correspondance si elle a un nom personnalisé.`);
  const ids = new Set(pupils.map(p => p.id)), used = new Set();
  const grouped=new Map(reportGroups(parsed,mappings).map(group=>[group.studentId,group]));
  if (mappings.length !== parsed.rows.length) problems.push('Correspondances incomplètes : vérifiez toutes les lignes.');
  mappings.forEach((id, i) => {
    if (id === 'skip') return;
    if (testMode !== true && parsed.rows[i]?.sourceClass && !matches(parsed.rows[i].sourceClass)) problems.push(`Ligne ${i+1} : confirmez la correspondance de la classe source avec la classe choisie, ou ignorez cette ligne.`);
    if (!ids.has(id)) problems.push(`Ligne ${i + 1} : choisissez l’élève ou « Ignorer ». `);
    else if (used.has(id)&&!mergeConfirmed(parsed,grouped.get(id),{mergeGroups})) problems.push(`Ligne ${i + 1} : cet élève est déjà associé à une autre ligne du fichier. Confirmez le regroupement si ces lignes se complètent.`);
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
  if (/Récapitulatif des (?:absences|punitions)/i.test(meta.text)) return (await import('./pronote-recap.js')).parseRecap(pages);
  if (!meta.trimester) throw new Error('Ce PDF n’est pas un bulletin reconnu. Les récapitulatifs d’assiduité et de punitions feront l’objet de profils d’import distincts ; aucune donnée n’a été enregistrée.');
  return parseBulletin(pages);
}
