// Sauvegarde et exports : fichier de sauvegarde complet, restauration, exports PDF/CSV par classe, fin d'année.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, openMenu, confirmDialog, choiceDialog, fmtDayYear, fmtTime } from '../ui.js';
import * as drive from '../drive.js';
import * as autosync from '../autosync.js';
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
      <input class="input" value="${id}" data-input="clientId" placeholder="123456-abc….apps.googleusercontent.com" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url"></label>
    <div class="row-center wrap">
      <button type="button" class="btn soft small" data-click="saveClient">Enregistrer l’identifiant</button>
      <span class="muted small">${ok ? '✓ Identifiant enregistré sur cet appareil' : 'Aucun identifiant valide pour l’instant'}</span>
    </div>
    <details class="guide"${ok ? '' : ' open'}>
      <summary>Comment obtenir mon identifiant ? — une seule fois, 10 à 15 minutes, <strong>sur un ordinateur</strong> de préférence</summary>
      <p class="muted small">Faites-le avec le compte Google qui recevra vos données. Les intitulés de Google peuvent varier légèrement.</p>

      <div class="g-part"><span class="g-n">1</span><div class="grow"><strong>Créer le projet</strong><ol>
        <li>Allez sur <strong>console.cloud.google.com</strong> et connectez-vous (acceptez les conditions à la première visite).</li>
        <li>En haut à gauche, à côté de « Google Cloud » : le <strong>sélecteur de projet</strong> → <strong>Nouveau projet</strong>.</li>
        <li>Nom : <strong>Carnet de classe</strong> · « Aucune organisation » → <strong>Créer</strong>. Vérifiez qu’il est bien sélectionné en haut.</li>
      </ol></div></div>

      <div class="g-part"><span class="g-n">2</span><div class="grow"><strong>Activer Google Drive</strong><ol>
        <li>Dans la barre de recherche en haut : <strong>Google Drive API</strong> → ouvrez le résultat → <strong>Activer</strong>.</li>
      </ol></div></div>

      <div class="g-part"><span class="g-n">3</span><div class="grow"><strong>Écran d’autorisation</strong><ol>
        <li>Barre de recherche : <strong>Google Auth Platform</strong> (ou « Écran de consentement OAuth ») → <strong>Commencer</strong>.</li>
        <li>Nom de l’application : <strong>Carnet de classe</strong> · e-mail d’assistance : votre adresse → Suivant.</li>
        <li>Audience : <strong>Externe</strong> → Suivant · Coordonnées : votre adresse → Suivant · acceptez le règlement → <strong>Créer</strong>.</li>
        <li>Menu de gauche <strong>Audience</strong> → <strong>Utilisateurs test</strong> → <strong>+ Add users</strong> → <strong>votre adresse Gmail</strong> → Enregistrer.
          Laissez le statut « Test ». <span class="g-warn">Oubli fréquent : sans cela, Google refuse la connexion.</span></li>
        <li>Menu de gauche <strong>Accès aux données</strong> → <strong>Ajouter ou supprimer des champs d’application</strong> → dans le filtre, tapez
          <strong>drive.file</strong> → cochez <code>…/auth/drive.file</code> → Mettre à jour → <strong>Enregistrer</strong>.</li>
      </ol></div></div>

      <div class="g-part"><span class="g-n">4</span><div class="grow"><strong>Créer l’identifiant</strong><ol>
        <li>Menu de gauche <strong>Clients</strong> → <strong>+ Créer un client</strong> → type <strong>Application Web</strong> · nom au choix.</li>
        <li><strong>Origines JavaScript autorisées</strong> → <strong>+ Ajouter un URI</strong> → collez exactement cette adresse (sans « / » à la fin) :
          <span class="origin"><code>${origin}</code><button type="button" class="btn soft small" data-click="copyOrigin">Copier</button></span>
          Laissez vide « URI de redirection autorisés ».</li>
        <li><strong>Créer</strong> → copiez l’<strong>ID client</strong> : il commence par des chiffres et se termine par <code>.apps.googleusercontent.com</code>
          (vous le retrouvez à tout moment dans « Clients »). <span class="g-warn">Pas le « code secret » (GOCSPX-…) : il ne sert pas ici.</span></li>
      </ol></div></div>

      <div class="g-part"><span class="g-n">5</span><div class="grow"><strong>Dans l’application</strong><ol>
        <li>Collez l’ID client dans le champ ci-dessus → <strong>Enregistrer l’identifiant</strong> → <strong>Se connecter à Google</strong>.</li>
        <li>Choisissez votre compte. Si Google affiche « Google n’a pas validé cette application » : c’est normal (mode Test) → <strong>Continuer</strong> → autorisez.</li>
        <li>Faites de même sur chacun de vos appareils (même identifiant, même compte Google).</li>
      </ol></div></div>

      <div class="g-errors"><strong>En cas d’erreur</strong><ul>
        <li><code>origin_mismatch</code> ou <code>redirect_uri_mismatch</code> : l’adresse de la partie 4 n’est pas exacte (pas de « / » final), ou Google
          n’a pas encore pris la modification en compte (quelques minutes, parfois plus) : réessayez plus tard.</li>
        <li><code>access_denied</code> : votre adresse n’est pas dans les <strong>utilisateurs test</strong> (partie 3).</li>
        <li>« Fenêtre bloquée » : autorisez les fenêtres pop-up pour ce site dans le navigateur.</li>
      </ul></div>
      <div class="muted small">Cet identifiant est à vous : personne d’autre n’a accès à vos données.</div>
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
      <div class="muted small"><strong>Synchronisation automatique</strong> : à l’ouverture de l’app, quelques secondes après vos modifications,
        au retour dans l’app et toutes les 5 minutes. L’indicateur en haut des écrans (« Synchronisé 10:42 ») le montre ; touchez-le pour
        synchroniser tout de suite ou vous reconnecter à Google (la connexion Google dure 1 heure).
        Sur un nouvel appareil : même identifiant, même compte Google, puis « Synchroniser maintenant » : vos données arrivent.</div>` : ''}
  </div>`;
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
      const typed = clientDraft != null ? clientDraft : drive.config().clientId || '';
      const id = drive.extractClientId(typed);
      if (!id) {
        const shown = typed.replace(/[​-‍⁠﻿]/g, '⍰').slice(0, 90);
        toast({ text: `Identifiant non reconnu. Il ressemble à « 123456789012-abc…apps.googleusercontent.com ». Reçu : « ${shown || 'rien'} »`, ms: 12000 });
        return;
      }
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
      try { await drive.connect(true); busy = ''; refresh(); toast({ text: 'Connecté à Google' }); autosync.schedule(500); }
      catch (e) { busy = ''; refresh(); toast({ text: e.message, ms: 7000 }); }
    },
    disconnect() { drive.disconnect(); refresh(); toast({ text: 'Déconnecté de Google (vos données restent sur cet appareil et sur Drive)' }); },
    // Même logique que l'indicateur de l'en-tête (questions de 1re synchronisation ou après restauration comprises).
    // (Pas de voile « occupé » ici : il cacherait les questions ; l'indicateur de l'en-tête montre l'avancement.)
    async syncNow(el) {
      el.disabled = true;
      const s = await autosync.run(true);
      if (s) model.ensureMeta();
      refresh();
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
