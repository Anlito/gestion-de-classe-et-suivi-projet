// Administration → Emploi du temps : import des fichiers Pronote (.ics), correspondance des classes,
// aperçu avant validation, établissements (initiales, couleur) et rôle des matières.
import * as db from '../db.js';
import * as model from '../model.js';
import * as planning from '../planning.js';
import { html, toast, confirmDialog, openMenu, fmtDay, fmtDate } from '../ui.js';
import { icon, backLink, saveStatus } from '../components.js';
import { refresh } from '../nav.js';

// Assistant en cours : { mode: 'import'|'edit', step: 'map'|'preview', i (établissement affiché), plans }
let wiz = null;
let busy = '';

function pickIcs() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics,text/calendar';
    input.multiple = true;
    input.addEventListener('change', () => resolve(input.files ? [...input.files] : []), { once: true });
    input.click();
  });
}

const dot = color => html`<span class="etab-dot" style="background:${color}"></span>`;
const plural = (n, one, many) => n + ' ' + (n > 1 ? many : one);
const range = cours => { const d = cours.map(c => c.date).sort(); return d.length ? `du ${fmtDate(d[0])} au ${fmtDate(d[d.length - 1])}` : ''; };
const coursLine = c => `${fmtDay(c.date)} ${c.debut} · ${c.classe || 'sans classe'} · ${c.matiere}${planning.statutLabel(c) ? ' · ' + planning.statutLabel(c) : ''}`;

// ---------- Vue principale ----------
function mainView() {
  const etabs = planning.etablissements();
  const mats = planning.matieres();
  return html`
    <div class="set-block">
      <div class="set-title">Établissements</div>
      ${etabs.length ? etabs.map(e => {
        const cours = planning.coursOfEtab(e.id);
        const linked = Object.values(e.classes || {}).filter(m => m.classId && db.get('classes', m.classId)).length;
        return html`<div class="etab-row">
          ${dot(e.color)}
          <div class="grow">
            <div class="strong-15">${e.name} <span class="chip">${e.initiales}</span></div>
            <div class="muted small">${plural(cours.length, 'cours', 'cours')} ${range(cours)} · ${plural(linked, 'classe reliée', 'classes reliées')}
              ${e.importedAt ? ' · importé le ' + fmtDate(e.importedAt) : ''}</div>
          </div>
          <button type="button" class="btn soft small" data-click="editMap" data-id="${e.id}">Classes</button>
          <button type="button" class="btn soft small" data-click="color" data-id="${e.id}">Couleur</button>
          <button type="button" class="icon-btn" data-click="delEtab" data-id="${e.id}" aria-label="Supprimer l’emploi du temps de ${e.name}">${icon.trash}</button>
        </div>`;
      }) : html`<div class="muted">Aucun emploi du temps importé.</div>`}
      <div class="muted small">Dans Pronote, exportez votre emploi du temps au format iCal (un fichier .ics par collège),
        puis touchez « Importer des fichiers Pronote ». Le fichier est lu sur la tablette : seuls la date, les heures, la classe,
        la salle, la matière et le statut du cours sont gardés (ni noms de professeurs, ni événements de l’agenda).
        Réimporter plus tard un nouvel export met à jour les cours sans les dupliquer.</div>
    </div>
    ${mats.length ? html`<div class="set-block">
      <div class="set-title">Rôle des matières</div>
      <div class="muted small">Cours suivi : appel et séance de projet. Appel seulement : vie de classe. En grisé : visible au planning, sans alerte. Masqué : n’apparaît pas au planning.</div>
      ${mats.map(m => html`<div class="role-row">
        <div class="grow"><div class="strong-15">${m.name}</div><div class="muted xsmall">${plural(m.n, 'cours', 'cours')}</div></div>
        <div class="segmented">${Object.entries(planning.ROLES).map(([k, r]) =>
          html`<button type="button" class="seg${planning.roleOf(m.name) === k ? ' on' : ''}" data-click="role" data-m="${m.name}" data-r="${k}">${r.label}</button>`)}</div>
      </div>`)}
    </div>` : ''}`;
}

