// Sauvegarde et exports : fichier de sauvegarde complet, restauration, exports PDF/CSV par classe, fin d'année.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, openMenu, confirmDialog, fmtDayYear, fmtTime } from '../ui.js';
import { icon, backLink } from '../components.js';
import { go, refresh } from '../nav.js';
import * as backup from '../backup.js';

let archived = false; // archive de fin d'année téléchargée pendant cette visite
let busy = '';

function pickJson() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null), { once: true });
    input.click();
  });
}
const canShare = () => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] })); } catch (e) { return false; } };

export default {
  render() {
    const last = db.getMeta('lastBackupAt');
    const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 864e5) : null;
    const old = days == null || days >= 7;
    const classes = model.classes();
    const year = model.schoolYear();
    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/admin', 'Administration')}
        <div class="title">Sauvegarde et exports</div>
      </header>
      <main class="content edit-grid save-page">
        <section class="panel form">
          <div class="section-title">Sauvegarde</div>
          <div class="save-state${old ? ' warn' : ''}">
            <span class="status-dot"></span>
            <div class="grow">${last ? html`Dernière sauvegarde : <strong>${fmtDayYear(last)} à ${fmtTime(last)}</strong>${days >= 1 ? html` (il y a ${days} jour${days > 1 ? 's' : ''})` : ''}` : html`<strong>Aucune sauvegarde pour l’instant.</strong>`}</div>
          </div>
          <div class="muted small">Le fichier contient toutes les données et les photos de cet appareil. Gardez-le en lieu sûr (Google Drive, clé USB) : une tablette perdue ou réinitialisée, et tout serait perdu.</div>
          <div class="btn-col">
            <button type="button" class="btn accent big" data-click="save">${icon.download}Enregistrer une sauvegarde</button>
            ${canShare() ? html`<button type="button" class="btn soft" data-click="share">Envoyer la sauvegarde (Drive, e-mail…)</button>` : ''}
            <button type="button" class="btn soft" data-click="restore">Restaurer une sauvegarde…</button>
          </div>

          <div class="section-title mt">Fin d’année scolaire ${year}</div>
          <div class="muted small">1. Téléchargez l’archive de l’année. 2. Supprimez les classes : les élèves, photos, observations, séances et notes sont effacés de l’appareil. Les projets (définitions et critères) sont gardés pour l’année suivante.</div>
          <div class="btn-col">
            <button type="button" class="btn soft" data-click="archive">${archived ? '✓ Archive téléchargée' : '1. Télécharger l’archive ' + year}</button>
            <button type="button" class="btn danger-soft" data-click="newYear" ${archived ? '' : 'disabled'}>2. Supprimer les classes et passer en ${backup.nextSchoolYear(year)}</button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head row"><span class="panel-title grow">Exports par classe</span></div>
          <div class="panel-scroll list" data-scroll="exports">
            ${classes.map(c => html`<div class="export-row">
              <span class="lr-name">${c.name}</span>
              <div class="export-btns">
                <a class="btn soft small" href="#/imprimer/recap/${c.id}">Récapitulatif PDF</a>
                <button type="button" class="btn soft small" data-click="recapCsv" data-id="${c.id}">Récapitulatif CSV</button>
                <a class="btn soft small" href="#/imprimer/fiches/${c.id}">Fiches élèves PDF</a>
                <button type="button" class="btn soft small" data-click="pronote" data-id="${c.id}">Compétences Pronote</button>
              </div>
            </div>`)}
            ${classes.length ? '' : html`<div class="empty-block">Aucune classe.</div>`}
            <div class="muted small pad">Les PDF s’ouvrent dans une page d’impression : choisissez « Enregistrer au format PDF » comme imprimante. Les CSV s’ouvrent avec un tableur. La fiche d’un seul élève est aussi disponible depuis son détail.</div>
          </div>
        </section>
      </main>
      ${busy ? html`<div class="busy"><div class="busy-box"><span class="spinner"></span>${busy}</div></div>` : ''}
    </div>`;
  },

  leave() { archived = false; },

  actions: {
    async save() { await doBackup(false); },
    async share() { await doBackup(true); },
    async restore() {
      const file = await pickJson();
      if (!file) return;
      let res;
      try { res = await backup.readBackup(file); } catch (e) { toast({ text: e.message, ms: 5000 }); return; }
      const s = res.summary;
      const ok = await confirmDialog({
        title: 'Restaurer cette sauvegarde ?',
        text: `Sauvegarde du ${s.date ? fmtDayYear(s.date) : '?'}${s.year ? ' (année ' + s.year + ')' : ''} : ${s.classes} classes, ${s.students} élèves, ${s.photos} photos, ${s.projects} projets. Toutes les données actuelles de cet appareil seront remplacées.`,
        ok: 'Remplacer et restaurer', danger: true,
      });
      if (!ok) return;
      busy = 'Restauration…'; refresh();
      try { await backup.restore(res.snap); toast({ text: 'Sauvegarde restaurée' }); }
      catch (e) { toast({ text: 'Restauration impossible : ' + e.message, ms: 6000 }); }
      busy = ''; refresh();
    },
    recapCsv(el) { const { blob, name } = backup.recapCsv(el.dataset.id); backup.giveFile(blob, name); toast({ text: 'Fichier ' + name + ' enregistré' }); },
    pronote(el) {
      const list = model.selectableAssignments(el.dataset.id, ['cours', 'fini', 'avenir']);
      if (!list.length) { toast({ text: 'Aucun projet dans cette classe' }); return; }
      openMenu({
        anchor: el, width: 340, align: 'right', title: 'Projet à exporter',
        items: list.map(a => ({ label: db.get('projects', a.projectId).title, sub: model.STATUS[a.status], onPick: () => {
          const { blob, name } = backup.pronoteCsv(a.id);
          backup.giveFile(blob, name);
          toast({ text: 'Fichier ' + name + ' enregistré' });
        } })),
      });
    },
    async archive() {
      busy = 'Préparation de l’archive…'; refresh();
      try {
        const blob = await backup.backupBlob();
        await backup.giveFile(blob, backup.backupName('carnet-archive-' + model.schoolYear().replace(/\D+/g, '-')));
        backup.markBackupDone();
        archived = true;
      } catch (e) { toast({ text: 'Archive impossible : ' + e.message }); }
      busy = ''; refresh();
    },
    async newYear() {
      const next = backup.nextSchoolYear(model.schoolYear());
      const ok = await confirmDialog({
        title: `Passer à l’année ${next} ?`,
        text: `Les ${db.all('classes').length} classes, leurs élèves, photos, observations, séances, groupes et notes seront supprimés de cet appareil. Vérifiez que l’archive est bien dans vos téléchargements. Les projets sont conservés.`,
        ok: 'Supprimer les classes', danger: true,
      });
      if (!ok) return;
      const undo = backup.startNewYear();
      archived = false;
      go('#/');
      toast({ text: `Année ${next} commencée`, undo: async () => { await undo(); refresh(); } });
    },
  },
};

async function doBackup(share) {
  busy = 'Préparation de la sauvegarde…'; refresh();
  try {
    const blob = await backup.backupBlob();
    const r = await backup.giveFile(blob, backup.backupName(), { share });
    if (r !== 'cancelled') {
      backup.markBackupDone();
      toast({ text: r === 'shared' ? 'Sauvegarde envoyée' : `Sauvegarde enregistrée dans les téléchargements (${(blob.size / 1048576).toFixed(1).replace('.', ',')} Mo)` });
    }
  } catch (e) { toast({ text: 'Sauvegarde impossible : ' + e.message, ms: 6000 }); }
  busy = ''; refresh();
}
