// Règles pures du suivi PP : réutilisables dans les tests sans navigateur.
export const PP_TOOLS = [
  { key: 'actions', label: 'Actions à suivre', description: 'Échéances, démarches et relances.' },
  { key: 'notes', label: 'Notes et progrès', description: 'Notes personnelles et faits positifs.' },
  { key: 'carnet', label: 'Carnet scolaire', description: 'Observations, encouragements et défauts de carnet.' },
  { key: 'documents', label: 'Documents', description: 'PAP, PPRE, GEVA-Sco, PAI, PPS et autres pièces.' },
  { key: 'conseils', label: 'Conseils de classe', description: 'Avis et synthèses des trois trimestres.' },
];
export const DOCUMENT_TYPES = ['PAP', 'PPRE', 'GEVA-Sco', 'PAI', 'PPS', 'Bulletin', 'Mot du carnet', 'Autre'];
export const CARNET_TYPES = ['Observation', 'Encouragement', 'Défaut de carnet'];
export const yearKey = value => String(value || '').replace(/\D/g, '');
export const isPPClass = (c, year) => !!c && yearKey(c.ppYear) === yearKey(year) && !!yearKey(c.ppYear)
  && (!c.year || yearKey(c.year) === yearKey(year));

// Chaque sauvegarde de texte est une nouvelle version. Deux éditions hors ligne
// issues de la même version restent deux feuilles visibles après fusion Drive.
export function revisionHeads(records) {
  const superseded = new Set(records.flatMap(r => r.parents || []));
  return records.filter(r => !superseded.has(r.id)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.id.localeCompare(b.id));
}
export function isOverdue(task, today) { return task.kind === 'task' && task.status !== 'done' && !!task.due && task.due < today; }
export function validISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const normalizeDocType = value => /^(gev[as]*co|geva-sco)$/i.test(String(value).replace(/\s/g, '')) ? 'GEVA-Sco' : value;

// Europe/Paris : calcul à partir des composantes locales, sans supposer UTC+1.
function parisParts(ms) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, +p.value]));
}
export function parisInstant(date, time) {
  if (!validISODate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) throw new Error('Date ou heure invalide.');
  const [y, m, d] = date.split('-').map(Number), [h, min] = time.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, h, min);
  let stamp = target;
  for (let i = 0; i < 4; i++) { const p = parisParts(stamp); stamp += target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute); }
  const p = parisParts(stamp);
  if (p.year !== y || p.month !== m || p.day !== d || p.hour !== h || p.minute !== min) throw new Error('Cette heure n’existe pas lors du changement d’heure.');
  return stamp;
}
export function meetingReminders(event) {
  if (!event.studentId || event.cancelled) return [];
  const day = new Date(event.date + 'T12:00:00Z'); day.setUTCDate(day.getUTCDate() - 1);
  return [parisInstant(day.toISOString().slice(0, 10), '16:00'), parisInstant(event.date, event.debut) - 3600000];
}