// ---------- Assistant : correspondance des classes ----------
function mapView() {
  const p = wiz.plans[wiz.i];
  const classes = model.classes();
  const n = wiz.plans.length;
  return html`<div class="set-block">
      <div class="row-center">${dot(p.color)}<span class="set-title grow">${wiz.mode === 'import' && n > 1 ? `Établissement ${wiz.i + 1} / ${n} · ` : ''}${p.etabName}</span></div>
      <div class="row-center wrap">
        <label class="row-center">Initiales <input class="input ini-in" value="${p.initiales}" maxlength="4" data-input="ini"></label>
        <span class="grow"></span>
        <span class="muted small">Couleur</span>
        <div class="swatches">${planning.PALETTE.map(c => html`<button type="button" class="swatch${c === p.color ? ' on' : ''}" style="background:${c}" data-click="swatch" data-c="${c}" aria-label="Couleur"></button>`)}</div>
      </div>
    </div>
    <div class="set-block">
      <div class="set-title">Classes Pronote → classes de l’app</div>
      <div class="muted small">Pour chaque classe ou groupe de ce collège, choisissez la classe de l’app correspondante, ou « Ignorer ».
        Les propositions (repérées « proposé ») comparent les noms sans espaces, crochets ni initiales du collège. Ce choix est mémorisé pour les imports suivants.</div>
      ${classes.length ? '' : html`<div class="abs-info">Aucune classe dans l’app pour l’instant : créez vos classes dans l’Administration, puis revenez relier l’emploi du temps.</div>`}
      ${p.classes.length ? p.classes.map(c => html`<div class="map-row${c.classId === null ? ' todo' : ''}">
        <div class="grow">
          <div class="strong-15">${c.name}${c.suggested ? html` <span class="chip accent">proposé</span>` : ''}</div>
          <div class="muted xsmall">${plural(c.n, 'cours', 'cours')} · ${c.matieres.join(', ')}</div>
        </div>
        <select class="input map-sel" data-change="mapClass" data-key="${c.key}" aria-label="Classe de l’app pour ${c.name}">
          ${c.classId === null ? html`<option value="" selected>— À choisir —</option>` : ''}
          <option value="ignore" ${c.classId === '' ? 'selected' : ''}>Ignorer</option>
          ${classes.map(k => html`<option value="${k.id}" ${c.classId === k.id ? 'selected' : ''}>${k.name}</option>`)}
        </select>
      </div>`) : html`<div class="muted">Aucune classe dans ce fichier.</div>`}
    </div>
    <div class="wiz-foot">
      <button type="button" class="btn soft" data-click="cancelWiz">Annuler</button>
      ${wiz.mode === 'import' && wiz.i > 0 ? html`<button type="button" class="btn soft" data-click="prevEtab">Précédent</button>` : ''}
      <span class="grow"></span>
      <button type="button" class="btn accent" data-click="nextEtab">${wiz.mode === 'edit' ? 'Enregistrer' : wiz.i < n - 1 ? 'Établissement suivant' : 'Voir l’aperçu'}</button>
    </div>`;
}

