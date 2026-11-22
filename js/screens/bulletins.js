// Onglet Bulletins : grille des constats par élève (critères à 3 niveaux, note, tendance, remarque, présence),
// triée par groupe du projet choisi ou par ordre alphabétique. Fiche détaillée d'un élève dans un panneau latéral.
import * as db from '../db.js';
import * as model from '../model.js';
import * as B from '../bulletins.js';
import { html, toast, openMenu } from '../ui.js';
import { backLink, tabBar, projectSwitch, icon, photo } from '../components.js';
import { go, refresh } from '../nav.js';
import { giveFile, givenMessage } from '../backup.js';

const trimOf = {};            // trimestre affiché, par classe (par défaut : le trimestre en cours)
let openSid = null;           // élève dont la fiche est ouverte
let exp = null;               // fenêtre d'export ouverte : { scope:'prets'|'tous'|'g:<groupId>', discipline, ton, formulation }
let mode = (() => { try { return localStorage.getItem('carnet-bulletins-vue') || 'constats'; } catch (e) { return 'constats'; } })(); // 'constats' (grille) ou 'appreciations' (relecture et copie dans Pronote)
let imp = null;               // fenêtre d'import ouverte : { text, parsed, error }
let onlyNotDone = false;
let scrollToSid = null;       // ligne à amener à l'écran après « Copier »
let onlyTodo = false;
let sortMode = (() => { try { return localStorage.getItem('carnet-bulletins-tri') || 'group'; } catch (e) { return 'group'; } })();
const pending = new Map();
let timer = null;
function flush() { clearTimeout(timer); for (const fn of pending.values()) fn(); pending.clear(); }
function later(key, fn) { pending.set(key, fn); clearTimeout(timer); timer = setTimeout(flush, 600); }
addEventListener('pagehide', flush);

const trimester = classId => trimOf[classId] || model.trimester();
// Projet dont on remplit les critères (1.34.0) : celui choisi dans l'en-tête ; aucun projet → critères du trimestre.
const critAid = classId => { const a = model.chosenAssignment(classId); return a ? a.id : null; };
const f1 = model.f1;

// Photo affichée au survol du prénom (ordinateur) ; rien si l'élève n'a pas de photo.
// Départ ou arrivée pendant le trimestre affiché (1.33.0).
const moveText = (s, t) => (s.departTrimester === t ? model.departLabel(s) : s.arriveTrimester === t && t > 1 ? model.arriveLabel(s) : '');
const ddmm = d => (d || '').slice(8, 10) + '/' + (d || '').slice(5, 7);
const moveChip = (s, t) => {
  const m = moveText(s, t);
  return m ? html`<span class="chip" title="${m} · présence partielle proposée">${s.departTrimester === t ? 'Parti·e ' + ddmm(s.departDate) : 'Arrivé·e ' + ddmm(s.arriveDate)}</span>` : '';
};
const hoverPhoto = s => (s.photoId && db.photoURL(s.photoId) ? photo(s, { cls: 'big bul-pop', label: false }) : '');

// Lignes du tableau : par groupe (projet choisi), élèves sans groupe à la fin ; ou par ordre alphabétique.
function sections(classId, students, a) {
  if (sortMode !== 'group' || !a) return [{ title: null, students }];
  const out = [], placed = new Set();
  for (const g of model.groupsOf(a.id)) {
    const m = students.filter(s => g.members.includes(s.id));
    m.forEach(s => placed.add(s.id));
    if (m.length) out.push({ title: 'Groupe ' + g.code, students: m });
  }
  const rest = students.filter(s => !placed.has(s.id));
  if (rest.length) out.push({ title: out.length ? 'Sans groupe' : null, students: rest });
  return out;
}

