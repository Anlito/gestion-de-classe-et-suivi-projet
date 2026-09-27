// Documents imprimables (→ « Enregistrer au format PDF ») : fiche élève, fiches de toute la classe, récapitulatif de classe.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, raw, fmtDay, fmtDayYear, fmtDate } from '../ui.js';
import { icon } from '../components.js';
import { go } from '../nav.js';
import { projectResults, recapRows } from '../backup.js';

function counters(s) {
  const t = model.trimester();
  return html`<table class="doc-table counters-t">
    <tr><th></th>${[1, 2, 3].map(k => html`<th>Trimestre ${k}</th>`)}</tr>
    ${['neg', 'pos'].map(type => html`<tr><th class="left">${model.LABEL[type]}</th>${[1, 2, 3].map(k => html`<td>${k > t ? 'à venir' : model.countsOf(s.id, k)[type]}</td>`)}</tr>`)}
  </table>`;
}

function fiche(s) {
  const c = db.get('classes', s.classId);
  const url = db.photoURL(s.photoId);
  const results = projectResults(s);
  const notes = model.notesOf(s.id);
  const obs = model.observationsOf(s.id).slice().reverse();
  return html`<section class="doc-page">
    <div class="doc-head">
      ${url ? html`<img class="doc-photo" src="${url}" alt="">` : html`<div class="doc-photo empty">Photo<br>manquante</div>`}
      <div class="grow">
        <div class="doc-kicker">Fiche élève · ${model.schoolYear()} · ${c ? c.name : ''}</div>
        <div class="doc-name">${s.prenom} <span class="upper">${s.nom}</span></div>
        <div class="doc-muted">Éditée le ${fmtDayYear(new Date())}</div>
      </div>
    </div>
    <h2>Comportement et aide, par trimestre</h2>
    ${counters(s)}
    <h2>Résultats des projets</h2>
    ${results.length ? html`<table class="doc-table">
      <tr><th class="left">Projet</th><th>Groupe</th><th class="left">Niveaux par critère</th><th>Note /20</th><th>Mention</th></tr>
      ${results.map(x => html`<tr>
        <td class="left"><strong>${x.p.title}</strong><br><span class="doc-muted">${model.STATUS[x.a.status]}${x.a.endedAt ? ' le ' + fmtDate(x.a.endedAt) : ''}</span></td>
        <td>${x.group || '—'}</td>
        <td class="left">${x.p.criteria.map(cr => html`<span class="doc-lvl">${cr.code} : ${x.levels[cr.id] == null ? '—' : x.levels[cr.id] + ' ' + model.LEVELS[x.levels[cr.id] - 1].pronote}</span>`)}
          ${x.adj ? html`<div class="doc-muted">Ajustement individuel : ${[x.adj.motif, x.adj.precision].filter(Boolean).join(' — ')}</div>` : ''}</td>
        <td><strong>${model.f1(x.r.n)}</strong>${x.r.complete ? '' : html`<br><span class="doc-muted">provisoire ${x.r.filled}/${x.r.total}</span>`}</td>
        <td>${x.r.complete ? model.mention(x.r.n) : '—'}</td>
      </tr>`)}
    </table>` : html`<p class="doc-muted">Aucune évaluation pour l’instant.</p>`}
    <h2>Notes</h2>
    ${notes.length ? notes.map(n => html`<div class="doc-note"><span class="doc-muted">${fmtDayYear(n.at)}</span><div>${n.text}</div></div>`) : html`<p class="doc-muted">Aucune note.</p>`}
    <h2>Détail des observations</h2>
    ${obs.length ? [1, 2, 3].filter(k => obs.some(o => o.trimester === k)).map(k => html`<div class="doc-tri"><strong>Trimestre ${k}</strong>
      <ul class="doc-obs">${obs.filter(o => o.trimester === k).map(o => html`<li><span class="dot ${o.type}"></span>${fmtDay(o.at)} · ${model.obsTitle(o)}${o.seanceLabel ? ' · ' + o.seanceLabel : ''}</li>`)}</ul></div>`)
      : html`<p class="doc-muted">Aucune observation.</p>`}
  </section>`;
}

function recap(c) {
  const { rows } = recapRows(c.id);
  const [head, ...body] = rows;
  return html`<section class="doc-page">
    <div class="doc-kicker">Récapitulatif · ${model.schoolYear()} · édité le ${fmtDayYear(new Date())}</div>
    <div class="doc-name">${c.name} <span class="doc-muted">· ${body.length} élèves</span></div>
    <table class="doc-table recap">
      <tr>${head.map((h, i) => html`<th class="${i < 2 ? 'left' : ''}">${h}</th>`)}</tr>
      ${body.map(r => html`<tr>${r.map((v, i) => html`<td class="${i < 2 ? 'left' : ''}">${i === 0 ? html`<strong>${v}</strong>` : v}</td>`)}</tr>`)}
    </table>
    <p class="doc-muted">Colonnes « Comportement » et « Aide » : nombre d’observations du trimestre. Notes de projet : niveaux 1 à 4 ramenés sur 20, ajustements individuels compris.</p>
  </section>`;
}

export default {
  render({ kind, id }) {
    let title = '', body = '', back = '#/', landscape = false;
    if (kind === 'eleve') {
      const s = db.get('students', id);
      if (!s) { go('#/', { replace: true }); return null; }
      title = 'Fiche de ' + model.fullName(s); body = fiche(s); back = `#/classe/${s.classId}/eleve/${s.id}`;
    } else {
      const c = db.get('classes', id);
      if (!c) { go('#/', { replace: true }); return null; }
      back = '#/admin/sauvegarde';
      if (kind === 'fiches') { title = 'Fiches élèves · ' + c.name; body = model.studentsOf(c.id).map(fiche); }
      else { title = 'Récapitulatif · ' + c.name; body = recap(c); landscape = true; }
    }
    return html`<div class="screen print-screen">
      ${raw(`<style>@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }</style>`)}
      <header class="topbar no-print">
        <a class="back" href="${back}">${icon.back}<span class="back-label">Retour</span></a>
        <div class="title ellipsis">${title}</div>
        <div class="spacer"></div>
        <span class="muted small hide-narrow">Imprimante : « Enregistrer au format PDF »</span>
        <button type="button" class="btn accent" data-click="print">Imprimer / PDF</button>
      </header>
      <main class="content doc-wrap"><div class="doc${landscape ? ' landscape' : ''}">${body}</div></main>
    </div>`;
  },
  actions: {
    print() { window.print(); },
  },
};