// ---------- Assistant : conflits (Pronote a changé un cours que vous aviez modifié, ou retiré un cours à vous) ----------
const FIELD_LABEL = { fin: 'fin', salle: 'salle', matiere: 'matière', statutLabel: 'statut' };
const nomCours = c => { const k = planning.classIdOf(c); const cl = k && db.get('classes', k); return cl ? cl.name : c.classe || c.matiere; };
const ligne = e => `${fmtDay(e.date)} · ${e.debut}–${e.fin}${e.salle ? ' · ' + e.salle : ''}${planning.statutLabel(e) ? ' · ' + planning.statutLabel(e) : ''}`;
function conflitsView(p, pi, conflits) {
  if (!conflits.length) return '';
  p.choix = p.choix || {};
  const opt = (k, value, label, detail) => {
    const on = (p.choix[k.id] || planning.choixParDefaut(k)) === value;
    return html`<button type="button" class="cf-opt${on ? ' on' : ''}" data-click="choix" data-p="${pi}" data-id="${k.id}" data-v="${value}">
      <span class="cf-radio">${on ? icon.check : ''}</span><span class="grow"><strong>${label}</strong><span class="muted small">${detail}</span></span></button>`;
  };
  return html`<div class="cf-box">
    <div class="row-center wrap"><span class="set-title grow">${conflits.length} conflit${conflits.length > 1 ? 's' : ''} à régler</span>
      <button type="button" class="btn soft small" data-click="toutChoix" data-p="${pi}" data-v="moi">Tout : mes versions</button>
      <button type="button" class="btn soft small" data-click="toutChoix" data-p="${pi}" data-v="pronote">Tout : Pronote</button></div>
    <div class="muted small">Vos notes, appels et séances restent attachés au cours quel que soit votre choix.</div>
    ${conflits.map(k => {
      if (k.type === 'modif') {
        const changes = Object.keys(FIELD_LABEL).filter(f => (k.old[f] || '') !== (k.now[f] || ''))
          .map(f => `${FIELD_LABEL[f]} : ${k.old[f] || '—'} → ${k.now[f] || '—'}`).join(' ; ');
        const mine = planning.eff({ ...k.old, ...k.now }), theirs = planning.eff({ ...k.old, ...k.now, perso: undefined });
        return html`<div class="cf-item">
          <div><strong>${nomCours(k.old)}</strong> · ${fmtDay(k.old.date)} ${k.old.debut}
            <div class="muted small">Pronote a changé ce cours (${changes || 'détails'}), que vous aviez modifié.</div></div>
          <div class="cf-opts">${opt(k, 'moi', 'Ma version', ligne(mine))}${opt(k, 'pronote', 'Version Pronote', ligne(theirs))}</div>
        </div>`;
      }
      return html`<div class="cf-item">
        <div><strong>${nomCours(k.old)}</strong> · ${ligne(planning.eff(k.old))}
          <div class="muted small">Retiré de Pronote. Vous aviez sur ce cours : ${k.raisons.join(', ')}.</div></div>
        <div class="cf-opts">${opt(k, 'garder', 'Garder le cours', 'Il reste au planning comme un cours ajouté à la main')}
          ${opt(k, 'supprimer', 'Le supprimer', k.raisons.some(r => r === 'appel' || r === 'séance de projet') ? 'L’appel et la séance sont gardés, détachés du cours' : 'La note est perdue')}</div>
      </div>`;
    })}
  </div>`;
}

