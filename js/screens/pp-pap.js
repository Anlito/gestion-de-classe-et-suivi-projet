// Suivi PP → PAP d'un élève (1.24.0) : grille officielle par niveau (6e…3e), PAP précédent dans les colonnes des
// années passées, aménagements libres, informations du médecin (privées), bilan, et version imprimable officielle.
// Routes : #/pp/eleve/:studentId/pap (saisie) et #/pp/eleve/:studentId/pap/imprimer (impression).
import * as db from '../db.js';
import * as model from '../model.js';
import * as pap from '../pap.js';
import * as service from '../pap-service.js';
import * as notifs from '../pp-notifs.js';
import { SECTIONS, NIVEAUX } from '../pap-items.js';
import { html, raw, toast, confirmDialog, fmtDayYear } from '../ui.js';
import { icon, backLink, saveStatus } from '../components.js';
import { refresh, go } from '../nav.js';

let studentId = '', draft = null, baseId = null, dirty = false, busy = false;
// Consultation des collègues (1.25.0) : saisies en cours (réglage du service, message, date limite).
let cfg = { url: '', key: '' }, consult = { message: null, echeance: null }, syn = null;
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

function charger(id) {
  const r = pap.papDe(id);
  studentId = id; draft = JSON.parse(JSON.stringify(r.data)); baseId = r.record ? r.record.id : null; dirty = false;
  return r;
}
const coche = (niveau, id) => (draft.cases[niveau] || []).includes(id);

function section(s) {
  return html`<table class="pap-table${s.sous ? ' sous' : ''}">
    <thead><tr><th class="pap-sec">${s.titre}</th>${NIVEAUX.map(n => html`<th class="pap-niv${n === draft.niveau ? ' actuel' : ''}">${n}</th>`)}<th class="pap-x"></th></tr></thead>
    <tbody>${s.items.map(it => html`<tr><td class="pap-texte">${it.texte}</td>${NIVEAUX.map(n => html`<td class="pap-case${n === draft.niveau ? ' actuel' : ''}">
      <input type="checkbox" data-change="case" data-n="${n}" data-id="${it.id}" ${coche(n, it.id) ? 'checked' : ''} aria-label="${n} · ${it.texte}">${n === draft.niveau && syn && syn.parItem.has(it.id) ? html`<span class="pap-vote" title="Proposé par : ${syn.parItem.get(it.id).join(', ')}">${syn.parItem.get(it.id).length}</span>` : ''}</td>`)}<td class="pap-x"></td></tr>`)}</tbody></table>`;
}