function cell(s, rec, f, t, prev) {
  const v = rec.levels[f.k], n = (rec.details[f.k] || []).length, p = prev && prev.levels[f.k], ev = B.evolution(p, v);
  return html`<td><button type="button" class="bul-cell${v ? ' bl-' + v : ''}" data-click="cycle" data-sid="${s.id}" data-k="${f.k}"
    aria-label="${s.prenom}, ${f.label} : ${v ? B.LEVEL_LABEL[v] : 'non renseigné'}">${v ? B.LEVEL_SYMBOL[v] : '+'}${n ? html`<span class="bul-dot" aria-hidden="true"></span>` : ''}${p ? html`<span class="bul-prev${ev ? ' ev-' + ev : ''}" title="Trimestre ${t - 1} : ${B.LEVEL_LABEL[p]}">T${t - 1} ${B.LEVEL_SYMBOL[p]}</span>` : ''}</button></td>`;
}
function row(s, t, aid) {
  const rec = B.recordOf(s, t, undefined, aid), st = B.stateOf(rec), prev = B.previousOf(s, t), c = model.countsOf(s.id, t);
  const name = html`<td class="bul-name"><button type="button" class="bul-namebtn" data-click="open" data-sid="${s.id}">
    <span class="grow ellipsis"><strong>${s.prenom}</strong> <span class="muted">${s.nom || ''}</span></span>${hoverPhoto(s)}
    ${c.pos || c.neg ? html`<span class="bul-obs" title="Carnet, trimestre ${t} : ${c.pos} +, ${c.neg} −">${c.pos ? html`<span class="pos">+${c.pos}</span>` : ''}${c.neg ? html`<span class="neg">−${c.neg}</span>` : ''}</span>` : ''}
    ${moveText(s, t) ? moveChip(s, t) : rec.presence === 'partielle' ? html`<span class="chip warn">Présence partielle</span>` : ''}</button></td>`;
  if (rec.presence === 'dispense') {
    return html`<tr class="bul-disp">${name}<td colspan="${B.families().length + 3}" class="muted small bul-disp-txt">Dispensé ce trimestre · non évalué</td>
      <td><span class="bul-badge b-disp">${B.STATE_LABEL.disp}</span></td></tr>`;
  }
  // Avec un projet choisi : sa note seule (vide tant qu'il n'est pas noté) ; sinon la note du trimestre.
  const pn = aid ? B.projectNote(s, aid) : null, note = aid ? null : B.noteOf(s, rec, t);
  return html`<tr>${name}${B.families().map(f => cell(s, rec, f, t, prev))}
    ${aid ? html`<td class="bul-note"><strong>${pn == null ? '—' : f1(pn)}</strong><span class="bul-auto">${pn == null ? 'non noté' : ''}</span></td>`
      : html`<td class="bul-note"><strong>${f1(note.n)}</strong><span class="bul-auto">${note.n == null ? '' : note.manual ? 'corrigée' : 'auto'}</span></td>`}
    <td class="small">${rec.tendance || '—'}</td>
    <td>${rec.info && rec.info.trim() ? html`<span class="bul-info" title="${rec.info}">✎</span>` : html`<span class="muted">—</span>`}</td>
    <td><span class="bul-badge b-${st}">${B.STATE_LABEL[st]}</span></td></tr>`;
}