// ---------- Assistant : aperçu ----------
function previewView() {
  return html`${wiz.plans.map((p, pi) => {
    const d = planning.previewOf(p);
    const byRole = {};
    for (const c of p.cours) { const r = planning.roleOf(c.matiere); byRole[r] = (byRole[r] || 0) + 1; }
    const ignored = p.classes.filter(c => c.classId === '').reduce((t, c) => t + c.n, 0);
    const first = !p.etab;
    return html`<div class="set-block">
      <div class="row-center">${dot(p.color)}<span class="set-title grow">${p.etabName}</span><span class="chip">${p.initiales}</span></div>
      <div class="stat-chips">
        <span class="chip pos">+ ${plural(d.ajouts.length, 'cours ajouté', 'cours ajoutés')}</span>
        ${first ? '' : html`<span class="chip warn">${plural(d.modifs.length, 'modifié', 'modifiés')}</span>
          <span class="chip">${plural(d.suppressions.length, 'supprimé', 'supprimés')}</span>
          <span class="chip">${plural(d.inchanges, 'inchangé', 'inchangés')}</span>
          ${d.conflits.length ? html`<span class="chip warn">${plural(d.conflits.length, 'conflit', 'conflits')}</span>` : ''}`}
        <span class="chip">${plural(d.jours, 'période de vacances ou férié', 'périodes de vacances ou fériés')}</span>
      </div>
      <div class="muted small">${range(p.cours)} · ${Object.entries(byRole).map(([r, n]) => `${n} ${planning.ROLES[r].label.toLowerCase()}`).join(' · ')}
        ${ignored ? ` · ${ignored} cours de classes ignorées` : ''}</div>
      ${d.modifs.length ? html`<details><summary>Voir les ${d.modifs.length} modifications</summary><ul class="diff-list">${d.modifs.slice(0, 60).map(({ old, now }) =>
        html`<li>${coursLine(now)}<span class="muted"> — avant : ${['fin', 'salle', 'matiere', 'statutLabel'].filter(f => (old[f] || '') !== (now[f] || '')).map(f => (old[f] || '—')).join(', ') || planning.statutLabel(old) || 'cours normal'}</span></li>`)}</ul></details>` : ''}
      ${d.suppressions.length && !first ? html`<details><summary>Voir les ${d.suppressions.length} suppressions</summary><ul class="diff-list">${d.suppressions.slice(0, 60).map(c => html`<li>${coursLine(c)}</li>`)}</ul></details>` : ''}
      ${conflitsView(p, pi, d.conflits)}
    </div>`;
  })}
  <div class="wiz-foot">
    <button type="button" class="btn soft" data-click="cancelWiz">Annuler</button>
    <button type="button" class="btn soft" data-click="backToMap">Retour aux classes</button>
    <span class="grow"></span>
    <button type="button" class="btn accent" data-click="applyImport">Valider l’import</button>
  </div>`;
}

