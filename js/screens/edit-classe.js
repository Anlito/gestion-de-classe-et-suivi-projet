// Créer / Modifier une classe : nom, niveau, SEGPA, projets associés, élèves (photos, import du trombinoscope PDF).
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, openMenu, confirmDialog, fmtDate } from '../ui.js';
import { icon, backLink, photo } from '../components.js';
import { go, refresh } from '../nav.js';
import { takePhoto, pickPdf } from '../photos.js';

let draft = null; // copie de travail, enregistrée seulement avec « Enregistrer »
const LEVEL_BTNS = ['6e', '5e', '4e', '3e'];
const ORDER = ['cours', 'avenir', 'fini'];
const blobURLs = new WeakMap();

function load(id) {
  if (id === 'new') return { id: null, name: '', level: '4e', segpa: false, year: model.schoolYear(), assigned: [], students: [] };
  const c = db.get('classes', id);
  if (!c) return null;
  return {
    id: c.id, name: c.name, level: c.level, segpa: !!c.segpa, year: c.year || model.schoolYear(),
    assigned: model.assignmentsOf(c.id)
      .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (b.endedAt || '').localeCompare(a.endedAt || ''))
      .map(a => ({ id: a.id, projectId: a.projectId, status: a.status, endedAt: a.endedAt, isNew: false })),
    students: model.studentsOf(c.id).map(s => ({ id: s.id, nom: s.nom, prenom: s.prenom, photoId: s.photoId, photoBlob: null, isNew: false })),
  };
}
const stu = id => draft.students.find(s => s.id === id);
const revStu = id => draft.review.students.find(s => s.id === id);
function urlOf(s) {
  if (s.photoBlob) { if (!blobURLs.has(s.photoBlob)) blobURLs.set(s.photoBlob, URL.createObjectURL(s.photoBlob)); return blobURLs.get(s.photoBlob); }
  return db.photoURL(s.photoId);
}
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
const matchKey = s => norm(s.nom) + '|' + norm(s.prenom);

function assignedInfo(a) {
  const p = db.get('projects', a.projectId);
  if (a.status === 'fini') return 'Terminé le ' + fmtDate(a.endedAt);
  const n = a.isNew ? 0 : model.seancesOf(a.id).length;
  if (a.status === 'cours') return 'Séance ' + n + ' / ' + (p ? p.nSeances : '?');
  return 'Pas encore commencé';
}

