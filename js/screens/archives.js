// Administration → Archives des années : archiver l'année en cours, consulter une année passée en lecture seule
// (toute l'app : trombinoscope, fiches élèves, projets, impressions, CSV), récupérer une archive depuis Drive ou
// depuis un fichier. Voir backup.js (creerArchive, consulter) et db.js (table archives, openArchive).
import * as db from '../db.js';
import * as model from '../model.js';
import * as drive from '../drive.js';
import * as backup from '../backup.js';
import { html, toast, confirmDialog, fmtDate } from '../ui.js';
import { icon, backLink, saveStatus } from '../components.js';
import { go, refresh } from '../nav.js';

let list = null;       // archives de cet appareil (null : à charger)
let driveList = null;  // archives présentes sur Drive (null : pas encore regardé)
let busy = '';
let loading = false;

const mo = n => (n / 1048576).toFixed(n > 10485760 ? 0 : 1).replace('.', ',') + ' Mo';
const plural = (n, one, many) => n + ' ' + (n > 1 ? many : one);
const yearOfFile = name => (name.match(/carnet-archive-(\d{4})-(\d{4})/) || []).slice(1).join('–');

async function load() {
  if (loading) return;
  loading = true;
  try { list = await db.archivesList(); } catch (e) { list = []; toast({ text: 'Archives illisibles : ' + e.message, ms: 6000 }); }
  loading = false;
  refresh();
}

// Archive l'année en cours. Mode Drive : copie dans le dossier Drive. Mode manuel : le fichier est aussi proposé
// (enregistrer / télécharger), car l'archive ne serait sinon que sur cet appareil.
export async function archiverMaintenant(onBusy = () => {}) {
  const year = model.schoolYear();
  let rec = null;
  if (drive.isDrive()) {
    onBusy('Préparation de l’archive…');
    rec = await backup.creerArchive();
    try {
      if (!drive.connected()) await drive.connect(true);
      onBusy('Envoi de l’archive sur Google Drive…');
      rec.driveId = await drive.envoyerArchive(backup.archiveFileName(year), rec.blob, rec.driveId);
      await db.saveArchive(rec);
      return { rec, text: `Année ${year} archivée sur cet appareil et dans Google Drive` };
    } catch (e) {
      return { rec, text: `Année ${year} archivée sur cet appareil. Copie Drive impossible (${e.message}) : réessayez plus tard depuis Administration → Archives.`, ms: 10000 };
    }
  }
  const r = await backup.giveFile(async () => { onBusy('Préparation de l’archive…'); rec = await backup.creerArchive(); return rec.blob; }, backup.archiveFileName(year));
  if (!rec) rec = await backup.creerArchive(); // fenêtre « Enregistrer » refermée : l'archive est quand même gardée dans l'app
  if (r.how !== 'cancelled') backup.markBackupDone();
  return { rec, text: `Année ${year} archivée dans l’app${r.how !== 'cancelled' ? ' · ' + backup.givenMessage(r, 'Copie') : ''}` };
}

function row(a) {
  const s = a.summary || {};
  const ouverte = db.archive() && db.archive().id === a.id;
  return html`<div class="etab-row arch-row">
    <span class="arch-ic">${icon.archive}</span>
    <div class="grow">
      <div class="strong-15">Année ${a.year}${ouverte ? html` <span class="chip accent">consultée</span>` : ''}</div>
      <div class="muted small">archivée le ${fmtDate(a.createdAt)} · ${plural(s.classes || 0, 'classe', 'classes')} · ${plural(s.students || 0, 'élève', 'élèves')}
        · ${plural(s.photos || 0, 'photo', 'photos')} · ${mo(a.size || 0)}${a.driveId ? ' · copie dans Drive ✓' : ''}</div>
    </div>
    ${ouverte ? '' : html`<button type="button" class="btn accent small" data-click="consulter" data-id="${a.id}">Consulter</button>`}
    <button type="button" class="btn soft small" data-click="fichier" data-id="${a.id}">Fichier</button>
    <button type="button" class="icon-btn" data-click="supprimer" data-id="${a.id}" aria-label="Retirer l’archive ${a.year} de cet appareil">${icon.trash}</button>
  </div>`;
}