function drawer(classId, s, t, mates, aid) {
  const rec = B.recordOf(s, t, undefined, aid), projs = aid ? B.exportProjects(classId, t).map(x => x.id) : [],
    others = projs.filter(id => id !== aid).map(id => ({ title: B.projectTitle(id), rec: B.recordOf(s, t, undefined, id), before: projs.indexOf(id) < projs.indexOf(aid) || !projs.includes(aid) })), note = B.noteOf(s, rec, t), auto = B.autoNote(s, t), h = B.hintsOf(s, t), pn = aid ? B.projectNote(s, aid) : null;
  const facts = [
    h.neg ? h.neg + ' remarque' + (h.neg > 1 ? 's' : '') + ' Comportement' + (h.negMotifs.length ? ' (' + h.negMotifs.join(', ') + ')' : '') : '',
    h.pos ? h.pos + ' remarque' + (h.pos > 1 ? 's' : '') + ' Aide' + (h.posMotifs.length ? ' (' + h.posMotifs.join(', ') + ')' : '') : '',
    h.absences + ' absence' + (h.absences > 1 ? 's' : ''), h.retards + ' retard' + (h.retards > 1 ? 's' : ''),
  ].filter(Boolean);
  const disp = rec.presence === 'dispense', prev = B.previousOf(s, t);
  const carry = prev && prev.presence !== 'normale' && rec.presence === 'normale' ? prev.presence : null;
  return html`<div class="scrim dim" data-click="close"></div>
    <aside class="drawer bul-drawer" aria-label="Fiche de ${s.prenom}">
      <div class="drawer-head"><span class="drawer-title grow ellipsis">${model.fullName(s)} · T${t}</span>
        <button type="button" class="btn accent" data-click="close">Terminé</button></div>
      <div class="drawer-body" data-scroll="bul-drawer">
        <div class="bul-who">${photo(s, { cls: 'big' })}<div class="bul-who-txt"><strong>${model.fullName(s)}</strong>
          <span class="muted small">${[moveText(s, t), aid ? B.projectTitle(aid) + ' : ' + (pn == null ? 'pas encore noté' : f1(pn)) : note.n == null ? '' : 'Note ' + f1(note.n), rec.presence === 'partielle' ? 'Présence partielle' : rec.presence === 'dispense' ? 'Dispensé' : ''].filter(Boolean).join(' · ')}</span></div></div>
        <div class="chips-row bul-mates">${mates.map(m => html`<button type="button" class="pill${m.id === s.id ? ' on' : ''}" data-click="open" data-sid="${m.id}">${m.prenom}</button>`)}</div>
        <div class="bul-block"><span class="caps">Accord des appréciations</span>
          <div class="segmented">${Object.entries(B.GENRES).map(([k, label]) => html`<button type="button" class="seg${s.genre === k ? ' on' : ''}" data-click="genre" data-v="${k}">${label}</button>`)}</div>
          <span class="muted small">${s.genre === 'n' ? 'Claude écrira sans accord ni pronom genré (il, elle). Réglage gardé pour toute l’année.' : B.GENRES[s.genre] ? 'Claude accordera au ' + B.ACCORD[s.genre] + '. Réglage gardé pour toute l’année.' : 'Non renseigné : Claude écrira sans accord (« fait preuve de sérieux »…).'}</span></div>
        <div class="bul-block"><span class="caps">Présence en cours ce trimestre</span>
          <div class="segmented">${Object.entries(B.PRESENCE).map(([k, label]) => html`<button type="button" class="seg${rec.presence === k ? ' on' : ''}" data-click="presence" data-v="${k}">${label}</button>`)}</div>
          <span class="muted small">${rec.presence === 'partielle' ? 'Emploi du temps aménagé, absent certains cours… Remplissez seulement les critères que vous avez pu observer.'
            : disp ? 'Non évalué ce trimestre : aucune case à remplir.' : 'Suit le cours normalement.'}</span>
          ${moveText(s, t) ? html`<span class="muted small">${moveText(s, t)} : présence partielle proposée ; l’appréciation reste à faire pour ce trimestre.${s.departTrimester === t ? ' L’élève n’apparaîtra plus au trimestre suivant.' : ''}</span>` : ''}
          ${carry ? html`<button type="button" class="btn soft small bul-carry" data-click="presence" data-v="${carry}">Reprendre « ${B.PRESENCE[carry]} » comme au trimestre ${t - 1}</button>` : ''}</div>
        ${disp ? '' : html`
        <div class="bul-hint"><strong>Ce que le Carnet a noté ce trimestre</strong><span>${facts.join(' · ')}</span>
          <span class="muted small">Pour vous aider : rien n’est coché à votre place.</span></div>
        ${aid ? html`<div class="bul-block bul-proj"><span class="caps">Critères du projet</span><strong>${B.projectTitle(aid)} · ${pn == null ? 'pas encore noté' : 'note ' + f1(pn) + ' /20'}</strong>
          <span class="muted small">Chaque projet a ses propres critères : changez de projet en haut de la grille.${others.length ? ' Les autres projets sont rappelés sous chaque critère.' : ''}</span></div>` : ''}
        ${B.families().map(f => html`<div class="bul-fam">
          <div class="bul-fam-head"><strong class="grow">${f.label}</strong>
            <div class="bul-lv">${B.LEVELS.map(v => html`<button type="button" class="bl-${v}${rec.levels[f.k] === v ? ' on' : ''}" data-click="level" data-k="${f.k}" data-v="${v}">${B.LEVEL_SYMBOL[v]} ${B.LEVEL_LABEL[v]}</button>`)}</div></div>
          ${others.length ? html`<div class="bul-other small">${others.map(o => { const v = o.rec.levels[f.k], ev = o.before ? B.evolution(v, rec.levels[f.k]) : B.evolution(rec.levels[f.k], v); return html`<span class="${ev && ev !== 'same' ? 'ev-' + ev : ''}">${o.title} : ${B.LEVEL_SYMBOL[v]} ${B.LEVEL_LABEL[v]}</span>`; })}</div>` : ''}
          <div class="bul-desc">${[...f.pos, ...f.neg].map(d => html`<button type="button" class="${(rec.details[f.k] || []).includes(d) ? 'on' : ''}" data-click="detail" data-k="${f.k}" data-d="${d}">${d}</button>`)}</div>
        </div>`)}
        <div class="bul-block"><span class="caps">Note du bulletin /20 (tous les projets notés du trimestre)</span>
          <div class="bul-noterow"><input class="input bul-notein" inputmode="decimal" data-change="note" value="${note.n == null ? '' : f1(note.n)}" aria-label="Note du trimestre sur 20" placeholder="—">
            <span class="muted small grow">${note.manual ? html`Corrigée à la main. <button type="button" class="linkbtn" data-click="resetNote">Revenir à ${auto.n == null ? 'la note calculée' : f1(auto.n)}</button>`
              : auto.projects.length ? 'Moyenne de l’onglet Notes : ' + auto.projects.map(p => p.title + ' ' + f1(p.n)).join(' · ')
              : 'Aucun projet noté ce trimestre dans l’onglet Notes.'}</span></div></div>
        <div class="bul-block"><span class="caps">Tendance</span>
          <div class="segmented">${B.TENDANCES.map(v => html`<button type="button" class="seg${rec.tendance === v ? ' on' : ''}" data-click="tendance" data-v="${v}">${v}</button>`)}</div></div>
        `}
        <label class="bul-block"><span class="caps">Remarque personnelle (facultatif)</span>
          <textarea class="input" rows="3" maxlength="1000" data-input="info" placeholder="Ex. : a pris en main la programmation du groupe, a beaucoup progressé en modélisation 3D…">${rec.info}</textarea>
          <span class="muted small">Elle servira à l’appréciation. N’y mettez ni nom, ni information médicale ou familiale.</span></label>
      </div>
    </aside>`;
}

