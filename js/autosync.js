// autosync.js — Synchronisation Google Drive automatique et indicateur dans l'en-tête.
//
// Quand : à l'ouverture de l'app, 5 s après une série de modifications, au retour dans l'app (après 1 min),
// et toutes les 5 min tant que l'app est affichée. Jamais pendant qu'une synchronisation tourne déjà.
// Jeton Google valable 1 h : quand il expire, une reconnexion discrète est tentée ; si Google demande une action,
// l'indicateur affiche « Reconnecter Google » (un toucher suffit).
// Après un remplacement complet des données sur cet appareil (restauration d'une sauvegarde, données de
// démonstration, « tout effacer »), la synchronisation automatique s'arrête et l'app demande quoi faire.
import * as db from './db.js';
import * as drive from './drive.js';
import { html, toast, choiceDialog, fmtTime } from './ui.js';
import { go, refresh } from './nav.js';

const DELAI_MODIF = 5000;
// Vérification régulière de Drive tant que l'app est affichée : quand rien n'a changé, c'est 2 toutes petites
// requêtes, sans rien télécharger (1.14.1 : 5 min → 30 s, les modifications de l'ordinateur arrivaient trop tard).
const PERIODE = 30 * 1000;
const RETOUR = 10 * 1000;

// État affiché : 'off' (mode manuel) | 'idle' | 'running' | 'auth' | 'offline' | 'error' | 'reinit' | 'setup'
let state = { phase: 'off', text: '' };
let timer = null, interval = null, lastRun = 0, expectReset = false, silentTried = 0;

const active = () => drive.isDrive() && drive.validClientId(drive.config().clientId);

// ---------- Indicateur (en-tête de chaque écran) ----------
function setState(phase, text = '') { state = { phase, text }; paint(); }
export function statusHtml() {
  const cfg = drive.config();
  const p = !active() ? (drive.isDrive() ? 'setup' : 'off') : state.phase === 'off' ? 'idle' : state.phase;
  const label = {
    setup: 'Drive à configurer',
    idle: cfg.lastSync ? 'Synchronisé ' + fmtTime(cfg.lastSync) : 'Pas encore synchronisé',
    running: 'Synchronisation…',
    auth: 'Reconnecter Google',
    offline: 'Hors ligne',
    error: 'Erreur de synchro',
    reinit: 'Synchro à vérifier',
  }[p];
  const cls = { idle: '', running: ' busy', auth: ' warn', offline: ' warn', error: ' warn', reinit: ' warn', setup: ' warn' }[p];
  return html`<button type="button" class="status sync-status${cls}" data-sync-status title="${state.text || label}">
    <span class="status-dot"></span><span class="status-text">${label}</span></button>`;
}
function paint() {
  const h = statusHtml().s;
  document.querySelectorAll('[data-sync-status]').forEach(el => { el.outerHTML = h; });
}

// ---------- Déclenchement ----------
export function schedule(ms = DELAI_MODIF) {
  clearTimeout(timer);
  if (!active()) { paint(); return; }
  timer = setTimeout(() => run(false), ms);
}

// interactive = true : lancé par un toucher (reconnexion Google et questions autorisées).
export async function run(interactive = false) {
  if (!active()) { paint(); return null; }
  if (drive.syncing()) return null;
  const cfg = drive.config();
  if (cfg.reinit && !interactive) { setState('reinit', 'Les données de cet appareil ont été remplacées : touchez pour choisir quoi faire avec Drive.'); return null; }
  // Jamais de fusion automatique pour la toute première synchronisation d'un appareil qui a déjà des classes.
  if (!cfg.lastSync && !interactive && db.all('classes').length) { setState('reinit', 'Première synchronisation de cet appareil : touchez pour choisir.'); return null; }
  if (!navigator.onLine) { setState('offline', 'Pas de connexion Internet : la synchronisation reprendra toute seule.'); return null; }
  if (!drive.connected()) {
    // Reconnexion discrète (au plus une fois toutes les 10 min) ; sinon il faut un toucher.
    if (!interactive && Date.now() - silentTried < 10 * 60 * 1000) { setState('auth', 'Touchez pour vous reconnecter à Google.'); return null; }
    try { if (!interactive) silentTried = Date.now(); await drive.connect(interactive); }
    catch (e) { setState('auth', interactive ? e.message : 'Touchez pour vous reconnecter à Google.'); if (interactive) toast({ text: e.message, ms: 7000 }); return null; }
  }
  let opts = {};
  if (interactive) {
    const choix = await question();
    if (!choix) { paint(); return null; }
    if (choix === 'drive') {
      setState('running', 'Vérification des données sur Drive…');
      try {
        if (!(await drive.driveADesDonnees())) {
          setState('idle');
          toast({ text: 'Drive ne contient encore aucune classe : rien n’a été effacé. Choisissez « Fusionner » ou « Remplacer Drive par cet appareil ».', ms: 8000 });
          return null;
        }
      } catch (e) { return fail(e, interactive); }
      expectReset = true;
      await db.clearAll();
      expectReset = false;
    }
    if (choix === 'appareil') opts = { remplacerDrive: true };
  }
  setState('running', 'Synchronisation avec Google Drive…');
  lastRun = Date.now();
  try {
    const s = await drive.synchroniser(t => { state.text = t; }, opts);
    setState('idle');
    // L'écran affiche les nouveautés — sauf pendant une saisie, une liste ou un panneau ouvert (ils seraient fermés).
    if (s.recus || s.supprimes) afficher();
    if (interactive) toast({ text: s.rien ? 'Déjà à jour' : `Synchronisé : ${s.recus} reçu${s.recus > 1 ? 's' : ''}, ${s.envoyes} envoyé${s.envoyes > 1 ? 's' : ''}, ${s.supprimes} supprimé${s.supprimes > 1 ? 's' : ''}${s.photos ? `, ${s.photos} photo${s.photos > 1 ? 's' : ''}` : ''}`, ms: 5000 });
    return s;
  } catch (e) { return fail(e, interactive); }
}
// Redessine l'écran avec les données reçues ; si l'écran est occupé, réessaie toutes les 2 s jusqu'à ce qu'il se libère.
let attente = null;
function afficher() {
  clearTimeout(attente);
  if (occupe()) { attente = setTimeout(afficher, 2000); return; }
  refresh();
}
const occupe = () => !!(document.querySelector('#layer > *') || document.querySelector('.drawer, .draw-box, .appel-mode, .busy')
  || (document.activeElement && document.activeElement.matches('input, select, textarea')));
