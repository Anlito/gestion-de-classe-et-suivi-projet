// Suivi PP → PAP d'un élève (1.24.0) : grille officielle par niveau (6e…3e), PAP précédent dans les colonnes des
// années passées, aménagements libres, informations du médecin (privées), bilan, et version imprimable officielle.
// Routes : #/pp/eleve/:studentId/pap (saisie) et #/pp/eleve/:studentId/pap/imprimer (impression).
import * as db from '../db.js';
import * as model from '../model.js';
import * as pap from '../pap.js';
import { SECTIONS, NIVEAUX } from '../pap-items.js';
import { html, raw, toast, confirmDialog, fmtDayYear } from '../ui.js';
import { icon, backLink, saveStatus } from '../components.js';
import { refresh, go } from '../nav.js';

let studentId = '', draft = null, baseId = null, dirty = false, busy = false;
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

function charger(id) {
  const r = pap.papDe(id);
  studentId = id; draft = JSON.parse(JSON.stringify(r.data)); baseId = r.record ? r.record.id : null; dirty = false;
  return r;
}
const coche = (niveau, id) => (draft.cases[niveau] || []).includes(id);

function section(s) {
  return html`<table class="pap-table${s.sous ? ' sous' : ''}">
    <thead><tr><th class="pap-sec">${s.titre}</th>${NIVEAUX.map(n => html`<th class="pap-niv${n === draft.niveau ? ' actuel' : ''}">${n}</th>`)}<th class="pap-x"></th></tr></thead>
    <tbody>${s.items.map(it => html`<tr><td class="pap-texte">${it.texte}</td>${NIVEAUX.map(n => html`<td class="pap-case${n === draft.niveau ? ' actuel' : ''}">
      <input type="checkbox" data-change="case" data-n="${n}" data-id="${it.id}" ${coche(n, it.id) ? 'checked' : ''} aria-label="${n} · ${it.texte}"></td>`)}<td class="pap-x"></td></tr>`)}</tbody></table>`;
}

function saisie(s, c, info) {
  const totalActuel = pap.total(draft, draft.niveau);
  return html`<div class="screen pp-screen"><header class="topbar">${backLink('#/pp/eleve/' + s.id, 'Fiche élève')}
      <div class="heading"><span class="title">PAP · ${model.fullName(s)}</span><span class="sub">${c ? c.name : ''} · ${model.schoolYear()}</span></div>
      <div class="spacer"></div>${saveStatus()}
      <a class="btn soft" href="#/pp/eleve/${s.id}/pap/imprimer">${icon.download}<span class="hide-narrow">Imprimer le PAP</span></a>
      <button type="button" class="btn accent" data-click="save" ${busy || !dirty ? 'disabled' : ''}>Enregistrer</button></header>
    <main class="content pap-page" data-scroll="pap">
      ${info.conflit ? html`<div class="abs-info">Deux versions de ce PAP ont été enregistrées sur des appareils différents. La plus récente est affichée ; en enregistrant, elle devient la référence.</div>` : ''}
      <section class="panel pap-head">
        <div class="row-center wrap">
          <label class="lbl pap-niveau">Niveau de cette année
            <select class="input" data-change="niveau">${NIVEAUX.map(n => html`<option value="${n}" ${n === draft.niveau ? 'selected' : ''}>${n}</option>`)}</select></label>
          <div class="grow muted small">Cochez dans la colonne <strong>${draft.niveau}</strong> les aménagements de cette année. Les colonnes des années précédentes
            reprennent le <strong>PAP précédent</strong> : reportez-y ce qui était coché sur le document. Seuls les items indispensables à l’élève sont à cocher.</div>
          <span class="chip accent">${totalActuel} aménagement${totalActuel > 1 ? 's' : ''} en ${draft.niveau}</span>
        </div>
      </section>
      <section class="panel pap-grid">${SECTIONS.map(section)}
        <table class="pap-table"><thead><tr><th class="pap-sec">Autres aménagements et adaptations</th>${NIVEAUX.map(n => html`<th class="pap-niv${n === draft.niveau ? ' actuel' : ''}">${n}</th>`)}<th class="pap-x"></th></tr></thead>
          <tbody>${draft.autres.map(a => html`<tr><td class="pap-texte"><input class="input" value="${a.texte}" data-input="autreTexte" data-id="${a.id}" placeholder="Aménagement" maxlength="500"></td>
            ${NIVEAUX.map(n => html`<td class="pap-case${n === draft.niveau ? ' actuel' : ''}"><input type="checkbox" data-change="autreNiveau" data-id="${a.id}" data-n="${n}" ${a.niveaux.includes(n) ? 'checked' : ''} aria-label="${n}"></td>`)}
            <td class="pap-x"><button type="button" class="icon-btn" data-click="autreDel" data-id="${a.id}" aria-label="Retirer">${icon.trash}</button></td></tr>`)}</tbody></table>
        <button type="button" class="btn soft self-start" data-click="autreAdd">${icon.plusBig}Ajouter un aménagement</button>
      </section>
      <details class="panel pap-plus"${draft.medecin.appuis || draft.medecin.consequences ? ' open' : ''}><summary><strong>Besoins spécifiques de l’élève</strong> <span class="muted small">(rempli par le médecin de l’éducation nationale · reste privé, jamais transmis aux collègues)</span></summary>
        <label class="lbl">Points d’appui pour les apprentissages<textarea class="input" rows="3" data-input="medecin" data-k="appuis" maxlength="4000">${draft.medecin.appuis}</textarea></label>
        <label class="lbl">Conséquences des troubles sur les apprentissages<textarea class="input" rows="3" data-input="medecin" data-k="consequences" maxlength="4000">${draft.medecin.consequences}</textarea></label>
      </details>
      <details class="panel pap-plus"${draft.bilan.nonAtteints || draft.bilan.profitables || draft.liaison ? ' open' : ''}><summary><strong>Bilan des aides apportées au collège · liaison collège–lycée</strong></summary>
        <label class="lbl">Aménagements n’ayant pas atteint les objectifs escomptés<textarea class="input" rows="3" data-input="bilan" data-k="nonAtteints" maxlength="4000">${draft.bilan.nonAtteints}</textarea></label>
        <label class="lbl">Aménagements profitables à l’élève<textarea class="input" rows="3" data-input="bilan" data-k="profitables" maxlength="4000">${draft.bilan.profitables}</textarea></label>
        <label class="lbl">Liaison collège–lycée (entrée au lycée)<textarea class="input" rows="3" data-input="liaison" maxlength="4000">${draft.liaison}</textarea></label>
      </details>
      ${info.record ? html`<p class="muted small">Dernier enregistrement : ${fmtDayYear(info.record.at)}.</p>` : ''}
    </main></div>`;
}