// Élèves retenus pour l'export, dans l'ordre de la classe, et fichier correspondant.
function exportPlan(c, t, students, a) {
  const options = B.exportProjects(c.id, t), aids = options.map(x => x.id).filter(id => exp.aids.includes(id));
  const multi = aids.length > 1;
  const all = students.map(s => ({ student: s, rec: B.recordOf(s, t, undefined, aids[0] || null) }));
  const g = exp.scope.startsWith('g:') ? db.get('groups', exp.scope.slice(2)) : null;
  const inScope = all.filter(e => exp.scope === 'tous' || (g ? g.members.includes(e.student.id) : B.stateOf(e.rec) === 'ok'));
  const entries = inScope.map(e => { const p = B.previousOf(e.student, t);
    return { ...e, note: B.noteOf(e.student, e.rec, t, aids.length ? aids : null).n, prev: p ? p.levels : null,
      ...(multi ? { parts: aids.map(id => B.recordOf(e.student, t, undefined, id)) } : {}) }; });
  const projects = aids.map(id => ({ titre: B.projectTitle(id), etat: B.projectState(id) }));
  const built = B.buildExport({ classe: c.name, niveau: B.levelLabel(c), trimester: t, year: model.schoolYear(), projects, options: exp, entries, exportId: exp.id });
  const disp = inScope.filter(e => e.rec.presence === 'dispense').length;
  const notReady = inScope.filter(e => !['ok', 'disp'].includes(B.stateOf(e.rec))).length;
  return { ...built, disp, notReady, file: B.exportFileName(c, t), groups: a ? model.groupsOf(a.id) : [], options, aids };
}
function exportDialog(c, t, plan) {
  const n = plan.data.eleves.length;
  return html`<div class="scrim dim" data-click="closeExport"></div>
    <div class="bul-export" role="dialog" aria-modal="true" aria-label="Exporter pour Claude">
      <div class="drawer-head"><div class="grow"><div class="drawer-title">Exporter pour Claude</div>
        <div class="muted small">${plan.file} · ${n} élève${n > 1 ? 's' : ''} · trimestre ${t}</div></div></div>
      <div class="bul-export-body">
        <div class="bul-export-opts">
          <label class="bul-block"><span class="caps">Élèves</span>
            <select class="input" data-change="expOpt" data-key="scope">
              <option value="prets" ${exp.scope === 'prets' ? 'selected' : ''}>Seulement les élèves prêts</option>
              <option value="tous" ${exp.scope === 'tous' ? 'selected' : ''}>Toute la classe</option>
              ${plan.groups.map(g => html`<option value="g:${g.id}" ${exp.scope === 'g:' + g.id ? 'selected' : ''}>Groupe ${g.code}</option>`)}
            </select></label>
          ${plan.options.length ? html`<div class="bul-block"><span class="caps">Projets pris en compte</span>
            ${plan.options.map(x => html`<label class="bul-check"><input type="checkbox" data-change="expProj" data-id="${x.id}" ${plan.aids.includes(x.id) ? 'checked' : ''}> ${B.projectTitle(x.id)} <span class="muted small">${B.projectState(x.id)}</span></label>`)}
            <span class="muted small">${!plan.aids.length ? 'Cochez au moins un projet.' : plan.aids.length > 1 ? 'Critères envoyés projet par projet : Claude signalera l’évolution de l’un à l’autre, même si le dernier n’est pas terminé. Note calculée sur ces projets.' : 'Critères et note de ce seul projet.'}</span></div>` : ''}
          <label class="bul-block"><span class="caps">Discipline</span>
            <input class="input" data-change="expOpt" data-key="discipline" value="${exp.discipline}" maxlength="60"></label>
          <label class="bul-block"><span class="caps">Ton</span>
            <select class="input" data-change="expOpt" data-key="ton">${B.TONES.map(v => html`<option ${exp.ton === v ? 'selected' : ''}>${v}</option>`)}</select></label>
          <label class="bul-block"><span class="caps">Formulation</span>
            <select class="input" data-change="expOpt" data-key="formulation">${B.PERSONS.map(v => html`<option ${exp.formulation === v ? 'selected' : ''}>${v}</option>`)}</select></label>
          <label class="bul-block"><span class="caps">Cadre du cours</span>
            <textarea class="input" rows="4" maxlength="400" data-change="expOpt" data-key="cadre">${exp.cadre}</textarea>
            <span class="muted small">Comment se passent vos séances : Claude ne parlera pas de ce qui n’y a pas lieu (oral, interrogations…). Sans nom d’élève. Gardé pour les prochains exports.
              ${exp.cadre !== B.CADRE_DEFAUT ? html`<button type="button" class="link-btn" data-click="cadreDefaut">Texte proposé</button>` : ''}</span></label>
          <div class="bul-block"><span class="caps">Longueur</span><strong>${B.MAX_CHARS} caractères maximum</strong></div>
          ${plan.notReady ? html`<div class="bul-hint"><strong>${plan.notReady} élève${plan.notReady > 1 ? 's' : ''} pas encore prêt${plan.notReady > 1 ? 's' : ''}</strong><span class="small">Envoyé${plan.notReady > 1 ? 's' : ''} avec les critères déjà renseignés.</span></div>` : ''}
          <div class="bul-safe"><strong>Ne sortent pas du Carnet</strong><span class="small">Noms de famille, photos, dispositifs (PAP…), absences, remarques du Carnet${plan.disp ? ', ' + plan.disp + ' élève' + (plan.disp > 1 ? 's' : '') + ' dispensé' + (plan.disp > 1 ? 's' : '') : ', élèves dispensés'}.</span></div>
        </div>
        <div class="bul-block bul-preview"><span class="caps">Contenu exact du fichier</span>
          <pre class="bul-json" data-scroll="bul-json">${JSON.stringify(plan.data, null, 2)}</pre></div>
      </div>
      <div class="drawer-foot"><span class="muted small grow">Envoyez ce fichier à Claude : il vous renverra une appréciation par élève.</span>
        <button type="button" class="btn" data-click="closeExport">Annuler</button>
        <button type="button" class="btn accent" data-click="saveExport" ${n && (plan.aids.length || !plan.options.length) ? '' : 'disabled'}>${icon.download}Enregistrer le fichier</button></div>
    </div>`;
}

