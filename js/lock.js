// lock.js — Code d'accès facultatif, demandé à l'ouverture de l'app et après 2 minutes en arrière-plan.
// Le code est propre à cet appareil (non inclus dans les sauvegardes). Seule son empreinte est stockée.
// Il empêche un accès rapide à l'app ; il ne chiffre pas les données.
import { html, buzz } from './ui.js';

const KEY = 'carnet-pin';
const AWAY_MS = 2 * 60 * 1000;
let hiddenAt = null;
let fails = 0, blockedUntil = 0;

function stored() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
export const hasPin = () => !!stored();

async function digest(salt, pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function setPin(pin) {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(KEY, JSON.stringify({ salt, hash: await digest(salt, pin), len: pin.length }));
}
export function removePin() { localStorage.removeItem(KEY); }
async function check(pin) { const s = stored(); return !s || (await digest(s.salt, pin)) === s.hash; }

// Pavé numérique. mode 'unlock' : déverrouille ; mode 'set' : demande le code deux fois et le renvoie.
export function keypad({ mode = 'unlock', title, onDone, onCancel }) {
  const el = document.createElement('div');
  el.className = 'lock';
  document.body.appendChild(el);
  const s = stored();
  let entry = '', first = null;
  const need = mode === 'unlock' && s ? s.len : null;
  const draw = (msg = '', err = false) => {
    const heading = mode === 'set' ? (first ? 'Confirmez le code' : 'Choisissez un code (4 à 6 chiffres)') : title || 'Carnet de classe';
    const n = need || Math.max(4, entry.length);
    el.innerHTML = html`<div class="lock-box">
      <div class="lock-title">${heading}</div>
      <div class="lock-dots${err ? ' shake' : ''}">${Array.from({ length: n }, (_, i) => html`<span class="${i < entry.length ? 'on' : ''}"></span>`)}</div>
      <div class="lock-msg">${msg}</div>
      <div class="lock-keys">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => html`<button type="button" data-k="${d}">${d}</button>`)}
        ${mode === 'set' ? html`<button type="button" data-k="ok" class="lock-ok">OK</button>` : onCancel ? html`<button type="button" data-k="cancel" class="lock-small">Annuler</button>` : html`<span></span>`}
        <button type="button" data-k="0">0</button>
        <button type="button" data-k="del" class="lock-small" aria-label="Effacer">⌫</button>
      </div>
      ${mode === 'set' ? html`<button type="button" class="lock-cancel" data-k="cancel">Annuler</button>` : ''}
    </div>`.s;
  };
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const submit = async () => {
    if (mode === 'set') {
      if (entry.length < 4) { draw('Au moins 4 chiffres', true); return; }
      if (!first) { first = entry; entry = ''; draw(); return; }
      if (entry !== first) { first = null; entry = ''; draw('Les deux codes sont différents, recommencez', true); return; }
      close(); onDone(entry); return;
    }
    if (Date.now() < blockedUntil) { entry = ''; draw('Trop d’essais : patientez 30 secondes', true); return; }
    if (await check(entry)) { fails = 0; close(); onDone(); return; }
    fails++; entry = ''; buzz(60);
    if (fails >= 5) { blockedUntil = Date.now() + 30000; fails = 0; draw('Trop d’essais : patientez 30 secondes', true); }
    else draw('Code incorrect', true);
  };
  const press = k => {
    if (k === 'cancel') { close(); if (onCancel) onCancel(); return; }
    if (k === 'del') { entry = entry.slice(0, -1); draw(); return; }
    if (k === 'ok') { submit(); return; }
    if (entry.length >= 6) return;
    entry += k; draw();
    if (need && entry.length === need) submit();
  };
  const onKey = e => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Enter') press(mode === 'set' ? 'ok' : ''); };
  el.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
  document.addEventListener('keydown', onKey);
  draw();
  return el;
}

let locked = false;
export function lockNow() {
  if (!hasPin() || locked) return;
  locked = true;
  keypad({ mode: 'unlock', title: 'Carnet de classe', onDone: () => { locked = false; } });
}
export function initLock() {
  lockNow();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) lockNow();
  });
}
