// plan-view.js — Dessin d'un plan de salle (éditeur des salles ; plan de classe à l'étape 3).
// opts.seat(place) : contenu d'une place (par défaut son numéro) ; opts.sel : îlot sélectionné ;
// opts.cells : cases libres cliquables (déplacer l'îlot sélectionné) ; opts.tableClick : action au toucher d'un îlot.
import { html, raw } from './ui.js';
import * as S from './salles.js';

const defSeat = p => html`<span class="seat-n">${p.num}</span>`;

export function planHtml(salle, { seat = defSeat, sel = null, cells = false, tableClick = '' } = {}) {
  let num = 0;
  const numbered = new Map(S.places(salle).map(p => [p.id, { ...p, num: ++num }]));
  const seatHtml = id => { const p = numbered.get(id); return html`<span class="seat" data-seat="${id}">${seat(p)}</span>`; };
  if (salle.type === 'rangees') {
    return html`<div class="plan plan-rangees">
      <div class="plan-front">Tableau</div>
      <div class="plan-rows" style="--cols:${salle.colonnes};--n:${salle.parTable}">
        ${Array.from({ length: salle.rangs * salle.colonnes }, (_, i) => {
          const r = Math.floor(i / salle.colonnes), c = i % salle.colonnes;
          return html`<div class="plan-table" style="--n:${salle.parTable}">${Array.from({ length: salle.parTable }, (_, n) => seatHtml(`r-${r}-${c}-${n}`))}</div>`;
        })}
      </div>
    </div>`;
  }
  return html`<div class="plan plan-ilots" style="--w:${S.LARGEUR};--h:${S.HAUTEUR}">
    <div class="plan-front">Tableau</div>
    <div class="plan-grid">
      ${cells ? Array.from({ length: S.LARGEUR * S.HAUTEUR }, (_, i) => {
        const x = i % S.LARGEUR, y = Math.floor(i / S.LARGEUR);
        return html`<button type="button" class="plan-cell" style="grid-column:${x + 1};grid-row:${y + 1}" data-click="moveTo" data-x="${x}" data-y="${y}" aria-label="Placer ici"></button>`;
      }) : ''}
      ${(salle.tables || []).map(t => {
        const { w, h } = S.tailleIlot(t);
        const cols = t.vertical ? (t.places <= 1 ? 1 : 2) : Math.ceil(t.places / (t.places <= 2 ? 1 : 2));
        const attrs = tableClick ? raw(`role="button" tabindex="0" data-click="${tableClick}" data-id="${t.id}"`) : '';
        return html`<div class="plan-ilot${sel === t.id ? ' sel' : ''}" style="grid-column:${t.x + 1} / span ${w};grid-row:${t.y + 1} / span ${h};--cols:${cols}" ${attrs}>
          ${Array.from({ length: t.places }, (_, n) => seatHtml(`${t.id}-${n}`))}</div>`;
      })}
    </div>
  </div>`;
}