// ---------- Consultation des collègues (1.25.0) ----------
function consultation(s) {
  if (!service.configure()) {
    return html`<details class="panel pap-plus pap-consult" open><summary><strong>Consultation des collègues</strong> <span class="muted small">· recueillir l’avis de l’équipe par un lien</span></summary>
      <p class="muted small">Le formulaire des collègues passe par le même service Google que le formulaire des familles (dossier <code>google-rencontres</code>, fichier INSTALLATION.md, partie PAP).
        Collez l’adresse du déploiement (/exec) et la clé professeur obtenues lors de l’installation.</p>
      <label class="lbl">Adresse du service Google (/exec)<input class="input" value="${cfg.url}" data-input="cfgUrl" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false"></label>
      <label class="lbl">Clé professeur<input class="input" type="password" value="${cfg.key}" data-input="cfgKey" autocomplete="off"></label>
      <button type="button" class="btn soft self-start" data-click="cfgSave">Enregistrer le service</button></details>`;
  }
  const e = service.etat(s.id), r = service.retours(s.id);
  const msg = consult.message != null ? consult.message : (e && e.message) || '';
  const ech = consult.echeance != null ? consult.echeance : (e && e.echeance) || '';
  const nb = r ? r.reponses.length : 0;
  const proposes = syn ? [...syn.parItem.keys()].filter(id => !coche(draft.niveau, id)).length : 0;
  return html`<details class="panel pap-plus pap-consult" open><summary><strong>Consultation des collègues</strong>
      <span class="muted small">· ${e ? (e.status === 'open' ? 'ouverte' : 'close') + (r ? ` · ${nb} avis reçu${nb > 1 ? 's' : ''}` : '') : 'pas encore de lien'}</span></summary>
    <p class="muted small">Les collègues voient seulement <strong>${s.prenom} ${(s.nom || '').charAt(0)}.</strong>, la classe, le niveau ${draft.niveau}, la grille et les cases du PAP précédent.
      Ni le nom complet, ni les informations du médecin, ni le bilan ne sont transmis. Chacun indique son nom et sa discipline.</p>
    <div class="row-center wrap">
      <label class="lbl grow">Message pour les collègues (facultatif)<input class="input" value="${msg}" data-input="consultMsg" maxlength="1000" placeholder="ex. Merci de répondre avant le conseil de classe"></label>
      <label class="lbl">Date limite (facultatif)<input class="input" type="date" value="${ech}" data-change="consultEch"></label>
    </div>
    ${e ? html`<div class="pap-lien"><code>${e.url}</code><button type="button" class="btn accent small" data-click="copier">Copier le lien</button></div>
      <div class="row-center wrap">
        <button type="button" class="btn soft small" data-click="publier" ${busy ? 'disabled' : ''}>Mettre à jour le formulaire</button>
        ${e.status === 'open' ? html`<button type="button" class="btn soft small" data-click="clore" ${busy ? 'disabled' : ''}>Clore la consultation</button>`
          : html`<button type="button" class="btn soft small" data-click="rouvrir" ${busy ? 'disabled' : ''}>Rouvrir</button>`}
        <button type="button" class="btn accent small" data-click="recuperer" ${busy ? 'disabled' : ''}>Récupérer les avis</button>
        ${r ? html`<span class="muted small">Avis récupérés le ${fmtDayYear(r.at)}</span>` : ''}
      </div>`
      : html`<button type="button" class="btn accent self-start" data-click="publier" ${busy ? 'disabled' : ''}>Créer le lien pour les collègues</button>
        <p class="muted small">Enregistrez d’abord le PAP précédent : c’est la version enregistrée qui est montrée aux collègues.</p>`}
    ${r && nb ? html`<div class="pap-avis">
      <div class="row-center wrap"><strong class="grow">Avis de l’équipe</strong>
        ${proposes ? html`<button type="button" class="btn soft small" data-click="cocherProposes">Cocher en ${draft.niveau} les ${proposes} item${proposes > 1 ? 's' : ''} proposé${proposes > 1 ? 's' : ''}</button>` : ''}</div>
      <p class="muted small">Dans la grille, le nombre à côté d’une case de ${draft.niveau} indique combien de collègues la proposent (touchez-le ou survolez-le pour voir qui). Vous décidez des cases finales.</p>
      ${r.reponses.map(x => html`<article class="pap-rep"><div><strong>${x.teacher}</strong> · ${x.discipline} <span class="muted small">· ${fmtDayYear(x.receivedAt)} · ${x.items.length} item${x.items.length > 1 ? 's' : ''}</span></div>
        ${x.autres.map(a => html`<div class="row-center pap-rep-autre"><span class="grow">« ${a} »</span>${draft.autres.some(d => d.texte.trim() === a.trim()) ? html`<span class="chip">déjà ajouté</span>` : html`<button type="button" class="btn soft small" data-click="ajouterAutre" data-t="${a}">Ajouter au PAP</button>`}</div>`)}
        ${x.comment ? html`<p class="pap-rep-com">${x.comment}</p>` : ''}</article>`)}
    </div>` : r ? html`<p class="muted small">Aucun avis reçu pour l’instant.</p>` : ''}
  </details>`;
}