// ---------- Écran de vérification de l'import ----------
function reviewView() {
  const r = draft.review;
  const kept = r.students.filter(s => !s.skip);
  const nNew = kept.filter(s => !s.matchId).length;
  const nMissing = kept.filter(s => !s.photoBlob && !(s.matchId && urlOf(stu(s.matchId)))).length;
  const inPdf = new Set(r.students.map(s => s.matchId).filter(Boolean));
  const absent = draft.students.filter(s => !inPdf.has(s.id) && !s.isNew);
  return html`<div class="screen">
    <header class="topbar">
      <button type="button" class="back" data-click="cancelReview">${icon.back}<span class="back-label">Retour</span></button>
      <div class="title ellipsis">Vérifier l’import</div>
      <div class="spacer"></div>
      <button type="button" class="btn soft hide-phone" data-click="cancelReview">Annuler l’import</button>
      <button type="button" class="btn accent" data-click="applyReview">Valider · ${kept.length} élève${kept.length > 1 ? 's' : ''}</button>
    </header>
    <main class="content edit-grid class-edit">
      <section class="panel form">
        <div class="stack-tight"><strong>Fichier lu sur la tablette</strong><span class="muted">${r.fileName} · ${r.pages} page${r.pages > 1 ? 's' : ''}</span></div>
        ${!draft.id ? html`<label class="lbl">Nom de la classe${r.className ? html` <span class="muted normal">(lu dans le PDF : ${r.className})</span>` : ''}
          <input class="input big strong-in" data-input="revName" value="${r.name}" placeholder="ex. 3e G"></label>` : ''}
        <div class="rev-stats">
          <div class="rev-stat"><span class="rev-n">${kept.length}</span><span class="muted small">élève${kept.length > 1 ? 's' : ''} à importer</span></div>
          ${draft.id ? html`<div class="rev-stat"><span class="rev-n">${nNew}</span><span class="muted small">nouveau${nNew > 1 ? 'x' : ''}</span></div>` : ''}
          <div class="rev-stat${nMissing ? ' warn' : ''}"><span class="rev-n">${nMissing}</span><span class="muted small">photo${nMissing > 1 ? 's' : ''} manquante${nMissing > 1 ? 's' : ''}</span></div>
        </div>
        <div class="info-box small-text">
          <div>Vérifiez chaque élève : le <strong>NOM</strong> et le <strong>Prénom</strong> sont modifiables.</div>
          <div>${icon.camera} ajoute une photo avec l’appareil photo ; ✕ exclut l’élève de l’import.</div>
          ${draft.id ? html`<div>Les élèves <strong>déjà dans la classe</strong> gardent tout leur historique ; seuls les nouveaux sont ajoutés.</div>` : ''}
        </div>
        ${absent.length ? html`<div class="dashed-note left"><strong>Dans la classe mais pas dans le PDF (${absent.length})</strong><br>
          ${absent.map(model.fullName).join(', ')}<br><span class="muted small">Ils sont conservés. Retirez-les à la main si besoin.</span></div>` : ''}
      </section>
      <section class="panel">
        <div class="panel-head row"><span class="panel-title grow">Élèves lus dans le PDF <span class="muted normal">${r.students.length}</span></span></div>
        <div class="panel-scroll rev-grid" data-scroll="review">
          ${r.students.map(s => {
            const existing = s.matchId ? stu(s.matchId) : null;
            const shown = s.photoBlob ? s : existing && urlOf(existing) ? existing : s;
            return html`<div class="rev-card${s.skip ? ' skip' : ''}">
              ${photo({ ...shown, photoBlob: shown.photoBlob }, { cls: 'rev', label: true, url: urlOf(shown) })}
              <div class="rev-fields">
                ${existing ? html`<span class="chip">Déjà dans la classe</span>` : draft.id ? html`<span class="chip accent">Nouveau</span>` : ''}
                <input class="input rev-nom" value="${s.nom}" data-input="revNom" data-id="${s.id}" placeholder="NOM" aria-label="Nom" ${existing || s.skip ? 'disabled' : ''}>
                <input class="input" value="${s.prenom}" data-input="revPrenom" data-id="${s.id}" placeholder="Prénom" aria-label="Prénom" ${existing || s.skip ? 'disabled' : ''}>
              </div>
              <div class="rev-btns">
                <button type="button" class="icon-btn${urlOf(shown) ? '' : ' cam-missing'}" data-click="revPhoto" data-id="${s.id}" aria-label="Prendre une photo" ${s.skip ? 'disabled' : ''}>${icon.camera}</button>
                ${s.photoBlob ? html`<button type="button" class="icon-btn" data-click="revNoPhoto" data-id="${s.id}" aria-label="Ce n'est pas une vraie photo" title="Pas une vraie photo">${icon.trash}</button>` : ''}
                <button type="button" class="icon-btn" data-click="revSkip" data-id="${s.id}" aria-label="${s.skip ? 'Réintégrer' : 'Exclure de l’import'}">${s.skip ? '↺' : '✕'}</button>
              </div>
            </div>`;
          })}
        </div>
      </section>
    </main>
  </div>`;
}