function fail(e, interactive) {
  if (e instanceof drive.NeedAuth) setState('auth', 'Touchez pour vous reconnecter à Google.');
  else if (!navigator.onLine) setState('offline', 'Pas de connexion Internet.');
  else setState('error', e.message);
  if (interactive) toast({ text: e instanceof drive.NeedAuth ? 'Connexion Google expirée : touchez « Reconnecter Google ».' : 'Synchronisation impossible : ' + e.message, ms: 7000 });
  return null;
}

// Questions avant un échange « risqué » : 1re synchronisation d'un appareil qui a déjà des classes, ou données
// remplacées sur cet appareil (restauration, démonstration, tout effacer). Renvoie 'fusion' | 'drive' | 'appareil' | null.
async function question() {
  const cfg = drive.config();
  const hasLocal = db.all('classes').length > 0;
  if (cfg.reinit) {
    return choiceDialog({
      title: 'Les données de cet appareil ont été remplacées',
      text: 'Restauration d’une sauvegarde, données de démonstration ou « tout effacer ». Que faire avec Google Drive ?',
      choices: [
        { label: 'Remplacer Drive par cet appareil', sub: 'Ces données deviennent la référence : les autres appareils les recevront', value: 'appareil', style: 'accent' },
        { label: 'Recharger depuis Drive', sub: 'Les données de cet appareil sont effacées et remplacées par celles de Drive', value: 'drive', style: 'soft' },
        { label: 'Fusionner les deux', sub: 'Garder ce qui est ici et ce qui est sur Drive (le plus récent gagne)', value: 'fusion', style: 'soft' },
        { label: 'Annuler', value: null, style: 'soft' },
      ],
    });
  }
  if (!cfg.lastSync && hasLocal) {
    return choiceDialog({
      title: 'Première synchronisation de cet appareil',
      text: 'Cet appareil contient déjà des classes. Si Drive contient aussi des données (d’un autre appareil), que faire ?',
      choices: [
        { label: 'Fusionner les deux', sub: 'Recommandé : rien n’est perdu, le plus récent gagne', value: 'fusion', style: 'accent' },
        { label: 'Remplacer cet appareil par Drive', sub: 'Les données de cet appareil sont effacées (ex. données de démonstration)', value: 'drive', style: 'soft' },
        { label: 'Annuler', value: null, style: 'soft' },
      ],
    });
  }
  return 'fusion';
}

// ---------- Mise en route ----------
export function initAutoSync() {
  // Modifications : synchronisation 5 s après la dernière (hors réglages propres à l'appareil et échanges reçus).
  db.onChange(info => {
    if (info.remote) return;
    if (info.reset) {
      if (!expectReset && active()) { drive.setConfig({ reinit: true }); setState('reinit', 'Les données de cet appareil ont été remplacées.'); }
      return;
    }
    const keys = info.keys || [];
    if (keys.length && keys.every(k => k.startsWith('meta:') && db.LOCAL_META.has(k.slice(5)))) return;
    if (active() && !drive.config().reinit) schedule();
  });
  // Indicateur : toucher = reconnecter, choisir, ou synchroniser maintenant.
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sync-status]');
    if (!b) return;
    if (!drive.isDrive()) { go('#/admin/sauvegarde'); return; }
    if (!active()) { go('#/admin/sauvegarde'); return; }
    run(true);
  });
  const retour = () => { if (!document.hidden && Date.now() - lastRun > RETOUR) schedule(1000); };
  document.addEventListener('visibilitychange', retour);
  addEventListener('focus', retour);
  addEventListener('pageshow', retour);
  addEventListener('online', () => schedule(1000));
  interval = interval || setInterval(() => { if (!document.hidden) schedule(0); }, PERIODE);
  schedule(1500); // à l'ouverture
}