function saisie(s, c, info) {
  const totalActuel = pap.total(draft, draft.niveau);
  return html`<div class="screen pp-screen"><header class="topbar">${backLink('#/pp/eleve/' + s.id, 'Fiche élève')}
      <div class="heading"><span class="title">PAP · ${model.fullName(s)}</span><span class="sub">${c ? c.name : ''} · ${model.schoolYear()}</span></div>
      <div class="spacer"></div>${saveStatus()}
      <a class="btn soft" href="#/pp/eleve/${s.id}/pap/imprimer">${icon.download}<span class="hide-narrow">Imprimer le PAP</span></a>
      <button type="button" class="btn accent" data-click="save" ${busy || !dirty ? 'disabled' : ''}>Enregistrer</button></header>
    <main class="content pap-page" data-scroll="pap">
      ${info.conflit ? html`<div class="abs-info">Deux versions de ce PAP ont été enregistrées sur des appareils différents. La plus récente est affichée ; en enregistrant, elle devient la référence.</div>` : ''}
      <section class="panel pap-head">
        <div class="row-center wrap">
          <label class="lbl pap-niveau">Niveau de cette année
            <select class="input" data-change="niveau">${NIVEAUX.map(n => html`<option value="${n}" ${n === draft.niveau ? 'selected' : ''}>${n}</option>`)}</select></label>
          <div class="grow muted small">Cochez dans la colonne <strong>${draft.niveau}</strong> les aménagements de cette année. Les colonnes des années précédentes
            reprennent le <strong>PAP précédent</strong> : reportez-y ce qui était coché sur le document. Seuls les items indispensables à l’élève sont à cocher.</div>
          <span class="chip accent">${totalActuel} aménagement${totalActuel > 1 ? 's' : ''} en ${draft.niveau}</span>
        </div>
      </section>
      ${consultation(s)}
      <section class="panel pap-grid">${SECTIONS.map(section)}
        <table class="pap-table"><thead><tr><th class="pap-sec">Autres aménagements et adaptations</th>${NIVEAUX.map(n => html`<th class="pap-niv${n === draft.niveau ? ' actuel' : ''}">${n}</th>`)}<th class="pap-x"></th></tr></thead>
          <tbody>${draft.autres.map(a => html`<tr><td class="pap-texte"><input class="input" value="${a.texte}" data-input="autreTexte" data-id="${a.id}" placeholder="Aménagement" maxlength="500"></td>
            ${NIVEAUX.map(n => html`<td class="pap-case${n === draft.niveau ? ' actuel' : ''}"><input type="checkbox" data-change="autreNiveau" data-id="${a.id}" data-n="${n}" ${a.niveaux.includes(n) ? 'checked' : ''} aria-label="${n}"></td>`)}
            <td class="pap-x"><button type="button" class="icon-btn" data-click="autreDel" data-id="${a.id}" aria-label="Retirer">${icon.trash}</button></td></tr>`)}</tbody></table>
        <button type="button" class="btn soft self-start" data-click="autreAdd">${icon.plusBig}Ajouter un aménagement</button>
      </section>
      <details class="panel pap-plus"${draft.medecin.appuis || draft.medecin.consequences ? ' open' : ''}><summary><strong>Besoins spécifiques de l’élève</strong> <span class="muted small">(rempli par le médecin de l’éducation nationale · reste privé, jamais transmis aux collègues)</span></summary>
        <label class="lbl">Points d’appui pour les apprentissages<textarea class="input" rows="3" data-input="medecin" data-k="appuis" maxlength="4000">${draft.medecin.appuis}</textarea></label>
        <label class="lbl">Conséquences des troubles sur les apprentissages<textarea class="input" rows="3" data-input="medecin" data-k="consequences" maxlength="4000">${draft.medecin.consequences}</textarea></label>
      </details>
      <details class="panel pap-plus"${draft.bilan.nonAtteints || draft.bilan.profitables || draft.liaison ? ' open' : ''}><summary><strong>Bilan des aides apportées au collège · liaison collège–lycée</strong></summary>
        <label class="lbl">Aménagements n’ayant pas atteint les objectifs escomptés<textarea class="input" rows="3" data-input="bilan" data-k="nonAtteints" maxlength="4000">${draft.bilan.nonAtteints}</textarea></label>
        <label class="lbl">Aménagements profitables à l’élève<textarea class="input" rows="3" data-input="bilan" data-k="profitables" maxlength="4000">${draft.bilan.profitables}</textarea></label>
        <label class="lbl">Liaison collège–lycée (entrée au lycée)<textarea class="input" rows="3" data-input="liaison" maxlength="4000">${draft.liaison}</textarea></label>
      </details>
      ${info.record ? html`<p class="muted small">Dernier enregistrement : ${fmtDayYear(info.record.at)}.</p>` : ''}
    </main></div>`;
}