export default {
  render() {
    const title = !wiz ? 'Emploi du temps' : wiz.mode === 'edit' ? 'Classes reliées' : wiz.step === 'map' ? 'Import · classes' : 'Import · aperçu';
    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/admin', 'Administration')}
        <div class="title ellipsis">${title}</div>
        <div class="spacer"></div>
        ${wiz ? '' : html`${saveStatus()}<button type="button" class="btn accent" data-click="import">${icon.download}<span class="hide-phone">Importer des fichiers Pronote</span></button>`}
      </header>
      <main class="content settings-page" data-scroll="edt">
        ${!wiz ? mainView() : wiz.step === 'map' ? mapView() : previewView()}
      </main>
      ${busy ? html`<div class="busy"><div class="busy-box"><span class="spinner"></span>${busy}</div></div>` : ''}
    </div>`;
  },

  leave() { wiz = null; busy = ''; },

  actions: {
    async import() {
      const files = await pickIcs();
      if (!files.length) return;
      busy = 'Lecture des fichiers…'; refresh();
      try {
        const plans = await planning.readFiles(files);
        wiz = { mode: 'import', step: 'map', i: 0, plans };
      } catch (e) { toast({ text: e.message, ms: 6000 }); }
      busy = ''; refresh();
    },
    editMap(el) {
      const e = db.get('etablissements', el.dataset.id);
      if (!e) return;
      const map = e.classes || {};
      const classes = planning.pronoteClasses(planning.coursOfEtab(e.id)).map(pc => {
        const m = map[pc.key];
        const ok = m && (m.classId === '' || db.get('classes', m.classId));
        const s = ok ? null : planning.suggestClass(pc.name, e.initiales);
        return { ...pc, classId: ok ? m.classId : s ? s.id : null, suggested: !ok && !!s };
      });
      wiz = { mode: 'edit', step: 'map', i: 0, plans: [{ etab: e, etabName: e.name, initiales: e.initiales, color: e.color, classes }] };
      refresh();
    },
    ini(el) { wiz.plans[wiz.i].initiales = el.value.toUpperCase().trim(); },
    swatch(el) { wiz.plans[wiz.i].color = el.dataset.c; refresh(); },
    mapClass(el) {
      const c = wiz.plans[wiz.i].classes.find(x => x.key === el.dataset.key);
      c.classId = el.value === 'ignore' ? '' : el.value || null;
      c.suggested = false;
      refresh();
    },
    prevEtab() { wiz.i--; refresh(); },
    nextEtab() {
      const p = wiz.plans[wiz.i];
      if (!p.initiales) { toast({ text: 'Indiquez les initiales du collège' }); return; }
      const todo = p.classes.filter(c => c.classId === null);
      if (todo.length) { toast({ text: `Choisissez une classe ou « Ignorer » pour : ${todo.map(c => c.name).join(', ')}`, ms: 5000 }); return; }
      if (wiz.mode === 'edit') {
        const map = { ...(p.etab.classes || {}) };
        for (const c of p.classes) map[c.key] = { name: c.name, classId: c.classId };
        const undo = db.commit(w => w.update('etablissements', p.etab.id, { classes: map, initiales: p.initiales, color: p.color }));
        wiz = null; refresh();
        toast({ text: 'Correspondance des classes enregistrée', undo: async () => { await undo(); refresh(); } });
        return;
      }
      if (wiz.i < wiz.plans.length - 1) wiz.i++; else wiz.step = 'preview';
      refresh();
    },
    backToMap() { wiz.step = 'map'; wiz.i = wiz.plans.length - 1; refresh(); },
    choix(el) {
      const p = wiz.plans[+el.dataset.p];
      p.choix = { ...(p.choix || {}), [el.dataset.id]: el.dataset.v };
      refresh();
    },
    // « Tout : mes versions » garde aussi les cours retirés ; « Tout : Pronote » applique Pronote partout.
    toutChoix(el) {
      const p = wiz.plans[+el.dataset.p];
      const mine = el.dataset.v === 'moi';
      p.choix = Object.fromEntries(planning.previewOf(p).conflits.map(k => [k.id, k.type === 'modif' ? (mine ? 'moi' : 'pronote') : (mine ? 'garder' : 'supprimer')]));
      refresh();
    },
    cancelWiz() { wiz = null; refresh(); },
    applyImport() {
      const plans = wiz.plans;
      const n = plans.reduce((t, p) => t + p.cours.length, 0);
      const undo = planning.applyImport(plans);
      planning.lierAppels();
      wiz = null; refresh();
      toast({ text: `Emploi du temps importé : ${plural(n, 'cours', 'cours')}`, undo: async () => { await undo(); refresh(); }, ms: 8000 });
    },

    color(el) {
      const e = db.get('etablissements', el.dataset.id);
      openMenu({
        anchor: el, width: 240, align: 'right', title: 'Couleur de ' + e.initiales,
        items: planning.PALETTE.map(c => ({ label: c === e.color ? 'Couleur actuelle' : 'Choisir', chip: { bg: c, fg: '#fff', text: '' }, selected: c === e.color,
          onPick: () => { db.commit(w => w.update('etablissements', e.id, { color: c })); refresh(); } })),
      });
    },
    async delEtab(el) {
      const e = db.get('etablissements', el.dataset.id);
      if (!e || !(await confirmDialog({
        title: `Supprimer l’emploi du temps de ${e.name} ?`,
        text: `Ses ${planning.coursOfEtab(e.id).length} cours, ses vacances et la correspondance des classes seront supprimés. Vos classes, élèves et appels ne sont pas touchés.`,
        ok: 'Supprimer', danger: true,
      }))) return;
      const undo = planning.deleteEtab(e.id);
      refresh();
      toast({ text: 'Emploi du temps supprimé', undo: async () => { await undo(); refresh(); } });
    },
    role(el) { planning.setRole(el.dataset.m, el.dataset.r); refresh(); },
  },
};