export default {
  render() {
    if (list === null) load();
    const year = model.schoolYear();
    const ar = db.archive();
    const cette = (list || []).find(a => a.id === backup.archiveId(year));
    const ici = new Set((list || []).map(a => a.id));
    const surDrive = (driveList || []).filter(f => !ici.has(backup.archiveId(yearOfFile(f.name))));
    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/admin', 'Administration')}
        <div class="title ellipsis">Archives des années</div>
        <div class="spacer"></div>${ar ? '' : saveStatus()}
      </header>
      <main class="content settings-page" data-scroll="archives">
        <div class="set-block">
          <div class="muted small">Une archive garde <strong>toute une année</strong> : classes, élèves et photos, observations, absences et retards,
            projets, séances, évaluations, notes et emploi du temps. Vous pouvez la <strong>consulter</strong> à tout moment dans l’app, en lecture seule,
            sans toucher à l’année en cours : fiches élèves, résultats de projets, impressions et fichiers CSV comme d’habitude.</div>
          ${ar ? html`<div class="abs-info">Vous consultez l’archive ${ar.year}. Le bandeau en bas de l’écran permet de revenir à l’année en cours.</div>`
            : html`<div class="row-center wrap">
              <button type="button" class="btn accent" data-click="archiver">${icon.archive}${cette ? `Archiver à nouveau l’année ${year}` : `Archiver l’année ${year} maintenant`}</button>
              <span class="muted small">${cette ? `Déjà archivée le ${fmtDate(cette.createdAt)} : la nouvelle archive remplacera l’ancienne.` : 'À faire en fin d’année, avant « Nouvelle année » (Sauvegarde et exports). Possible à tout moment.'}</span>
            </div>`}
        </div>
        <div class="set-block">
          <div class="set-title">Sur cet appareil</div>
          ${list === null ? html`<div class="muted">Chargement…</div>` : list.length ? list.map(row) : html`<div class="muted">Aucune archive pour l’instant.</div>`}
        </div>
        ${drive.isDrive() ? html`<div class="set-block">
          <div class="set-title">Dans Google Drive</div>
          <div class="muted small">Les archives faites sur vos autres appareils sont dans le dossier Drive « Carnet de classe ».</div>
          ${driveList === null ? html`<button type="button" class="btn soft self-start" data-click="voirDrive">Voir les archives dans Drive</button>`
            : surDrive.length ? surDrive.map(f => html`<div class="etab-row arch-row"><span class="arch-ic">${icon.archive}</span>
                <div class="grow"><div class="strong-15">Année ${yearOfFile(f.name) || f.name}</div><div class="muted small">${f.size ? mo(+f.size) + ' · ' : ''}modifiée le ${fmtDate(f.modifiedTime)}</div></div>
                <button type="button" class="btn accent small" data-click="recuperer" data-id="${f.id}">Récupérer sur cet appareil</button></div>`)
            : html`<div class="muted">Toutes les archives de Drive sont déjà sur cet appareil.</div>`}
        </div>` : ''}
        <div class="set-block">
          <div class="set-title">Ouvrir un fichier d’archive</div>
          <div class="muted small">Un fichier « carnet-archive-… .json » téléchargé une année précédente (ou une sauvegarde de fin d’année) :
            il est ajouté aux archives, sans rien changer à l’année en cours.</div>
          <button type="button" class="btn soft self-start" data-click="importFile"${ar ? ' disabled' : ''}>Choisir un fichier…</button>
        </div>
      </main>
      ${busy ? html`<div class="busy"><div class="busy-box"><span class="spinner"></span>${busy}</div></div>` : ''}
    </div>`;
  },

  leave() { list = null; driveList = null; busy = ''; },

  actions: {
    async archiver() {
      try {
        const r = await archiverMaintenant(t => { busy = t; refresh(); });
        busy = ''; list = null; refresh();
        toast({ text: r.text, ms: r.ms || 6000 });
      } catch (e) { busy = ''; refresh(); toast({ text: 'Archive impossible : ' + e.message, ms: 8000 }); }
    },
    async consulter(el) {
      busy = 'Ouverture de l’archive…'; refresh();
      try {
        const rec = await db.getArchive(el.dataset.id);
        await backup.consulter(rec);
        busy = ''; list = null;
        go('#/classes');
        toast({ text: `Archive ${rec.year} ouverte en lecture seule`, ms: 4000 });
      } catch (e) { busy = ''; refresh(); toast({ text: e.message, ms: 7000 }); }
    },
    async fichier(el) {
      const rec = await db.getArchive(el.dataset.id);
      try {
        const r = await backup.giveFile(rec.blob, backup.archiveFileName(rec.year));
        if (r.how !== 'cancelled') toast({ text: backup.givenMessage(r, 'Archive') });
      } catch (e) { toast({ text: 'Fichier impossible : ' + e.message, ms: 6000 }); }
    },
    async supprimer(el) {
      const rec = await db.getArchive(el.dataset.id);
      if (!rec) return;
      if (db.archive() && db.archive().id === rec.id) { toast({ text: 'Revenez d’abord à l’année en cours.' }); return; }
      if (!(await confirmDialog({
        title: `Retirer l’archive ${rec.year} de cet appareil ?`,
        text: rec.driveId ? 'La copie dans Google Drive est conservée : vous pourrez la récupérer.'
          : 'Elle n’existe sur aucun autre support connu : pensez à garder le fichier (bouton « Fichier ») avant de la retirer.',
        ok: 'Retirer', danger: true,
      }))) return;
      await db.deleteArchive(rec.id);
      list = null; refresh();
      toast({ text: `Archive ${rec.year} retirée de cet appareil` });
    },
    async voirDrive() {
      busy = 'Lecture du dossier Drive…'; refresh();
      try { if (!drive.connected()) await drive.connect(true); driveList = await drive.archivesDrive(); }
      catch (e) { toast({ text: e.message, ms: 7000 }); }
      busy = ''; refresh();
    },
    async recuperer(el) {
      busy = 'Téléchargement de l’archive…'; refresh();
      try {
        const blob = await drive.telechargerArchive(el.dataset.id);
        const rec = await backup.importerArchive(blob, { driveId: el.dataset.id });
        list = null;
        toast({ text: `Archive ${rec.year} récupérée sur cet appareil` });
      } catch (e) { toast({ text: e.message, ms: 7000 }); }
      busy = ''; refresh();
    },
    async importFile() {
      const file = await new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json';
        input.addEventListener('change', () => resolve(input.files && input.files[0]), { once: true });
        input.click();
      });
      if (!file) return;
      busy = 'Lecture du fichier…'; refresh();
      try {
        const known = new Set((list || []).map(a => a.id));
        const rec = await backup.importerArchive(file);
        list = null;
        toast({ text: known.has(rec.id) ? `Archive ${rec.year} remplacée par ce fichier` : `Archive ${rec.year} ajoutée`, ms: 5000 });
      } catch (e) { toast({ text: e.message, ms: 7000 }); }
      busy = ''; refresh();
    },
  },
};