// ---------- Version imprimable (mise en page du Bulletin officiel) ----------
function impression(s, c, d) {
  const croix = (ok, actuel) => html`<td class="pap-p-case${actuel ? ' actuel' : ''}">${ok ? '✕' : ''}</td>`;
  const tableau = sec => html`<table class="doc-table pap-p"><thead><tr><th class="left pap-p-sec">${sec.titre} :</th>${NIVEAUX.map(n => html`<th class="pap-p-n">${n}</th>`)}</tr></thead>
    <tbody>${sec.items.map(it => html`<tr><td class="left">${it.texte}</td>${NIVEAUX.map(n => croix((d.cases[n] || []).includes(it.id), n === d.niveau))}</tr>`)}</tbody></table>`;
  const autres = d.autres.length ? d.autres : [{ texte: '', niveaux: [] }, { texte: '', niveaux: [] }];
  return html`<div class="screen print-screen">${raw('<style>@page { size: A4 portrait; margin: 12mm; }</style>')}
    <header class="topbar no-print"><a class="back" href="#/pp/eleve/${s.id}/pap">${icon.back}<span class="back-label">Retour</span></a>
      <div class="title ellipsis">PAP · ${model.fullName(s)}</div><div class="spacer"></div>
      <span class="muted small hide-narrow">Imprimante : « Enregistrer au format PDF »</span>
      <button type="button" class="btn accent" data-click="print">Imprimer / PDF</button></header>
    <main class="content doc-wrap"><div class="doc pap-doc">
      <section class="doc-page">
        <div class="doc-kicker">Plan d’accompagnement personnalisé</div>
        <p class="doc-muted">Vu la loi n° 2013-595 du 8 juillet 2013 d’orientation et de programmation pour la refondation de l’École de la République ; vu le code de l’éducation et notamment ses articles L. 311-7 et D. 311-13.</p>
        <div class="pap-p-box"><p><strong>Nom et prénom(s) de l’élève :</strong> ${s.nom} ${s.prenom}</p><p><strong>Classe :</strong> ${c ? c.name : ''} · ${model.schoolYear()}</p></div>
        ${d.medecin.appuis || d.medecin.consequences ? html`<div class="pap-p-box"><p><strong>Besoins spécifiques de l’élève</strong> (à remplir par le médecin de l’éducation nationale)</p>
          <p><strong>Points d’appui pour les apprentissages :</strong><br>${d.medecin.appuis}</p><p><strong>Conséquences des troubles sur les apprentissages :</strong><br>${d.medecin.consequences}</p></div>` : ''}
        <h2>Adaptations et aménagements à mettre en place en fonction des besoins de l’élève — au collège</h2>
        <p class="doc-muted"><strong>L’ensemble des items n’est pas à renseigner. Seuls les items indispensables à l’élève sont à cocher.</strong></p>
        ${SECTIONS.map(tableau)}
        <table class="doc-table pap-p"><thead><tr><th class="left pap-p-sec">Autres aménagements et adaptations :</th>${NIVEAUX.map(n => html`<th class="pap-p-n">${n}</th>`)}</tr></thead>
          <tbody>${autres.map(a => html`<tr><td class="left">${a.texte || raw('&nbsp;')}</td>${NIVEAUX.map(n => croix(a.niveaux.includes(n), n === d.niveau))}</tr>`)}</tbody></table>
        <table class="doc-table pap-p pap-visas"><tbody>${NIVEAUX.map(n => html`<tr><td class="left pap-v-n">${n}</td><td class="left">Date :</td><td class="left">Visa des parents :</td><td class="left">Signature et tampon du chef d’établissement :</td></tr>`)}</tbody></table>
        <h2>Bilan des aides apportées au collège</h2>
        <p><strong>Aménagements n’ayant pas atteint les objectifs escomptés :</strong><br>${d.bilan.nonAtteints || raw('<br><br>')}</p>
        <p><strong>Aménagements profitables à l’élève :</strong><br>${d.bilan.profitables || raw('<br><br>')}</p>
        <h2>Entrée au lycée</h2><p><strong>Liaison collège–lycée</strong> <em>(à remplir par le professeur principal en lien avec un professeur du lycée)</em> :<br>${d.liaison || raw('<br><br>')}</p>
        <p class="doc-muted">Grille : Bulletin officiel n° 5 du 29 janvier 2015. Édité le ${fmtDayYear(new Date())} depuis le Carnet de classe.</p>
      </section></div></main></div>`;
}