// ---------- Version imprimable (mise en page du Bulletin officiel) ----------
function impression(s, c, d) {
  const croix = (ok, actuel) => html`<td class="pap-p-case${actuel ? ' actuel' : ''}">${ok ? '✕' : ''}</td>`;
  const tableau = sec => html`<table class="doc-table pap-p"><thead><tr><th class="left pap-p-sec">${sec.titre} :</th>${NIVEAUX.map(n => html`<th class="pap-p-n">${n}</th>`)}</tr></thead>
    <tbody>${sec.items.map(it => html`<tr><td class="left">${it.texte}</td>${NIVEAUX.map(n => croix((d.cases[n] || []).includes(it.id), n === d.niveau))}</tr>`)}</tbody></table>`;
  const autres = d.autres.length ? d.autres : [{ texte: '', niveaux: [] }, { texte: '', niveaux: [] }];
  return html`<div class="screen print-screen">${raw('<style>@page { size: A4 portrait; margin: 12mm; }</style>')}
    <header class="topbar no-print"><a class="back" href="#/pp/eleve/${s.id}/pap">${icon.back}<span class="back-label">Retour</span></a>
      <div class="title ellipsis">PAP · ${model.fullName(s)}</div><div class="spacer"></div>
      <span class="muted small hide-narrow">Imprimante : « Enregistrer au format PDF »</span>
      <button type="button" class="btn accent" data-click="print">Imprimer / PDF</button></header>
    <main class="content doc-wrap"><div class="doc pap-doc">
      <section class="doc-page">
        <div class="doc-kicker">Plan d’accompagnement personnalisé</div>
        <p class="doc-muted">Vu la loi n° 2013-595 du 8 juillet 2013 d’orientation et de programmation pour la refondation de l’École de la République ; vu le code de l’éducation et notamment ses articles L. 311-7 et D. 311-13.</p>
        <div class="pap-p-box"><p><strong>Nom et prénom(s) de l’élève :</strong> ${s.nom} ${s.prenom}</p><p><strong>Classe :</strong> ${c ? c.name : ''} · ${model.schoolYear()}</p></div>
        ${d.medecin.appuis || d.medecin.consequences ? html`<div class="pap-p-box"><p><strong>Besoins spécifiques de l’élève</strong> (à remplir par le médecin de l’éducation nationale)</p>
          <p><strong>Points d’appui pour les apprentissages :</strong><br>${d.medecin.appuis}</p><p><strong>Conséquences des troubles sur les apprentissages :</strong><br>${d.medecin.consequences}</p></div>` : ''}
        <h2>Adaptations et aménagements à mettre en place en fonction des besoins de l’élève — au collège</h2>
        <p class="doc-muted"><strong>L’ensemble des items n’est pas à renseigner. Seuls les items indispensables à l’élève sont à cocher.</strong></p>
        ${SECTIONS.map(tableau)}
        <table class="doc-table pap-p"><thead><tr><th class="left pap-p-sec">Autres aménagements et adaptations :</th>${NIVEAUX.map(n => html`<th class="pap-p-n">${n}</th>`)}</tr></thead>
          <tbody>${autres.map(a => html`<tr><td class="left">${a.texte || raw('&nbsp;')}</td>${NIVEAUX.map(n => croix(a.niveaux.includes(n), n === d.niveau))}</tr>`)}</tbody></table>
        <table class="doc-table pap-p pap-visas"><tbody>${NIVEAUX.map(n => html`<tr><td class="left pap-v-n">${n}</td><td class="left">Date :</td><td class="left">Visa des parents :</td><td class="left">Signature et tampon du chef d’établissement :</td></tr>`)}</tbody></table>
        <h2>Bilan des aides apportées au collège</h2>
        <p><strong>Aménagements n’ayant pas atteint les objectifs escomptés :</strong><br>${d.bilan.nonAtteints || raw('<br><br>')}</p>
        <p><strong>Aménagements profitables à l’élève :</strong><br>${d.bilan.profitables || raw('<br><br>')}</p>
        <h2>Entrée au lycée</h2><p><strong>Liaison collège–lycée</strong> <em>(à remplir par le professeur principal en lien avec un professeur du lycée)</em> :<br>${d.liaison || raw('<br><br>')}</p>
        <p class="doc-muted">Grille : Bulletin officiel n° 5 du 29 janvier 2015. Édité le ${fmtDayYear(new Date())} depuis le Carnet de classe.</p>
      </section></div></main></div>`;
}

