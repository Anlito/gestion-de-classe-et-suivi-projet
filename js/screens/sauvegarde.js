// Sauvegarde et exports : fichier de sauvegarde complet, restauration, exports PDF/CSV par classe, fin d'année.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, openMenu, confirmDialog, choiceDialog, fmtDayYear, fmtTime } from '../ui.js';
import * as drive from '../drive.js';
import { icon, backLink } from '../components.js';
import { go, refresh } from '../nav.js';
import * as backup from '../backup.js';

let archived = false; // archive de fin d'année téléchargée pendant cette visite
let busy = '';
let clientDraft = null; // identifiant client en cours de saisie

// ---------- Google Drive ----------
function driveView() {
  const cfg = drive.config();
  const id = clientDraft != null ? clientDraft : cfg.clientId || '';
  const ok = drive.validClientId(cfg.clientId);
  const origin = location.origin;
  const last = cfg.lastSync;
  const s = cfg.lastStats;
  return html`<div class="drive-box">
    <div class="abs-info small-text">Les données (élèves, besoins particuliers, notes, appels…) sont envoyées <strong>sans chiffrement</strong> dans votre
      Google Drive, dossier « Carnet de classe ». <strong>Ne partagez jamais ce dossier.</strong></div>
    <label class="lbl">Identifiant client Google (propre à vous, à saisir sur chaque appareil)
      <input class="input" value="${id}" data-input="clientId" placeholder="123456-abc….apps.googleusercontent.com" autocomplete="off" spellcheck="false"></label>
    <div class="row-center wrap">
      <button type="button" class="btn soft small" data-click="saveClient">Enregistrer l’identifiant</button>
      <span class="muted small">${ok ? '✓ Identifiant enregistré sur cet appareil' : 'Aucun identifiant valide pour l’instant'}</span>
    </div>
    <details class="guide"${ok ? '' : ' open'}>
      <summary>Comment obtenir mon identifiant ? (une seule fois, environ 10 minutes, de préférence sur un ordinateur)</summary>
      <ol>
        <li>Ouvrez <strong>console.cloud.google.com</strong> et connectez-vous avec <strong>votre</strong> compte Google.</li>
        <li>Menu en haut à gauche → <strong>Nouveau projet</strong> → nom « Carnet de classe » → Créer.</li>
        <li><strong>API et services → Bibliothèque</strong> : cherchez « Google Drive API » → <strong>Activer</strong>.</li>
        <li><strong>Google Auth Platform</strong> (ou « Écran de consentement OAuth ») : type <strong>Externe</strong>, nom « Carnet de classe »,
          votre e-mail comme contact. Dans <strong>Audience</strong> : laissez « Test » et <strong>ajoutez votre adresse Gmail comme utilisateur test</strong>.
          Dans <strong>Accès aux données</strong> : ajoutez le champ d’application <code>…/auth/drive.file</code>.</li>
        <li><strong>Clients</strong> (ou « Identifiants ») → <strong>Créer un client</strong> → type <strong>Application Web</strong> →
          <strong>Origines JavaScript autorisées</strong> : ajoutez exactement
          <span class="origin"><code>${origin}</code><button type="button" class="btn soft small" data-click="copyOrigin">Copier</button></span></li>
        <li>Copiez l’<strong>ID client</strong> (il se termine par <code>.apps.googleusercontent.com</code>), collez-le ci-dessus, puis « Enregistrer l’identifiant ».</li>
      </ol>
      <div class="muted small">Cet identifiant est à vous : personne d’autre n’a accès à vos données. Il n’est pas secret, mais il ne sert qu’à vos propres appareils.</div>
    </details>
    ${ok ? html`<div class="drive-state${drive.connected() ? ' on' : ''}">
        <span class="status-dot"></span>
        <div class="grow">${drive.connected() ? html`Connecté à Google${cfg.email ? html` · <strong>${cfg.email}</strong>` : ''}` : 'Non connecté à Google'}
          <div class="muted small">${last ? html`Dernière synchronisation : ${fmtDayYear(last)} à ${fmtTime(last)}${s ? ` · ${s.recus} reçu${s.recus > 1 ? 's' : ''}, ${s.envoyes} envoyé${s.envoyes > 1 ? 's' : ''}, ${s.supprimes} supprimé${s.supprimes > 1 ? 's' : ''}, ${s.photos} photo${s.photos > 1 ? 's' : ''}` : ''}` : 'Jamais synchronisé sur cet appareil'}</div></div>
      </div>
      <div class="btn-col">
        ${drive.connected()
          ? html`<button type="button" class="btn accent big" data-click="syncNow">Synchroniser maintenant</button>`
          : html`<button type="button" class="btn accent big" data-click="connect">Se connecter à Google</button>`}
        ${drive.folderUrl() ? html`<a class="btn soft" href="${drive.folderUrl()}" target="_blank" rel="noopener">Ouvrir le dossier dans Google Drive</a>` : ''}
        ${drive.connected() ? html`<button type="button" class="btn soft" data-click="disconnect">Se déconnecter de Google</button>` : ''}
      </div>
      <div class="muted small">Sur un nouvel appareil : saisissez le même identifiant, connectez-vous avec le même compte Google, puis « Synchroniser maintenant » :
        vos données arrivent. Ensuite, chaque appareil envoie et reçoit les modifications (le plus récent gagne).</div>` : ''}
  </div>`;
}

