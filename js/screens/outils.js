import * as pp from '../pp.js';
import { html, confirmDialog, toast } from '../ui.js';
import { backLink, saveStatus } from '../components.js';
import { refresh } from '../nav.js';

export default {
  render() {
    return html`<div class="screen"><header class="topbar">${backLink('#/admin', 'Administration')}<div class="title">Mes outils</div><div class="spacer"></div>${saveStatus()}</header>
      <main class="content pp-tools"><section class="panel"><div class="panel-head"><span class="panel-title">Suivi PP · outils disponibles</span><span class="muted">Réglages communs à toutes vos classes. Les données sont conservées quand un outil est masqué.</span></div>
      <div class="panel-scroll">${pp.PP_TOOLS.map(t => html`<label class="pp-tool-row"><span class="grow"><strong>${t.label}</strong><span class="muted small">${t.description}</span></span><input type="checkbox" role="switch" data-change="tool" data-key="${t.key}" ${pp.enabled(t.key) ? 'checked' : ''} aria-label="Activer ${t.label}"></label>`)}</div></section>
      <section class="panel"><div class="panel-head"><span class="panel-title">Activation par classe</span></div><div class="panel-scroll"><p>Dans Administration, ouvrez une classe puis cochez « Je suis professeur principal de cette classe ».</p><p>${pp.classes().length} classe(s) PP active(s).</p><p>Les outils ci-contre s’appliquent à toutes ces classes. L’espace PP est masqué si aucune classe n’est cochée.</p><p class="muted small">Les imports proposés concernent les listes CSV, les bulletins et les relevés d’assiduité et de punitions vérifiés. Les campagnes de rencontres manuelles sont disponibles depuis le récap classe. Le formulaire familles nécessite le service Google fourni. Les notes audio sont disponibles par élève. L’aide à la rédaction reste à intégrer.</p><div class="button-group">${pp.hasPP() && pp.enabled("alertes") ? html`<a class="btn accent" href="#/pp/alertes">Régler les seuils PP</a>` : ""}<a class="btn accent" href="#/admin">Gérer les classes</a></div></div></section></main></div>`;
  },
  actions: {
    async tool(el) {
      const key = el.dataset.key, value = el.checked;
      if (!value && !(await confirmDialog({ title: 'Masquer cet outil ?', text: 'Ses onglets et ses actions disparaîtront du Suivi PP sur vos appareils après synchronisation. Les données restent sauvegardées.', ok: 'Masquer' }))) { el.checked = true; return; }
      pp.setEnabled(key, value); refresh(); toast({ text: value ? 'Outil activé pour toutes les classes' : 'Outil masqué, données conservées' });
    },
  },
};