// ---------- Retour des appréciations (1.28.0) ----------
const appText = rec => rec.appreciation || (rec.presence === 'dispense' ? B.DISPENSE_TEXT : '');
function appreciationsView(students, t) {
  const rows = students.map(s => ({ s, rec: B.recordOf(s, t) })).filter(x => !onlyNotDone || !x.rec.pronote);
  return html`<div class="bul-apps">${rows.map(({ s, rec }) => {
    const text = appText(rec), note = rec.presence === 'dispense' ? null : B.noteOf(s, rec, t).n, n = text.length;
    return html`<div class="bul-app${rec.pronote ? ' done' : ''}" data-row="${s.id}">
      <div class="bul-app-who">${hoverPhoto(s)}<strong>${s.prenom}</strong> <span class="muted">${s.nom || ''}</span>
        <span class="muted small">${rec.presence === 'dispense' ? 'Dispensé' : 'Note ' + f1(note)}${rec.presence === 'partielle' ? ' · présence partielle' : ''}${moveText(s, t) ? ' · ' + moveText(s, t) : ''}</span></div>
      <div class="bul-app-text"><textarea class="input" rows="3" data-input="app" data-sid="${s.id}"
          placeholder="Pas encore d’appréciation : exportez pour Claude puis importez le retour, ou écrivez-la ici.">${text}</textarea>
        <span class="bul-count${n > B.MAX_CHARS ? ' over' : ''}">${n} / ${B.MAX_CHARS} caractères${n > B.MAX_CHARS ? ' · trop long pour Pronote' : ''}</span></div>
      <div class="bul-app-act">
        <button type="button" class="btn ${rec.pronote ? 'soft' : 'accent'}" data-click="copy" data-sid="${s.id}" ${text ? '' : 'disabled'}>${rec.pronote ? 'Copier à nouveau' : 'Copier'}</button>
        <label class="bul-check small"><input type="checkbox" data-change="done" data-sid="${s.id}" ${rec.pronote ? 'checked' : ''}> Saisie dans Pronote</label>
      </div></div>`;
  })}${!rows.length ? html`<p class="bul-empty">Toutes les appréciations sont saisies dans Pronote.</p>` : ''}</div>`;
}
function importDialog(classId) {
  const p = imp.parsed, other = p && p.mapping.classId !== classId ? db.get('classes', p.mapping.classId) : null;
  const long = p ? p.items.filter(i => i.tooLong).length : 0;
  return html`<div class="scrim dim" data-click="closeImport"></div>
    <div class="bul-export bul-import" role="dialog" aria-modal="true" aria-label="Importer les appréciations">
      <div class="drawer-head"><div class="grow"><div class="drawer-title">Importer les appréciations</div>
        <div class="muted small">Le fichier renvoyé par Claude, ou son contenu collé depuis la conversation.</div></div></div>
      <div class="bul-import-body">
        <label class="btn soft bul-file">${icon.download}Choisir le fichier<input type="file" accept=".json,application/json,text/plain" data-change="impFile" hidden></label>
        <label class="bul-block"><span class="caps">Ou collez le contenu</span>
          <textarea class="input bul-paste" rows="6" data-input="impText" placeholder='{ "format": "carnet-appreciations-v1", … }'>${imp.text}</textarea></label>
        ${imp.error ? html`<div class="bul-hint"><strong>Lecture impossible</strong><span>${imp.error}</span></div>` : ''}
        ${p ? html`<div class="bul-safe"><strong>${p.items.length} appréciation${p.items.length > 1 ? 's' : ''} pour ${other ? other.name : db.get('classes', classId).name} · trimestre ${p.mapping.trimester}</strong>
          <span class="small">${[long ? long + ' dépasse' + (long > 1 ? 'nt' : '') + ' ' + B.MAX_CHARS + ' caractères (à raccourcir avant Pronote)' : '',
            p.missing.length ? p.missing.length + ' élève' + (p.missing.length > 1 ? 's' : '') + ' de l’export sans appréciation' : '',
            p.unknown.length ? 'codes inconnus ignorés : ' + p.unknown.join(', ') : '',
            p.classe ? '' : 'classe non indiquée dans le fichier (rattaché par son identifiant d’export)',
            other ? 'Ce fichier concerne la classe ' + other.name + ' : elle s’ouvrira après l’import.' : ''].filter(Boolean).join(' · ') || 'Tout correspond à l’export.'}</span></div>` : ''}
      </div>
      <div class="drawer-foot"><span class="grow"></span>
        <button type="button" class="btn" data-click="closeImport">Annuler</button>
        ${p ? html`<button type="button" class="btn accent" data-click="doImport" ${p.items.length ? '' : 'disabled'}>Importer ${p.items.length} appréciation${p.items.length > 1 ? 's' : ''}</button>`
          : html`<button type="button" class="btn accent" data-click="readImport" ${imp.text.trim() ? '' : 'disabled'}>Lire</button>`}</div>
    </div>`;
}
function readImport(text) {
  imp = { text, parsed: null, error: '' };
  try { imp.parsed = B.parseReturn(text, B.mappingOf); } catch (e) { imp.error = e.message; }
  refresh();
}
async function copyText(text, el) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const ta = el && el.closest('.bul-app') && el.closest('.bul-app').querySelector('textarea');
    if (!ta) return false;
    ta.focus(); ta.select();
    try { return document.execCommand('copy'); } catch (e2) { return false; }
  }
}