// Premier échange sur cet appareil alors qu'il contient déjà des données : fusionner, ou tout reprendre d'un côté.
async function premierEchange() {
  if (drive.config().lastSync) return 'fusion';
  const hasLocal = db.all('classes').length > 0;
  if (!hasLocal) return 'fusion';
  return choiceDialog({
    title: 'Première synchronisation de cet appareil',
    text: 'Cet appareil contient déjà des classes. Si Drive contient aussi des données (d’un autre appareil), que faire ?',
    choices: [
      { label: 'Fusionner les deux', sub: 'Recommandé : rien n’est perdu, le plus récent gagne', value: 'fusion', style: 'accent' },
      { label: 'Remplacer cet appareil par Drive', sub: 'Les données de cet appareil sont effacées (ex. données de démonstration)', value: 'drive', style: 'soft' },
      { label: 'Annuler', value: null, style: 'soft' },
    ],
  });
}

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
          <div class="section-title">Mode de sauvegarde</div>
          <div class="segmented mode-seg">
            <button type="button" class="seg${drive.isDrive() ? '' : ' on'}" data-click="mode" data-k="manuel">Sauvegarde manuelle</button>
            <button type="button" class="seg${drive.isDrive() ? ' on' : ''}" data-click="mode" data-k="drive">Google Drive</button>
          </div>
          ${drive.isDrive() ? driveView() : html`<div class="muted small">Vous enregistrez vous-même un fichier de sauvegarde (ci-dessous). Pour utiliser plusieurs appareils (tablette, téléphone, ordinateur), choisissez « Google Drive ».</div>`}

          <div class="section-title mt">${drive.isDrive() ? 'Copie de secours (fichier)' : 'Sauvegarde'}</div>
          <div class="save-state${old ? ' warn' : ''}">
            <span class="status-dot"></span>
            <div class="grow">${last ? html`Dernière sauvegarde : <strong>${fmtDayYear(last)} à ${fmtTime(last)}</strong>${days >= 1 ? html` (il y a ${days} jour${days > 1 ? 's' : ''})` : ''}` : html`<strong>Aucune sauvegarde pour l’instant.</strong>`}</div>
          </div>
          <div class="muted small">Le fichier contient toutes les données et les photos de cet appareil. Gardez-le en lieu sûr (Google Drive, clé USB) : une tablette perdue ou réinitialisée, et tout serait perdu.</div>
          <div class="btn-col">
            <button type="button" class="btn accent big" data-click="save">${icon.download}${backup.canChooseFolder() ? 'Enregistrer une sauvegarde…' : 'Enregistrer une sauvegarde'}</button>
            <div class="muted small">${backup.canChooseFolder()
              ? 'Une fenêtre s’ouvre pour choisir le dossier et le nom du fichier.'
              : html`Sur cet appareil, le fichier va dans <strong>Téléchargements</strong>. Pour choisir le dossier à chaque fois : Chrome → ⋮ → Paramètres → Téléchargements → activer « Demander où télécharger les fichiers ». Ou utilisez « Envoyer la sauvegarde » ci-dessous (Drive…).`}</div>
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

  leave() { archived = false; clientDraft = null; },

  actions: {
    // ----- Google Drive -----
    mode(el) {
      drive.setConfig({ mode: el.dataset.k });
      refresh();
      toast({ text: el.dataset.k === 'drive' ? 'Mode Google Drive choisi pour cet appareil' : 'Mode sauvegarde manuelle' });
    },
    clientId(el) { clientDraft = el.value; },
    saveClient() {
      const id = (clientDraft != null ? clientDraft : drive.config().clientId || '').trim();
      if (!drive.validClientId(id)) { toast({ text: 'Identifiant non reconnu : il doit se terminer par .apps.googleusercontent.com', ms: 5000 }); return; }
      const changed = id !== drive.config().clientId;
      if (changed) { drive.disconnect(); drive.setConfig({ clientId: id, folderId: null, dataFileId: null }); }
      clientDraft = null;
      refresh();
      toast({ text: changed ? 'Identifiant enregistré sur cet appareil' : 'Identifiant inchangé' });
    },
    async copyOrigin() {
      try { await navigator.clipboard.writeText(location.origin); toast({ text: 'Adresse copiée : ' + location.origin }); }
      catch (e) { toast({ text: 'Copie impossible : recopiez ' + location.origin, ms: 6000 }); }
    },
    async connect() {
      busy = 'Connexion à Google…'; refresh();
      try { await drive.connect(true); busy = ''; refresh(); toast({ text: 'Connecté à Google' }); }
      catch (e) { busy = ''; refresh(); toast({ text: e.message, ms: 7000 }); }
    },
    disconnect() { drive.disconnect(); refresh(); toast({ text: 'Déconnecté de Google (vos données restent sur cet appareil et sur Drive)' }); },
    async syncNow() {
      const choix = await premierEchange();
      if (!choix) return;
      busy = 'Synchronisation…'; refresh();
      try {
        if (choix === 'drive') {
          // Tout reprendre de Drive : on vide cet appareil en gardant son réglage de synchronisation —
          // seulement si Drive a bien des données (sinon on perdrait tout).
          busy = 'Vérification des données sur Drive…'; refresh();
          if (!(await drive.driveADesDonnees())) {
            busy = ''; refresh();
            toast({ text: 'Drive ne contient encore aucune classe : rien n’a été effacé. Choisissez « Fusionner » pour envoyer les données de cet appareil.', ms: 8000 });
            return;
          }
          const cfg = drive.config();
          await db.clearAll();
          model.ensureMeta();
          drive.setConfig(cfg);
        }
        const s = await drive.synchroniser(t => { busy = t; refresh(); });
        busy = ''; refresh();
        toast({ text: `Synchronisé : ${s.recus} reçu${s.recus > 1 ? 's' : ''}, ${s.envoyes} envoyé${s.envoyes > 1 ? 's' : ''}, ${s.supprimes} supprimé${s.supprimes > 1 ? 's' : ''}${s.photos ? `, ${s.photos} photo${s.photos > 1 ? 's' : ''}` : ''}`, ms: 5000 });
      } catch (e) {
        busy = ''; refresh();
        toast({ text: e instanceof drive.NeedAuth ? 'Connexion Google expirée : touchez « Se connecter à Google ».' : 'Synchronisation impossible : ' + e.message, ms: 7000 });
      }
    },

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
        text: `Sauvegarde du ${s.date ? fmtDayYear(s.date) : '?'}${s.year ? ' (année ' + s.year + ')' : ''} : ${s.classes} classes, ${s.students} élèves, ${s.photos} photos, ${s.projects} projets${s.cours ? `, ${s.cours} cours d’emploi du temps` : ''}. Toutes les données actuelles de cet appareil seront remplacées.`,
        ok: 'Remplacer et restaurer', danger: true,
      });
      if (!ok) return;
      busy = 'Restauration…'; refresh();
      try { await backup.restore(res.snap); toast({ text: 'Sauvegarde restaurée' }); }
      catch (e) { toast({ text: 'Restauration impossible : ' + e.message, ms: 6000 }); }
      busy = ''; refresh();
    },
    async recapCsv(el) {
      const { blob, name } = backup.recapCsv(el.dataset.id);
      const r = await backup.giveFile(blob, name, { type: blob.type });
      if (r.how !== 'cancelled') toast({ text: backup.givenMessage(r, 'Récapitulatif') });
    },
    pronote(el) {
      const list = model.selectableAssignments(el.dataset.id, ['cours', 'fini', 'avenir']);
      if (!list.length) { toast({ text: 'Aucun projet dans cette classe' }); return; }
      openMenu({
        anchor: el, width: 340, align: 'right', title: 'Projet à exporter',
        items: list.map(a => ({ label: db.get('projects', a.projectId).title, sub: model.STATUS[a.status], onPick: async () => {
          const { blob, name } = backup.pronoteCsv(a.id);
          const r = await backup.giveFile(blob, name, { type: blob.type });
          if (r.how !== 'cancelled') toast({ text: backup.givenMessage(r, 'Fichier Pronote') });
        } })),
      });
    },
    async archive() {
      try {
        const r = await backup.giveFile(async () => { busy = 'Préparation de l’archive…'; refresh(); return backup.backupBlob(); },
          backup.backupName('carnet-archive-' + model.schoolYear().replace(/\D+/g, '-')));
        if (r.how !== 'cancelled') { backup.markBackupDone(); archived = true; toast({ text: backup.givenMessage(r, 'Archive') }); }
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
  try {
    // Le fichier n'est préparé qu'après le choix du dossier (la fenêtre doit s'ouvrir tout de suite).
    const r = await backup.giveFile(async () => { busy = 'Préparation de la sauvegarde…'; refresh(); return backup.backupBlob(); },
      backup.backupName(), { share });
    if (r.how !== 'cancelled') {
      backup.markBackupDone();
      const size = r.size ? ` (${(r.size / 1048576).toFixed(1).replace('.', ',')} Mo)` : '';
      toast({ text: backup.givenMessage(r, 'Sauvegarde') + size, ms: 5000 });
    }
  } catch (e) { toast({ text: 'Sauvegarde impossible : ' + e.message, ms: 6000 }); }
  busy = ''; refresh();
}
