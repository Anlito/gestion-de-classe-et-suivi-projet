// Critères des bulletins (1.29.0) : renommer, réordonner, masquer ou ajouter une famille de critères et modifier
// ses formulations. Réglage commun à toutes les classes, synchronisé (meta bulletinsCriteres).
import * as B from '../bulletins.js';
import { html, toast, confirmDialog } from '../ui.js';
import { icon, saveStatus } from '../components.js';
import { refresh } from '../nav.js';

const lines = list => (list || []).join('\n');
function save(list, msg) {
  try { const undo = B.saveFamilies(list); if (msg) toast({ text: msg, undo: async () => { await undo(); refresh(); } }); }
  catch (e) { toast({ text: e.message }); }
  refresh();
}
const edit = (k, patch) => save(B.allFamilies().map(f => (f.k === k ? { ...f, ...patch } : f)));

export default {
  render() {
    const fams = B.allFamilies();
    return html`<div class="screen">
      <header class="topbar">
        <button type="button" class="back" data-click="back" aria-label="Retour">${icon.back}<span class="back-label">Retour</span></button>
        <div class="heading"><span class="title">Critères des bulletins</span><span class="sub">Communs à toutes vos classes</span></div>
        <div class="spacer"></div>${saveStatus()}
      </header>
      <main class="content settings-page" data-scroll="crit-bul">
        <div class="set-block">
          <div class="muted small">Chaque critère est une colonne de la grille Bulletins. Renommer un critère garde les cases déjà remplies. Un critère masqué disparaît de la grille et de l’export, et ne compte plus pour « prêt » ; ses données sont conservées. Formulations : une par ligne.</div>
          ${fams.map((f, i) => html`<div class="crit-fam${f.hidden ? ' hidden' : ''}">
            <div class="crit-fam-head">
              <input class="input" value="${f.label}" maxlength="40" data-change="rename" data-k="${f.k}" aria-label="Nom du critère ${i + 1}">
              <button type="button" class="icon-btn" data-click="move" data-k="${f.k}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Monter ${f.label}">▲</button>
              <button type="button" class="icon-btn" data-click="move" data-k="${f.k}" data-d="1" ${i < fams.length - 1 ? '' : 'disabled'} aria-label="Descendre ${f.label}">▼</button>
              <button type="button" class="btn soft small" data-click="toggle" data-k="${f.k}">${f.hidden ? 'Afficher' : 'Masquer'}</button>
            </div>
            <div class="crit-cols">
              <label class="bul-block"><span class="caps">Formulations positives</span>
                <textarea class="input" rows="4" data-change="pos" data-k="${f.k}">${lines(f.pos)}</textarea></label>
              <label class="bul-block"><span class="caps">Formulations à améliorer</span>
                <textarea class="input" rows="4" data-change="neg" data-k="${f.k}">${lines(f.neg)}</textarea></label>
            </div>
          </div>`)}
          <button type="button" class="add-row small" data-click="add">${icon.plus}Ajouter un critère</button>
          <div class="set-row"><span class="muted small grow">${B.familiesCustomized() ? 'Critères personnalisés.' : 'Critères par défaut de l’app.'}</span>
            <button type="button" class="btn soft small" data-click="reset" ${B.familiesCustomized() ? '' : 'disabled'}>Rétablir les critères par défaut</button></div>
        </div>
      </main></div>`;
  },
  actions: {
    back() { if (history.length > 1) history.back(); else location.hash = '#/admin/reglages'; },
    rename(el) {
      const v = el.value.trim();
      if (!v) { toast({ text: 'Un critère doit avoir un nom : utilisez « Masquer » pour le retirer de la grille.' }); refresh(); return; }
      edit(el.dataset.k, { label: v });
    },
    pos(el) { edit(el.dataset.k, { pos: el.value.split('\n') }); },
    neg(el) { edit(el.dataset.k, { neg: el.value.split('\n') }); },
    toggle(el) {
      const f = B.allFamilies().find(x => x.k === el.dataset.k);
      save(B.allFamilies().map(x => (x.k === f.k ? { ...x, hidden: !x.hidden } : x)), f.hidden ? f.label + ' affiché' : f.label + ' masqué, données conservées');
    },
    move(el) {
      const list = B.allFamilies(), i = list.findIndex(x => x.k === el.dataset.k), j = i + Number(el.dataset.d);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      save(list);
    },
    add() {
      save([...B.allFamilies(), { k: B.newFamilyKey(), label: 'Nouveau critère', pos: [], neg: [] }]);
      const inputs = document.querySelectorAll('[data-change="rename"]');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); last.scrollIntoView({ block: 'center' }); }
    },
    async reset() {
      if (!(await confirmDialog({ title: 'Rétablir les critères par défaut ?', text: 'Vos critères ajoutés seront retirés de la grille ; les cases déjà remplies restent enregistrées.', ok: 'Rétablir' }))) return;
      const undo = B.resetFamilies();
      toast({ text: 'Critères par défaut rétablis', undo: async () => { await undo(); refresh(); } });
      refresh();
    },
  },
};
