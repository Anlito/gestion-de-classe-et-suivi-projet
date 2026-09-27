// ui.js — Outils d'interface partagés : gabarits HTML sûrs, toasts, menus, dialogues.

export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(String(s));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
function val(v) {
  if (v == null || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(val).join('');
  if (v instanceof Raw) return v.s;
  return esc(v);
}
// html`...` : insère les valeurs en les protégeant (un nom d'élève ne peut pas casser la page).
export function html(strings, ...vals) {
  let s = strings[0];
  for (let i = 0; i < vals.length; i++) s += val(vals[i]) + strings[i + 1];
  return new Raw(s);
}

export function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* pas de vibreur */ } }

// ---------- Toast (bandeau en bas, avec Annuler) ----------
let toastTimer = null;
export function toast({ text, who = '', color = '', undo = null, undone = 'Action annulée', ms }) {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  el.innerHTML = html`<div class="toast" role="status">
    ${color ? html`<span class="toast-dot" style="background:${color}"></span>` : ''}
    <div class="toast-text">${who ? html`<strong>${who}</strong> · ` : ''}${text}</div>
    ${undo ? html`<button type="button" class="toast-btn">Annuler</button>` : ''}
  </div>`.s;
  el.hidden = false;
  if (undo) {
    el.querySelector('.toast-btn').addEventListener('click', async () => {
      clearTimeout(toastTimer);
      const msg = await undo();
      const m = msg && typeof msg === 'object' ? msg : { text: typeof msg === 'string' ? msg : undone };
      toast({ ...m, ms: 2000 });
    }, { once: true });
  }
  toastTimer = setTimeout(hideToast, ms ?? (undo ? 6000 : 2400));
}
export function hideToast() {
  clearTimeout(toastTimer);
  const el = document.getElementById('toast');
  el.hidden = true;
  el.innerHTML = '';
}

// ---------- Couche d'affichage au-dessus de l'écran (menus, dialogues) ----------
function layer() { return document.getElementById('layer'); }
export function closeLayer() { layer().innerHTML = ''; }

// Menu court positionné près d'un élément (appui long, sélecteurs…).
// items : [{ label, sub?, selected?, onPick }] ou { section: 'Titre' }
export function openMenu({ anchor, title = '', color = '', items, width = 280, align = 'left' }) {
  const L = layer();
  L.innerHTML = html`<div class="scrim" data-close></div>
    <div class="menu" style="width:${width}px">
      ${title ? html`<div class="menu-title">${color ? html`<span class="menu-dot" style="background:${color}"></span>` : ''}${title}</div>` : ''}
      ${items.map((it, i) => it.section
        ? html`<div class="menu-section">${it.section}</div>`
        : it.chip
          ? html`<button type="button" class="menu-item row${it.selected ? ' selected' : ''}" data-i="${i}">
              <span class="menu-chip${it.selected ? ' ring' : ''}" style="background:${it.chip.bg};color:${it.chip.fg}">${it.chip.text}</span>
              <span class="menu-label grow">${it.label}${it.selected ? ' ✓' : ''}</span>${it.sub ? html`<span class="menu-sub">${it.sub}</span>` : ''}
            </button>`
          : html`<button type="button" class="menu-item${it.selected ? ' selected' : ''}${it.quiet ? ' quiet' : ''}" data-i="${i}">
            <span class="menu-label">${it.label}</span>${it.sub ? html`<span class="menu-sub">${it.sub}</span>` : ''}
          </button>`)}
    </div>`.s;
  const menu = L.querySelector('.menu');
  const r = anchor.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const h = menu.offsetHeight;
  let x = align === 'right' ? r.right - width : r.left + r.width / 2 - width / 2;
  let y = r.bottom + 6;
  if (y + h > vh - 12) y = Math.max(12, r.top - h - 6);
  x = Math.min(Math.max(8, x), vw - width - 8);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  L.querySelector('[data-close]').addEventListener('pointerdown', e => { e.preventDefault(); closeLayer(); });
  menu.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const it = items[+b.dataset.i];
    closeLayer();
    it.onPick();
  });
}

// Dialogue de confirmation. Renvoie une promesse : true si l'utilisateur confirme.
export function confirmDialog({ title, text = '', ok = 'Confirmer', cancel = 'Annuler', danger = false }) {
  return new Promise(resolve => {
    const L = layer();
    L.innerHTML = html`<div class="scrim dim" data-no></div>
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog-title">${title}</div>
        ${text ? html`<div class="dialog-text">${text}</div>` : ''}
        <div class="dialog-actions">
          <button type="button" class="btn" data-no>${cancel}</button>
          <button type="button" class="btn ${danger ? 'danger' : 'accent'}" data-yes>${ok}</button>
        </div>
      </div>`.s;
    const done = v => { closeLayer(); resolve(v); };
    L.querySelectorAll('[data-no]').forEach(b => b.addEventListener('click', () => done(false)));
    L.querySelector('[data-yes]').addEventListener('click', () => done(true));
  });
}

// Formats de date en français. Accepte une date ISO complète ou « AAAA-MM-JJ ».
const toDate = d => (typeof d === 'string' && d.length === 10 ? new Date(d + 'T12:00') : new Date(d));
export function fmtDay(d) {
  return toDate(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function fmtDayLong(d) {
  return toDate(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
export function fmtDayYear(d) {
  return toDate(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDate(d) {
  return toDate(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtTime(d) {
  return toDate(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
// Date du jour au format AAAA-MM-JJ (heure locale).
export function todayISO(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
export const plural = (n, one, many) => n + ' ' + (n > 1 ? many : one);
