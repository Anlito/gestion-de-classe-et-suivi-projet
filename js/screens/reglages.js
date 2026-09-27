// Réglages : trimestre, thème, stockage, données de démonstration.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, confirmDialog } from '../ui.js';
import { backLink, saveStatus } from '../components.js';
import { refresh, currentTheme, setTheme, APP_VERSION } from '../nav.js';
import { loadDemo } from '../demo.js';
import { hasPin, setPin, removePin, keypad } from '../lock.js';
import { checkForUpdate, updateReady, restartApp } from '../update.js';

export default {
  render() {
    const t = model.trimester();
    const theme = currentTheme();
    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/admin', 'Administration')}
        <div class="title">Réglages</div>
        <div class="spacer"></div>${saveStatus()}
      </header>
      <main class="content settings-page" data-scroll="reglages">
        <div class="set-block">
          <div class="set-title">Année et trimestre</div>
          <div class="set-row"><span class="grow">Année scolaire</span><strong>${model.schoolYear()}</strong></div>
          <div class="set-row"><span class="grow">Trimestre en cours</span><strong>Trimestre ${t}</strong></div>
          <button type="button" class="btn soft" data-click="nextTri" ${t >= 3 ? 'disabled' : ''}>
            ${t >= 3 ? 'Dernier trimestre de l’année' : 'Passer au trimestre ' + (t + 1)}</button>
          <div class="muted small">Clôt le trimestre : les compteurs du trombinoscope repartent à zéro, l’historique est conservé.</div>
        </div>

        <div class="set-block">
          <div class="set-title">Apparence</div>
          <div class="segmented">
            <button type="button" class="seg${theme === 'clair' ? ' on' : ''}" data-click="theme" data-k="clair">Clair</button>
            <button type="button" class="seg${theme === 'sombre' ? ' on' : ''}" data-click="theme" data-k="sombre">Sombre</button>
          </div>
        </div>

        <div class="set-block">
          <div class="set-title">Code d’accès</div>
          <div class="set-row"><span class="grow">Code demandé à l’ouverture</span><strong>${hasPin() ? 'Activé' : 'Désactivé'}</strong></div>
          <div class="row-center wrap">
            <button type="button" class="btn soft" data-click="setPin">${hasPin() ? 'Changer le code' : 'Choisir un code'}</button>
            ${hasPin() ? html`<button type="button" class="btn danger-soft" data-click="removePin">Supprimer le code</button>` : ''}
          </div>
          <div class="muted small">Le code est demandé à l’ouverture et après 2 minutes hors de l’app. Il protège d’un accès rapide mais ne chiffre pas les données. Code oublié : seule une restauration de sauvegarde, après avoir effacé les données du site dans Chrome, permet de retrouver l’accès.</div>
        </div>

        <div class="set-block">
          <div class="set-title">Stockage sur cet appareil</div>
          <div class="set-row"><span class="grow">Stockage persistant</span><strong data-fill="persist">…</strong></div>
          <div class="set-row"><span class="grow">Espace utilisé</span><strong data-fill="usage">…</strong></div>
          <div class="muted small">Les données restent sur cet appareil. Si le stockage n’est pas persistant, installez l’app sur l’écran d’accueil : Chrome l’accorde alors en général.</div>
        </div>

        <div class="set-block">
          <div class="set-title">Mises à jour</div>
          <div class="set-row"><span class="grow">Version installée</span><strong>${APP_VERSION}</strong></div>
          ${updateReady()
            ? html`<button type="button" class="btn accent" data-click="restart">Nouvelle version prête : redémarrer l’app</button>`
            : html`<button type="button" class="btn soft" data-click="checkUpdate">Rechercher une mise à jour</button>`}
          <div class="muted small" data-fill="updateMsg">L’app vérifie aussi toute seule à l’ouverture et quand vous y revenez (connexion Internet nécessaire).</div>
        </div>

        <div class="set-block">
          <div class="set-title">Données de test</div>
          <button type="button" class="btn soft" data-click="demo">Remplacer par les données de démonstration</button>
          <button type="button" class="btn danger-soft" data-click="wipe">Effacer toutes les données</button>
          <div class="muted small">Élèves et classes entièrement fictifs, pour essayer l’app.</div>
        </div>
      </main>
    </div>`;
  },

  async mount(root) {
    const fill = (k, v) => { const el = root.querySelector(`[data-fill="${k}"]`); if (el) el.textContent = v; };
    try {
      fill('persist', navigator.storage && navigator.storage.persisted ? ((await navigator.storage.persisted()) ? 'Oui' : 'Non') : 'Non disponible');
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        fill('usage', (e.usage / 1048576).toFixed(1).replace('.', ',') + ' Mo');
      } else fill('usage', '—');
    } catch (e) { fill('persist', '—'); fill('usage', '—'); }
  },

  actions: {
    async nextTri() {
      const t = model.trimester();
      const ok = await confirmDialog({
        title: `Passer au trimestre ${t + 1} ?`,
        text: `Le trimestre ${t} est clos. Les compteurs Comportement et Aide repartent à zéro dans toutes les classes ; l’historique reste consultable dans le détail de chaque élève.`,
        ok: `Passer au trimestre ${t + 1}`,
      });
      if (!ok) return;
      const undo = model.nextTrimester();
      refresh();
      toast({ text: `Trimestre ${t + 1} commencé`, undo: async () => { await undo(); refresh(); } });
    },
    theme(el) { setTheme(el.dataset.k); refresh(); },
    async checkUpdate(el) {
      el.disabled = true;
      el.textContent = 'Recherche en cours…';
      const r = await checkForUpdate();
      if (r === 'ready') { refresh(); return; }
      el.disabled = false;
      el.textContent = 'Rechercher une mise à jour';
      const msg = { none: `L’app est à jour (version ${APP_VERSION}).`, offline: 'Pas de connexion Internet : réessayez plus tard.', unsupported: 'Recherche impossible sur ce navigateur.' }[r];
      const m = document.querySelector('[data-fill="updateMsg"]'); if (m) m.textContent = msg;
      toast({ text: msg });
    },
    restart() { restartApp(); },
    setPin() {
      const change = hasPin();
      const choose = () => keypad({ mode: 'set', onDone: async pin => { await setPin(pin); refresh(); toast({ text: 'Code d’accès enregistré' }); }, onCancel: () => {} });
      if (change) keypad({ mode: 'unlock', title: 'Code actuel', onDone: choose, onCancel: () => {} });
      else choose();
    },
    removePin() {
      keypad({ mode: 'unlock', title: 'Code actuel', onCancel: () => {}, onDone: () => { removePin(); refresh(); toast({ text: 'Code d’accès supprimé' }); } });
    },
    async demo() {
      const hasData = db.all('classes').length > 0;
      if (hasData && !(await confirmDialog({
        title: 'Remplacer toutes les données ?',
        text: 'Toutes les classes, élèves et observations de cet appareil seront remplacés par des données fictives. Cette action ne peut pas être annulée.',
        ok: 'Remplacer', danger: true,
      }))) return;
      await loadDemo();
      refresh();
      toast({ text: 'Données de démonstration chargées' });
    },
    async wipe() {
      if (!(await confirmDialog({
        title: 'Effacer toutes les données ?',
        text: 'Classes, élèves, photos, observations et projets seront supprimés de cet appareil. Cette action ne peut pas être annulée.',
        ok: 'Tout effacer', danger: true,
      }))) return;
      await db.clearAll();
      model.ensureMeta();
      refresh();
      toast({ text: 'Toutes les données ont été effacées' });
    },
  },
};
