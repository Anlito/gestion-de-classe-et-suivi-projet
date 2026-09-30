// Classes : tuiles des classes regroupées par niveau (#/classes). C'est aussi l'accueil tant
// qu'aucun emploi du temps n'est importé (voir semaine.js).
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast } from '../ui.js';
import { icon, saveStatus, backLink } from '../components.js';
import { refresh } from '../nav.js';
import { loadDemo } from '../demo.js';

function tile(c) {
  const eff = model.studentsOf(c.id).length;
  const a = model.activeAssignments(c.id)[0];
  const p = a && db.get('projects', a.projectId);
  const pr = a ? model.progress(a) : null;
  const pct = pr && pr.total ? Math.min(100, Math.round(pr.cur / pr.total * 100)) : 0;
  return html`<a class="tile" href="#/classe/${c.id}/trombi">
    <div class="tile-top"><span class="tile-name">${c.name}</span><span class="tile-eff">${eff} élèves</span></div>
    <div class="tile-bottom">
      <div class="tile-proj"><span class="tile-ptitle">${p ? p.title : 'Aucun projet en cours'}</span>
        ${p ? html`<span class="tile-seance">Séance ${pr.cur}/${pr.total}</span>` : ''}</div>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
    </div>
  </a>`;
}

// Rappel si la dernière sauvegarde date de plus de 7 jours (ou n'existe pas).
function reminder(nClasses) {
  if (!nClasses) return '';
  const last = db.getMeta('lastBackupAt');
  const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 864e5) : null;
  if (days != null && days < 7) return '';
  return html`<a class="reminder" href="#/admin/sauvegarde">
    <span class="grow"><strong>${days == null ? 'Aucune sauvegarde pour l’instant.' : `Dernière sauvegarde il y a ${days} jours.`}</strong>
      Une tablette perdue ou réinitialisée, et tout serait perdu.</span>
    <span class="btn accent">Sauvegarder maintenant</span></a>`;
}

export default {
  render() {
    const all = model.classes();
    const sections = model.SECTIONS
      .map(s => ({ ...s, classes: all.filter(c => model.sectionOf(c) === s.key) }))
      .filter(s => s.classes.length);
    const fromPlanning = location.hash === '#/classes';
    return html`<div class="screen">
      <header class="topbar${fromPlanning ? '' : ' home'}">
        ${fromPlanning ? backLink('#/', 'Planning') : ''}
        <div class="brand"><span class="brand-title">${fromPlanning ? 'Classes' : 'Carnet de classe'}</span>
          <span class="sub">${model.schoolYear()} · Trimestre ${model.trimester()}</span></div>
        <div class="spacer"></div>
        ${saveStatus()}
        <a class="btn accent" href="#/admin">${icon.sliders}<span class="hide-narrow">Administration</span></a>
      </header>
      <main class="content home-main" data-scroll="home">
        ${reminder(all.length)}
        ${sections.length ? sections.map(s => html`<section class="home-sec" style="--tint:${s.tint}">
            <div class="sec-label">${s.label}</div>
            <div class="tiles">${s.classes.map(tile)}</div>
          </section>`)
        : html`<div class="empty-home">
            <div class="empty-title">Aucune classe pour l’instant</div>
            <p>Les classes se créent dans <strong>Administration</strong> (à partir du trombinoscope PDF à l’étape 4).
            Pour essayer l’app tout de suite, chargez des classes fictives.</p>
            <button type="button" class="btn accent big" data-click="demo">Charger les données de démonstration</button>
          </div>`}
      </main>
    </div>`;
  },
  actions: {
    async demo(el) {
      el.disabled = true;
      el.textContent = 'Création des classes fictives…';
      await loadDemo();
      refresh();
      toast({ text: 'Données de démonstration chargées (élèves fictifs)' });
    },
  },
};
