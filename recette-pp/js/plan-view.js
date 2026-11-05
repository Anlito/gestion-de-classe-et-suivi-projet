// plan-view.js — Dessin d'un plan de salle (éditeur des salles ; plan de classe).
// opts.seat(place) : contenu d'une place (par défaut son numéro) ; opts.sel : îlot sélectionné ;
// opts.drag : îlots déplaçables au doigt (éditeur, voir screens/salles.js) ;
// opts.zoom : plan recadré sur les îlots (plan de classe : photos plus grandes) — sinon toute la salle.
// Îlots positionnés librement (centre en unités) et tournés ; le contenu des places reste à l'endroit.
import { html } from './ui.js';
import * as S from './salles.js';

const defSeat = p => html`<span class="seat-n">${p.num}</span>`;
const pct = (v, total) => (v / total * 100).toFixed(3) + '%';

// Proportions (largeur / hauteur) du dessin : pour dimensionner le plan selon la hauteur disponible.
export function proportions(salle, zoom = false) {
  if (salle.type === 'rangees') return (salle.colonnes * (salle.parTable * 3 + 1)) / (salle.rangs * 4.6);
  const c = zoom ? S.cadre(salle) : { w: S.LARGEUR, h: S.HAUTEUR };
  return c.w / c.h;
}

export function planHtml(salle, { seat = defSeat, sel = null, drag = false, zoom = false } = {}) {
  let num = 0;
  const numbered = new Map(S.places(salle).map(p => [p.id, { ...p, num: ++num }]));
  const seatHtml = (id, angle = 0) => {
    const p = numbered.get(id);
    return html`<span class="seat" data-seat="${id}"><span class="seat-in" style="transform:rotate(${-angle}deg)">${seat(p)}</span></span>`;
  };
  if (salle.type === 'rangees') {
    return html`<div class="plan plan-rangees">
      <div class="plan-rows" style="--cols:${salle.colonnes};--n:${salle.parTable}">
        ${Array.from({ length: salle.rangs * salle.colonnes }, (_, i) => {
          const r = Math.floor(i / salle.colonnes), c = i % salle.colonnes;
          return html`<div class="plan-table" style="--n:${salle.parTable}">${Array.from({ length: salle.parTable }, (_, n) => seatHtml(`r-${r}-${c}-${n}`))}</div>`;
        })}
      </div>
    </div>`;
  }
  const c = zoom ? S.cadre(salle) : { x: 0, y: 0, w: S.LARGEUR, h: S.HAUTEUR };
  return html`<div class="plan plan-ilots" style="--w:${c.w};--h:${c.h}">
    <div class="plan-room${zoom ? ' zoom' : ''}" data-room>
      ${S.tablesOf(salle).map(t => {
        const d = S.disposition(t);
        return html`<div class="plan-ilot${sel === t.id ? ' sel' : ''}${drag ? ' drag' : ''}" data-ilot="${t.id}"
          style="left:${pct(t.cx - d.cols / 2 - c.x, c.w)};top:${pct(t.cy - d.rows / 2 - c.y, c.h)};width:${pct(d.cols, c.w)};height:${pct(d.rows, c.h)};transform:rotate(${t.angle || 0}deg);--cols:${d.cols};--rows:${d.rows}">
          ${Array.from({ length: t.places }, (_, n) => seatHtml(`${t.id}-${n}`, t.angle || 0))}</div>`;
      })}
    </div>
  </div>`;
}