export default {
  render({ studentId: id, mode }) {
    let s, info;
    try { s = db.get('students', id); if (studentId !== id || !draft) info = charger(id); else info = pap.papDe(id); }
    catch (e) { return html`<div class="screen"><header class="topbar">${backLink('#/pp', 'Suivi PP')}<div class="title">PAP</div></header><main class="content"><p>${e.message}</p></main></div>`; }
    const c = db.get('classes', s.classId);
    if (mode === 'imprimer') return impression(s, c, draft);
    return saisie(s, c, info);
  },
  async leave() { if (!dirty) { draft = null; studentId = ''; } },
  actions: {
    niveau(el) { draft.niveau = el.value; dirty = true; refresh(); },
    case(el) {
      const n = el.dataset.n, id = el.dataset.id, list = new Set(draft.cases[n] || []);
      if (el.checked) list.add(id); else list.delete(id);
      draft.cases[n] = [...list]; dirty = true; refreshSave();
    },
    autreAdd() { draft.autres.push({ id: db.uid(), texte: '', niveaux: [draft.niveau] }); dirty = true; refresh(); document.querySelector('[data-input="autreTexte"]:last-of-type')?.focus(); },
    autreTexte(el) { const a = draft.autres.find(x => x.id === el.dataset.id); if (a) { a.texte = el.value; dirty = true; refreshSave(); } },
    autreNiveau(el) {
      const a = draft.autres.find(x => x.id === el.dataset.id); if (!a) return;
      a.niveaux = el.checked ? [...new Set([...a.niveaux, el.dataset.n])] : a.niveaux.filter(n => n !== el.dataset.n);
      dirty = true; refreshSave();
    },
    autreDel(el) { draft.autres = draft.autres.filter(a => a.id !== el.dataset.id); dirty = true; refresh(); },
    medecin(el) { draft.medecin[el.dataset.k] = el.value; dirty = true; refreshSave(); },
    bilan(el) { draft.bilan[el.dataset.k] = el.value; dirty = true; refreshSave(); },
    liaison(el) { draft.liaison = el.value; dirty = true; refreshSave(); },
    async save() {
      if (busy || !dirty) return;
      busy = true; refresh();
      try {
        const heads = pap.papDe(studentId).heads;
        const row = await pap.enregistrer(studentId, draft, baseId, heads.length > 1 ? { resoudre: true, expectedHeads: heads.map(h => h.id) } : {});
        baseId = row.id; dirty = false;
        toast({ text: 'PAP enregistré' });
      } catch (e) { toast({ text: e.message, ms: 7000 }); }
      busy = false; refresh();
    },
    print() { window.print(); },
  },
};

// Le bouton « Enregistrer » s'active dès la première modification, sans redessiner l'écran (saisie en cours).
function refreshSave() { const b = document.querySelector('[data-click="save"]'); if (b) b.disabled = busy || !dirty; }