export default {
  render({ studentId: id, mode }) {
    let s, info;
    try { s = db.get('students', id); if (studentId !== id || !draft) info = charger(id); else info = pap.papDe(id); }
    catch (e) { return html`<div class="screen"><header class="topbar">${backLink('#/pp', 'Suivi PP')}<div class="title">PAP</div></header><main class="content"><p>${e.message}</p></main></div>`; }
    const c = db.get('classes', s.classId);
    syn = service.synthese(id);
    // Ouvrir le PAP vaut lecture des avis reçus (l'alerte « nouveaux retours » disparaît).
    if (mode !== 'imprimer') setTimeout(() => { try { notifs.marquerVu(id); } catch (e) { /* rien */ } });
    if (mode === 'imprimer') return impression(s, c, draft);
    return saisie(s, c, info);
  },
  async leave() { if (!dirty) { draft = null; studentId = ''; } },
  actions: {
    niveau(el) { draft.niveau = el.value; dirty = true; refresh(); },
    case(el) {
      const n = el.dataset.n, id = el.dataset.id, list = new Set(draft.cases[n] || []);
      if (el.checked) list.add(id); else list.delete(id);
      draft.cases[n] = [...list]; dirty = true; refreshSave();
    },
    autreAdd() { draft.autres.push({ id: db.uid(), texte: '', niveaux: [draft.niveau] }); dirty = true; refresh(); document.querySelector('[data-input="autreTexte"]:last-of-type')?.focus(); },
    autreTexte(el) { const a = draft.autres.find(x => x.id === el.dataset.id); if (a) { a.texte = el.value; dirty = true; refreshSave(); } },
    autreNiveau(el) {
      const a = draft.autres.find(x => x.id === el.dataset.id); if (!a) return;
      a.niveaux = el.checked ? [...new Set([...a.niveaux, el.dataset.n])] : a.niveaux.filter(n => n !== el.dataset.n);
      dirty = true; refreshSave();
    },
    autreDel(el) { draft.autres = draft.autres.filter(a => a.id !== el.dataset.id); dirty = true; refresh(); },
    medecin(el) { draft.medecin[el.dataset.k] = el.value; dirty = true; refreshSave(); },
    bilan(el) { draft.bilan[el.dataset.k] = el.value; dirty = true; refreshSave(); },
    liaison(el) { draft.liaison = el.value; dirty = true; refreshSave(); },
    async save() {
      if (busy || !dirty) return;
      busy = true; refresh();
      try {
        const heads = pap.papDe(studentId).heads;
        const row = await pap.enregistrer(studentId, draft, baseId, heads.length > 1 ? { resoudre: true, expectedHeads: heads.map(h => h.id) } : {});
        baseId = row.id; dirty = false;
        toast({ text: 'PAP enregistré' });
      } catch (e) { toast({ text: e.message, ms: 7000 }); }
      busy = false; refresh();
    },
    print() { window.print(); },
    // ----- Consultation des collègues -----
    cfgUrl(el) { cfg.url = el.value; },
    cfgKey(el) { cfg.key = el.value; },
    cfgSave() {
      try { service.configurer(cfg.url, cfg.key); cfg = { url: '', key: '' }; refresh(); toast({ text: 'Service Google enregistré' }); }
      catch (e) { toast({ text: e.message, ms: 7000 }); }
    },
    consultMsg(el) { consult.message = el.value; },
    consultEch(el) { consult.echeance = el.value; },
    async publier() { await envoyer({}); },
    async clore() { if (await confirmDialog({ title: 'Clore la consultation ?', text: 'Les collègues ne pourront plus répondre. Les avis déjà reçus restent récupérables. Vous pourrez rouvrir.', ok: 'Clore' })) await envoyer({ status: 'closed' }); },
    async rouvrir() { await envoyer({ status: 'open' }); },
    async copier() {
      const e = service.etat(studentId); if (!e) return;
      try { await navigator.clipboard.writeText(e.url); toast({ text: 'Lien copié : collez-le dans votre message aux collègues (Pronote, messagerie…)' }); }
      catch { toast({ text: 'Copie impossible : sélectionnez le lien à la main', ms: 6000 }); }
    },
    async recuperer() {
      if (busy) return; busy = true; refresh();
      try { const r = await service.recuperer(studentId); toast({ text: `${r.reponses.length} avis récupéré${r.reponses.length > 1 ? 's' : ''}` }); }
      catch (e) { toast({ text: e.message, ms: 8000 }); }
      busy = false; refresh();
    },
    cocherProposes() {
      const n = draft.niveau, list = new Set(draft.cases[n] || []), avant = list.size;
      for (const id of syn.parItem.keys()) list.add(id);
      draft.cases[n] = [...list]; dirty = true; refresh();
      toast({ text: `${list.size - avant} item${list.size - avant > 1 ? 's' : ''} coché${list.size - avant > 1 ? 's' : ''} en ${n} : décochez ceux que vous ne retenez pas, puis Enregistrer`, ms: 7000 });
    },
    ajouterAutre(el) { draft.autres.push({ id: db.uid(), texte: el.dataset.t, niveaux: [draft.niveau] }); dirty = true; refresh(); toast({ text: 'Ajouté aux autres aménagements : pensez à Enregistrer' }); },

  },
};

// Le bouton « Enregistrer » s'active dès la première modification, sans redessiner l'écran (saisie en cours).
function refreshSave() { const b = document.querySelector('[data-click="save"]'); if (b) b.disabled = busy || !dirty; }

// Publie (ou met à jour, clôt, rouvre) la consultation, à partir du PAP enregistré.
async function envoyer(options) {
  if (busy) return;
  if (dirty) { toast({ text: 'Enregistrez d’abord le PAP : c’est la version enregistrée qui est montrée aux collègues.', ms: 6000 }); return; }
  busy = true; refresh();
  try {
    const e = await service.publier(studentId, { ...options, ...(consult.message != null ? { message: consult.message } : {}), ...(consult.echeance != null ? { echeance: consult.echeance } : {}) });
    consult = { message: null, echeance: null };
    toast({ text: e.status === 'open' ? 'Formulaire des collègues à jour : copiez le lien pour l’envoyer' : 'Consultation close : les avis reçus restent récupérables', ms: 6000 });
  } catch (err) { toast({ text: err.message, ms: 8000 }); }
  busy = false; refresh();
}
