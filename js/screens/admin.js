// Administration : listes des classes et des projets.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast } from '../ui.js';
import { icon, backLink, saveStatus } from '../components.js';
import { refresh } from '../nav.js';

export default {
  render() {
    const classes = model.classes();
    const projects = model.projects();
    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/', 'Accueil')}
        <div class="title">Administration</div>
        <div class="spacer"></div>${saveStatus()}
        <a class="btn soft" href="#/admin/planning">${icon.calendar}<span class="hide-narrow">Emploi du temps</span></a>
        <a class="btn soft" href="#/admin/sauvegarde">${icon.download}<span class="hide-narrow">Sauvegarde et exports</span></a>
        <a class="btn soft" href="#/admin/reglages">${icon.sliders}<span class="hide-narrow">Réglages</span></a>
      </header>
      <main class="content admin">
        <section class="panel">
          <div class="panel-head row">
            <span class="panel-title grow">Classes <span class="muted normal">${classes.length}</span></span>
            <a class="btn accent" href="#/admin/classe/new">${icon.plusBig}Nouvelle classe</a>
          </div>
          <div class="panel-scroll list" data-scroll="classes">
            ${model.SECTIONS.map(sec => {
              const list = classes.filter(c => model.sectionOf(c) === sec.key);
              if (!list.length) return '';
              return html`<div class="class-sec" style="--tint:${sec.tint}">
                <div class="sec-label">${sec.label}</div>
                <div class="class-grid">${list.map(c => {
                  const a = model.activeAssignments(c.id)[0];
                  const p = a && db.get('projects', a.projectId);
                  const done = model.assignmentsOf(c.id).filter(x => x.status === 'fini').length;
                  return html`<a class="class-card" href="#/admin/classe/${c.id}">
                    <span class="class-card-top"><span class="class-card-name">${c.name}</span><span class="class-card-eff">${model.studentsOf(c.id).length} élèves</span></span>
                    <span class="class-card-proj"><strong>${p ? p.title : 'Aucun projet en cours'}</strong>
                      <span class="muted">${done ? ' · ' + done + (done > 1 ? ' terminés' : ' terminé') : ''}</span></span>
                  </a>`;
                })}</div>
              </div>`;
            })}
            ${classes.length ? '' : html`<div class="empty-block">Aucune classe. Touchez « Nouvelle classe ».</div>`}
          </div>
        </section>

        <section class="panel">
          <div class="panel-head row">
            <span class="panel-title grow">Projets <span class="muted normal">${projects.length}</span></span>
            <a class="btn accent" href="#/admin/projet/new">${icon.plusBig}Nouveau projet</a>
          </div>
          <div class="panel-scroll list" data-scroll="projects">
            ${projects.map(p => {
              const cls = model.assignmentsOfProject(p.id).map(a => db.get('classes', a.classId)).filter(Boolean)
                .sort((x, y) => model.cmp(x.name, y.name)).map(c => c.name);
              return html`<div class="proj-row">
                <a class="proj-row-main" href="#/admin/projet/${p.id}">
                  <span class="pr-title">${p.title}</span>
                  <span class="muted small ellipsis">${p.criteria.length} critère${p.criteria.length > 1 ? 's' : ''} · ${p.nSeances} séances · ${cls.length ? cls.join(', ') : 'aucune classe'}</span>
                </a>
                <button type="button" class="btn soft small" data-click="dup" data-id="${p.id}">Dupliquer</button>
                <a class="btn soft small" href="#/admin/projet/${p.id}">Modifier</a>
              </div>`;
            })}
            ${projects.length ? '' : html`<div class="empty-block">Aucun projet. Touchez « Nouveau projet ».</div>`}
          </div>
        </section>
      </main>
    </div>`;
  },

  actions: {
    dup(el) {
      const p = db.get('projects', el.dataset.id);
      if (!p) return;
      const { undo } = model.duplicateProject(p);
      refresh();
      toast({ text: `« ${p.title} » dupliqué`, undo: async () => { await undo(); refresh(); } });
    },
  },
};