export default {
  mount(root) {
    if (!scrollToSid) return;
    const r = root.querySelector(`[data-row="${scrollToSid}"]`);
    scrollToSid = null;
    if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('next'); }
  },
  render({ classId }) {
    const c = db.get('classes', classId);
    if (!c) { go('#/', { replace: true }); return null; }
    const t = trimester(classId);
    const students = model.studentsOf(classId, t);
    const list = model.selectableAssignments(classId, ['cours', 'avenir', 'fini']);
    const a = model.chosenAssignment(classId);
    const p = a && db.get('projects', a.projectId);
    const secs = sections(classId, students, a);
    const aid = a ? a.id : null;
    const recs = students.map(s => B.recordOf(s, t, undefined, aid));
    const disp = recs.filter(r => r.presence === 'dispense').length, ready = recs.filter(r => B.stateOf(r) === 'ok').length, total = students.length - disp;
    const shown = s => !onlyTodo || !['ok', 'disp'].includes(B.stateOf(B.recordOf(s, t, undefined, aid)));
    const cols = B.families().length + 5;
    const open = openSid && students.find(s => s.id === openSid);
    if (openSid && !open) openSid = null;
    const mates = open ? (secs.find(x => x.students.includes(open)) || { students }).students : [];

    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/', 'Accueil')}
        <div class="heading"><span class="title">${c.name}</span><span class="sub">Bulletins · Trimestre ${t}</span></div>
        <div class="spacer"></div>
        <div class="segmented head-seg" role="group" aria-label="Affichage">
          <button type="button" class="seg${mode === 'constats' ? ' on' : ''}" data-click="mode" data-v="constats">Constats</button>
          <button type="button" class="seg${mode === 'appreciations' ? ' on' : ''}" data-click="mode" data-v="appreciations">Appréciations</button></div>
        <div class="segmented head-seg" role="group" aria-label="Trimestre">${[1, 2, 3].map(n => html`<button type="button" class="seg${n === t ? ' on' : ''}" data-click="trim" data-t="${n}">T${n}</button>`)}</div>
        ${mode === 'constats'
          ? html`<button type="button" class="btn accent" data-click="openExport" ${students.length ? '' : 'disabled'}>${icon.download}<span class="hide-phone">Exporter pour Claude</span></button>`
          : html`<button type="button" class="btn accent" data-click="openImport">${icon.plusBig}<span class="hide-phone">Importer les appréciations</span></button>`}
      </header>
      ${mode === 'appreciations' ? (() => {
        const rs = students.map(s => B.recordOf(s, t)), done = rs.filter(r => r.pronote).length, have = rs.filter(r => appText(r)).length;
        return html`<div class="bul-bar">
          <span class="muted small">Ordre de Pronote (nom de famille). « Copier » copie le texte, le marque saisi et passe à l’élève suivant.</span>
          <label class="bul-check"><input type="checkbox" data-change="notDone" ${onlyNotDone ? 'checked' : ''}> Non saisies seulement</label>
          <span class="spacer"></span>
          <span class="bul-prog"><span>${have} appréciation${have > 1 ? 's' : ''} · ${done} / ${students.length} saisie${done > 1 ? 's' : ''} dans Pronote</span>
            <span class="bul-track"><i style="width:${students.length ? Math.round(done / students.length * 100) : 0}%"></i></span></span>
        </div>
        <main class="content bul-content" data-scroll="bul-apps">${appreciationsView(students, t)}</main>
        ${tabBar(classId, 'bulletins')}
        ${imp ? importDialog(classId) : ''}`;
      })() : html`
      <div class="bul-bar">
        <div class="segmented" role="group" aria-label="Ordre des élèves">
          <button type="button" class="seg${sortMode === 'group' ? ' on' : ''}" data-click="sort" data-v="group">Par groupe</button>
          <button type="button" class="seg${sortMode === 'alpha' ? ' on' : ''}" data-click="sort" data-v="alpha">A → Z</button></div>
        ${list.length > 1 ? html`<span class="muted small">Critères du projet</span>${projectSwitch(list, a)}` : p ? html`<span class="muted small">Critères du projet <strong>${p.title}</strong></span>` : ''}
        <a class="btn soft small" href="#/admin/bulletins">Critères</a>
        <label class="bul-check"><input type="checkbox" data-change="todo" ${onlyTodo ? 'checked' : ''}> À compléter seulement</label>
        <span class="spacer"></span>
        <span class="bul-legend">${B.LEVELS.map(v => html`<span><i class="bul-sw bl-${v}"></i>${B.LEVEL_LABEL[v]}</span>`)}</span>
        <span class="bul-prog"><span>${ready} / ${total} prêt${ready > 1 ? 's' : ''}${disp ? ' · ' + disp + ' dispensé' + (disp > 1 ? 's' : '') : ''}</span>
          <span class="bul-track"><i style="width:${total ? Math.round(ready / total * 100) : 0}%"></i></span></span>
      </div>
      <main class="content bul-content" data-scroll="bulletins">
        ${students.length ? html`<table class="bul-grid">
          <thead><tr><th class="bul-name">Élève</th>${B.families().map(f => html`<th>${f.label}</th>`)}<th>${aid ? 'Note du projet' : 'Note /20'}</th><th>Tendance</th><th>Remarque</th><th>État</th></tr></thead>
          <tbody>${secs.map(sec => {
            const rows = sec.students.filter(shown);
            if (!rows.length) return '';
            return html`${sec.title ? html`<tr class="bul-grp"><td colspan="${cols}"><div class="bul-grp-in">
                <strong>${sec.title}</strong><span class="muted small">${sec.students.map(s => s.prenom).join(', ')}</span>
                <span class="bul-mini">Travail en équipe pour tout le groupe :${B.LEVELS.map(v => html`<button type="button" class="bl-${v}" data-click="groupLevel" data-ids="${sec.students.map(s => s.id).join(',')}" data-v="${v}" aria-label="${B.LEVEL_LABEL[v]} pour tout le ${sec.title}">${B.LEVEL_SYMBOL[v]}</button>`)}</span>
              </div></td></tr>` : ''}${rows.map(s => row(s, t, aid))}`;
          })}${onlyTodo && !students.some(shown) ? html`<tr><td colspan="${cols}" class="bul-empty">Tous les élèves sont prêts pour ce trimestre.</td></tr>` : ''}</tbody>
        </table>` : html`<div class="center-msg"><div class="soon"><div class="soon-title">Aucun élève</div><p>Ajoutez les élèves depuis la fiche de la classe.</p></div></div>`}
      </main>
      ${tabBar(classId, 'bulletins')}
      ${open ? drawer(classId, open, t, mates, aid) : ''}
      ${exp && !open ? exportDialog(c, t, exportPlan(c, t, students, a)) : ''}`}
    </div>`;
  },
  leave() { flush(); openSid = null; exp = null; imp = null; },
  actions: {
    mode(el) { flush(); openSid = null; exp = null; mode = el.dataset.v; try { localStorage.setItem('carnet-bulletins-vue', mode); } catch (e) { /* stockage indisponible */ } refresh(); },
    notDone(el) { onlyNotDone = el.checked; refresh(); },
    openImport() { imp = { text: '', parsed: null, error: '' }; refresh(); },
    closeImport() { imp = null; refresh(); },
    impText(el) {
      const had = !!imp.text.trim();
      imp = { text: el.value, parsed: null, error: '' };
      if (had !== !!el.value.trim()) { refresh(); const ta = document.querySelector('.bul-paste'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
    },
    readImport() { readImport(imp.text); },
    async impFile(el) { const f = el.files && el.files[0]; if (f) readImport(await f.text()); },
    doImport(el, e, { classId }) {
      const p = imp.parsed;
      const undo = B.importAppreciations(p);
      imp = null; mode = 'appreciations'; onlyNotDone = false;
      trimOf[p.mapping.classId] = p.mapping.trimester;
      const n = p.items.length;
      toast({ text: n + ' appréciation' + (n > 1 ? 's' : '') + ' importée' + (n > 1 ? 's' : ''), undo: async () => { await undo(); refresh(); } });
      if (p.mapping.classId !== classId) go('#/classe/' + p.mapping.classId + '/bulletins'); else refresh();
    },
    app(el, e, { classId }) {
      const s = db.get('students', el.dataset.sid), t = trimester(classId), v = el.value;
      const cnt = el.parentNode.querySelector('.bul-count');
      if (cnt) { cnt.textContent = v.length + ' / ' + B.MAX_CHARS + ' caractères' + (v.length > B.MAX_CHARS ? ' · trop long pour Pronote' : ''); cnt.classList.toggle('over', v.length > B.MAX_CHARS); }
      later('a' + s.id + t, () => B.setAppreciation(s, t, v));
    },
    async copy(el, e, { classId }) {
      flush();
      const t = trimester(classId), s = db.get('students', el.dataset.sid), text = appText(B.recordOf(s, t));
      if (!text) return;
      const ok = await copyText(text, el);
      if (!ok) { toast({ text: 'Copie refusée par le navigateur : sélectionnez le texte et copiez-le à la main.' }); return; }
      B.setPronote(s, t, true, text);
      const list = model.studentsOf(classId, trimester(classId)), i = list.findIndex(x => x.id === s.id);
      const next = list.slice(i + 1).find(x => !B.recordOf(x, t).pronote && appText(B.recordOf(x, t)));
      scrollToSid = next ? next.id : null;
      toast({ text: 'Copié : collez dans Pronote', who: s.prenom });
      refresh();
    },
    done(el, e, { classId }) { flush(); B.setPronote(db.get('students', el.dataset.sid), trimester(classId), el.checked); refresh(); },
    openExport(el, e, { classId }) {
      flush(); openSid = null;
      const ready = model.studentsOf(classId, trimester(classId)).some(s => B.stateOf(B.recordOf(s, trimester(classId))) === 'ok');
      exp = { ...B.exportDefaults(), scope: ready ? 'prets' : 'tous', id: db.uid(), aids: B.exportProjects(classId, trimester(classId)).map(x => x.id) };
      refresh();
    },
    closeExport() { exp = null; refresh(); },
    expOpt(el) { exp = { ...exp, [el.dataset.key]: el.value }; refresh(); },
    cadreDefaut() { exp = { ...exp, cadre: B.CADRE_DEFAUT }; refresh(); },
    expProj(el) { const id = el.dataset.id; exp = { ...exp, aids: el.checked ? [...exp.aids.filter(x => x !== id), id] : exp.aids.filter(x => x !== id) }; refresh(); },
    async saveExport(el, e, { classId }) {
      const c = db.get('classes', classId), t = trimester(classId);
      const plan = exportPlan(c, t, model.studentsOf(classId, t), model.chosenAssignment(classId));
      if (!plan.data.eleves.length || (plan.options.length && !plan.aids.length)) return;
      if (!plan.data.discipline) { toast({ text: 'Indiquez la discipline.' }); return; }
      const json = JSON.stringify(plan.data, null, 2);
      try {
        const r = await giveFile(new Blob([json], { type: 'application/json' }), plan.file);
        if (r.how === 'cancelled') return;
        B.saveExportDefaults(exp);
        B.saveExportMapping(classId, t, exp.id, plan.file, plan.codes);
        exp = null; refresh();
        toast({ text: givenMessage(r, 'Fichier') + ' · à envoyer à Claude', ms: 5000 });
      } catch (err) { toast({ text: 'Fichier non enregistré : ' + (err && err.message || err) }); }
    },
    trim(el, e, { classId }) { flush(); trimOf[classId] = Number(el.dataset.t); refresh(); },
    sort(el) { sortMode = el.dataset.v; try { localStorage.setItem('carnet-bulletins-tri', sortMode); } catch (e) { /* stockage indisponible */ } refresh(); },
    todo(el) { onlyTodo = el.checked; refresh(); },
    pickAssign(el, e, { classId }) { model.chooseAssignment(classId, el.dataset.id); refresh(); },
    pickAssignMenu(el, e, { classId }) {
      const cur = model.chosenAssignment(classId);
      openMenu({ anchor: el, width: 360, align: 'right',
        items: model.selectableAssignments(classId, ['cours', 'avenir', 'fini']).map(a => ({
          label: db.get('projects', a.projectId).title, sub: model.STATUS[a.status], selected: cur && a.id === cur.id,
          onPick: () => { model.chooseAssignment(classId, a.id); refresh(); } })) });
    },
    cycle(el, e, { classId }) { B.cycleLevel(db.get('students', el.dataset.sid), trimester(classId), el.dataset.k, critAid(classId)); refresh(); },
    groupLevel(el, e, { classId }) {
      const ss = el.dataset.ids.split(',').map(id => db.get('students', id)).filter(Boolean);
      const undo = B.setLevelForAll(ss, trimester(classId), 'equipe', el.dataset.v, critAid(classId));
      refresh();
      toast({ text: 'Travail en équipe : ' + B.LEVEL_LABEL[el.dataset.v] + ' pour ' + ss.length + ' élève' + (ss.length > 1 ? 's' : ''), undo: async () => { await undo(); refresh(); } });
    },
    open(el) { flush(); openSid = el.dataset.sid; refresh(); },
    close() { flush(); openSid = null; refresh(); },
    genre(el) { const s = db.get('students', openSid); B.setGenre(s.id, s.genre === el.dataset.v ? '' : el.dataset.v); refresh(); },
    presence(el, e, { classId }) { B.setPresence(db.get('students', openSid), trimester(classId), el.dataset.v); refresh(); },
    level(el, e, { classId }) {
      const s = db.get('students', openSid), t = trimester(classId), v = el.dataset.v, aid = critAid(classId);
      B.setLevel(s, t, el.dataset.k, B.recordOf(s, t, undefined, aid).levels[el.dataset.k] === v ? B.DEFAULT_LEVEL : v, aid); refresh();
    },
    detail(el, e, { classId }) { B.toggleDetail(db.get('students', openSid), trimester(classId), el.dataset.k, el.dataset.d, critAid(classId)); refresh(); },
    tendance(el, e, { classId }) { B.setTendance(db.get('students', openSid), trimester(classId), el.dataset.v); refresh(); },
    note(el, e, { classId }) {
      const s = db.get('students', openSid), t = trimester(classId);
      const auto = B.autoNote(s, t).n, v = el.value.trim();
      try {
        // Saisir la note calculée (ou vider le champ) revient à la note automatique.
        const n = B.validNote(v);
        B.setNote(s, t, n == null || n === auto ? '' : n);
      } catch (err) { toast({ text: err.message }); }
      refresh();
    },
    resetNote(el, e, { classId }) { B.setNote(db.get('students', openSid), trimester(classId), ''); refresh(); },
    info(el, e, { classId }) {
      const s = db.get('students', openSid), t = trimester(classId), v = el.value;
      later('i' + s.id + t, () => B.setInfo(s, t, v));
    },
  },
};