export default {
  render({ id }) {
    if (!draft || draft.key !== id) {
      const d = load(id);
      if (!d) { go('#/admin', { replace: true }); return null; }
      draft = { ...d, key: id, review: null, busy: '' };
    }
    if (draft.review) return reviewView();
    const isNew = !draft.id;
    const missing = draft.students.filter(s => !urlOf(s)).length;
    const nS = draft.students.length;
    const CHIP = { cours: 'accent', avenir: 'warn', fini: 'pos' };
    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/admin', 'Administration')}
        <div class="title ellipsis">${isNew ? 'Nouvelle classe' : 'Modifier la classe ' + draft.name}</div>
        <div class="spacer"></div>
        <a class="btn soft hide-phone" href="#/admin">Annuler</a>
        <button type="button" class="btn accent" data-click="save">Enregistrer</button>
      </header>
      <main class="content edit-grid class-edit">
        <section class="panel form">
          <label class="lbl">Nom de la classe
            <input class="input big strong-in" data-input="name" value="${draft.name}" placeholder="ex. 4e B"></label>
          <div class="lbl">Niveau
            <div class="level-btns">
              ${LEVEL_BTNS.map(l => html`<button type="button" class="lvl-btn${draft.level === l ? ' on' : ''}" data-click="level" data-k="${l}">${l}</button>`)}
              <button type="button" class="lvl-btn${draft.segpa ? ' on' : ''}" data-click="segpa">SEGPA</button>
            </div>
          </div>
          <div class="set-row"><strong class="grow">Année scolaire</strong><span class="muted">${draft.year}</span></div>

          <div class="stack">
            <div class="row-center"><span class="section-title grow">Projets associés</span>
              <button type="button" class="btn tint" data-click="associate">${icon.plus}Associer un projet</button></div>
            ${draft.assigned.map(a => {
              const p = db.get('projects', a.projectId);
              return html`<div class="assoc-row">
                <div class="grow"><div class="strong">${p ? p.title : '?'}</div><div class="muted small">${assignedInfo(a)}</div></div>
                <span class="chip ${CHIP[a.status]}">${model.STATUS[a.status]}</span>
                ${a.status === 'avenir' ? html`<button type="button" class="icon-btn" data-click="unassign" data-id="${a.id}" aria-label="Retirer">✕</button>` : ''}
                ${a.status === 'fini' && !a.isNew ? html`<button type="button" class="link-btn" data-click="view" data-id="${a.id}">Voir</button>` : ''}
              </div>`;
            })}
            ${draft.assigned.length ? '' : html`<div class="dashed-note">Aucun projet associé</div>`}
          </div>
          ${isNew ? '' : html`<div class="danger-zone"><button type="button" class="btn danger-soft" data-click="deleteClass">${icon.trash}Supprimer la classe</button></div>`}
        </section>

        <section class="panel">
          <div class="panel-head row">
            <span class="panel-title grow">Élèves <span class="muted normal">${nS} élève${nS > 1 ? 's' : ''}${missing ? ` · ${missing} photo(s) manquante(s)` : ''}</span></span>
            <button type="button" class="btn soft" data-click="importPdf">${icon.download}${nS ? 'Réimporter un PDF' : 'Importer un PDF'}</button>
            <button type="button" class="btn soft" data-click="addStudent">${icon.plus}Ajouter un élève</button>
          </div>
          ${nS ? html`<div class="panel-scroll students-grid" data-scroll="students">
              ${draft.students.map(s => html`<div class="stu-row">
                ${photo(s, { cls: 'tiny', label: false, url: urlOf(s) })}
                <input class="input stu-nom" value="${s.nom}" data-input="nom" data-id="${s.id}" placeholder="NOM" aria-label="Nom">
                <input class="input stu-prenom" value="${s.prenom}" data-input="prenom" data-id="${s.id}" placeholder="Prénom" aria-label="Prénom">
                <button type="button" class="icon-btn${urlOf(s) ? '' : ' cam-missing'}" data-click="photo" data-id="${s.id}" aria-label="Photo">${icon.camera}</button>
                <button type="button" class="icon-btn" data-click="delStudent" data-id="${s.id}" aria-label="Retirer l'élève">${icon.trash}</button>
              </div>`)}
            </div>`
          : html`<div class="drop-zone">
              <div class="empty-title">Importer le trombinoscope de la classe</div>
              <p class="muted">Le PDF est lu sur la tablette. Vous vérifiez ensuite chaque élève avant d'enregistrer.</p>
              <button type="button" class="btn accent big" data-click="importPdf">Choisir un PDF</button>
              <button type="button" class="link-btn" data-click="addStudent">ou ajouter les élèves un par un</button>
            </div>`}
        </section>
      </main>
      ${draft.busy ? html`<div class="busy"><div class="busy-box"><span class="spinner"></span>${draft.busy}</div></div>` : ''}
    </div>`;
  },

  leave() { draft = null; },

  actions: {
    name(el) { draft.name = el.value; },
    level(el) { draft.level = el.dataset.k; refresh(); },
    segpa() { draft.segpa = !draft.segpa; refresh(); },
    nom(el) { upper(el); stu(el.dataset.id).nom = el.value; },
    prenom(el) { stu(el.dataset.id).prenom = el.value; },

    associate(el) {
      const used = new Set(draft.assigned.map(a => a.projectId));
      const avail = model.projects().filter(p => !used.has(p.id));
      if (!avail.length) { toast({ text: 'Tous les projets sont déjà associés. Créez-en un dans Administration.' }); return; }
      openMenu({
        anchor: el, width: 400, title: 'Projets disponibles',
        items: avail.map(p => ({ label: p.title, sub: p.nSeances + ' séances · ' + p.criteria.length + ' critères', onPick: () => {
          draft.assigned.push({ id: db.uid(), projectId: p.id, status: 'avenir', endedAt: null, isNew: true });
          refresh();
          toast({ text: `« ${p.title} » associé (à enregistrer)` });
        } })),
      });
    },
    unassign(el) {
      const idx = draft.assigned.findIndex(a => a.id === el.dataset.id);
      const removed = draft.assigned.splice(idx, 1)[0];
      const p = db.get('projects', removed.projectId);
      refresh();
      toast({ text: `« ${p ? p.title : 'Projet'} » retiré de la classe`, undo: () => { draft.assigned.splice(idx, 0, removed); refresh(); } });
    },
    view(el) {
      model.chooseAssignment(draft.id, el.dataset.id);
      go(`#/classe/${draft.id}/projet`);
    },

    addStudent() {
      draft.students.push({ id: db.uid(), nom: '', prenom: '', photoId: null, photoBlob: null, isNew: true });
      refresh();
      const inputs = document.querySelectorAll('[data-input="nom"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    },
    delStudent(el) {
      const idx = draft.students.findIndex(s => s.id === el.dataset.id);
      const removed = draft.students.splice(idx, 1)[0];
      refresh();
      toast({ text: (removed.prenom || 'Élève') + ' retiré de la classe', undo: () => { draft.students.splice(idx, 0, removed); refresh(); } });
    },
    async photo(el) {
      const d = draft, s = stu(el.dataset.id);
      const blob = await takePhoto();
      if (!blob || draft !== d) return;
      s.photoBlob = blob;
      refresh();
      toast({ text: `Photo de ${s.prenom || 'l’élève'} prête (à enregistrer)` });
    },

    // ----- Import du trombinoscope -----
    async importPdf() {
      const file = await pickPdf();
      if (!file) return;
      const d = draft;
      d.busy = 'Ouverture du PDF…';
      refresh();
      try {
        const { readTrombinoscope } = await import('../pdfimport.js');
        const res = await readTrombinoscope(file, msg => { if (draft === d && msg) { d.busy = msg; const b = document.querySelector('.busy-box'); if (b) b.lastChild.textContent = msg; } });
        if (draft !== d) return;
        const existing = new Map(d.students.map(s => [matchKey(s), s.id]));
        d.review = {
          fileName: file.name, pages: res.pages, className: res.className, level: res.level, segpa: res.segpa,
          name: d.name || res.className || '',
          students: res.students.map(s => ({ id: db.uid(), nom: s.nom, prenom: s.prenom, photoBlob: s.photoBlob, skip: false, matchId: existing.get(matchKey(s)) || null })),
        };
      } catch (e) {
        console.error(e);
        toast({ text: 'Lecture impossible : ' + (e && e.message || e), ms: 6000 });
      }
      d.busy = '';
      refresh();
    },
    revName(el) { draft.review.name = el.value; },
    revNom(el) { upper(el); revStu(el.dataset.id).nom = el.value; },
    revPrenom(el) { revStu(el.dataset.id).prenom = el.value; },
    revSkip(el) { const s = revStu(el.dataset.id); s.skip = !s.skip; refresh(); },
    revNoPhoto(el) { revStu(el.dataset.id).photoBlob = null; refresh(); },
    async revPhoto(el) {
      const r = draft.review, s = revStu(el.dataset.id);
      const blob = await takePhoto();
      if (!blob || !draft || draft.review !== r) return;
      s.photoBlob = blob;
      refresh();
    },
    cancelReview() { draft.review = null; refresh(); },
    applyReview() {
      const r = draft.review;
      let added = 0, photos = 0;
      for (const s of r.students) {
        if (s.skip) continue;
        if (s.matchId) {
          const cur = stu(s.matchId);
          if (cur && s.photoBlob && !urlOf(cur)) { cur.photoBlob = s.photoBlob; photos++; }
          continue;
        }
        if (!s.nom.trim() && !s.prenom.trim()) continue;
        draft.students.push({ id: db.uid(), nom: s.nom.trim().toUpperCase(), prenom: s.prenom.trim(), photoId: null, photoBlob: s.photoBlob, isNew: true });
        added++;
      }
      draft.students.sort((a, b) => model.cmp(a.nom, b.nom) || model.cmp(a.prenom, b.prenom));
      if (!draft.id) {
        if (r.name.trim()) draft.name = r.name.trim();
        if (r.level) draft.level = r.level;
        if (r.segpa) draft.segpa = true;
      }
      draft.review = null;
      refresh();
      const parts = [`${added} élève${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}`];
      if (photos) parts.push(`${photos} photo${photos > 1 ? 's' : ''} complétée${photos > 1 ? 's' : ''}`);
      toast({ text: parts.join(' · ') + ' — touchez Enregistrer pour confirmer', ms: 5000 });
    },

    async deleteClass() {
      const nS = model.studentsOf(draft.id).length;
      const nA = model.assignmentsOf(draft.id).length;
      if (!(await confirmDialog({
        title: `Supprimer la classe ${draft.name} ?`,
        text: `Les ${nS} élèves (photos, observations, notes libres) et les ${nA} projet(s) de cette classe (séances, groupes, évaluations) seront supprimés de cet appareil. Les définitions de projets restent disponibles pour les autres classes.`,
        ok: 'Supprimer la classe', danger: true,
      }))) return;
      const name = draft.name;
      const undo = model.deleteClass(draft.id);
      draft = null;
      go('#/admin');
      toast({ text: `Classe ${name} supprimée`, undo: async () => { await undo(); refresh(); } });
    },

    async save() {
      const name = draft.name.trim();
      if (!name) { toast({ text: 'Donnez un nom à la classe' }); document.querySelector('[data-input="name"]').focus(); return; }
      const clash = db.all('classes').find(c => c.id !== draft.id && c.name.trim().toLowerCase() === name.toLowerCase());
      if (clash) { toast({ text: `Une classe « ${clash.name} » existe déjà` }); return; }
      const keep = draft.students.filter(s => s.nom.trim() || s.prenom.trim());
      const isNew = !draft.id;
      const removedStudents = isNew ? [] : model.studentsOf(draft.id).filter(s => !keep.some(k => k.id === s.id));
      const removedAssign = isNew ? [] : model.assignmentsOf(draft.id).filter(a => !draft.assigned.some(d => d.id === a.id));
      const withHistory = removedStudents.filter(s => db.all('observations').some(o => o.studentId === s.id) || db.all('notes').some(n => n.studentId === s.id));
      if (withHistory.length && !(await confirmDialog({
        title: `Retirer ${withHistory.length} élève${withHistory.length > 1 ? 's' : ''} avec un historique ?`,
        text: withHistory.map(model.fullName).join(', ') + ' : leurs observations et notes seront supprimées avec eux.',
        ok: 'Retirer et enregistrer', danger: true,
      }))) return;
      const d = draft;
      const undo = db.commit(w => {
        const cls = w.put('classes', { ...(d.id ? db.get('classes', d.id) : {}), id: d.id || undefined, name, level: d.level, segpa: d.segpa, year: d.year });
        const classId = cls.id;
        for (const s of keep) {
          const cur = db.get('students', s.id);
          let photoId = s.photoId || null;
          if (s.photoBlob) {
            if (photoId) w.del('photos', photoId);
            photoId = w.put('photos', { blob: s.photoBlob }).id;
          }
          const rec = { ...(cur || {}), id: s.id, classId, nom: s.nom.trim().toUpperCase(), prenom: s.prenom.trim(), photoId };
          if (!cur || cur.nom !== rec.nom || cur.prenom !== rec.prenom || cur.photoId !== rec.photoId) w.put('students', rec);
        }
        for (const s of removedStudents) model.deleteStudentIn(w, s.id);
        for (const a of d.assigned) if (a.isNew) w.put('assignments', { id: a.id, classId, projectId: a.projectId, status: 'avenir', endedAt: null });
        for (const a of removedAssign) model.deleteAssignmentIn(w, a.id);
      });
      draft = null;
      go('#/admin');
      toast({ text: isNew ? `Classe « ${name} » créée` : 'Modifications enregistrées', undo: async () => { await undo(); refresh(); } });
    },
  },
};

function upper(el) {
  const v = el.value.toUpperCase();
  if (el.value !== v) { const p = el.selectionStart; el.value = v; el.setSelectionRange(p, p); }
}
