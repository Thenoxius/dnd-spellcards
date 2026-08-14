/* Grimoire Forge — filteren, matchen en kaart-rendering (alles lokaal) */
(() => {
'use strict';
const D = window.SPC_DATA;
if (!D) {
  document.getElementById('status').textContent =
    'FOUT: data/spells.js ontbreekt. Draai: node scripts/update-data.mjs';
  return;
}

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => String(s ?? '')
  .toLowerCase()
  .replace(/[’‘`]/g, "'")
  .replace(/[“”]/g, '"')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const slug = s => norm(s).replace(/[^a-z0-9]/g, '');
const tokens = s => new Set(norm(s).replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(w => w && !['the', 'of', 'a'].includes(w)));
/* Woordoverlap: vangt een andere woordvolgorde of een weggelaten woord op. */
function tokenSim(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}
/* Dice op letterparen: vangt tikfouten bínnen een woord op ("missle" → "missile").
   Alleen woordoverlap is daarvoor blind — die ziet in "magic missle" enkel "magic"
   en vindt dan net zo goed "Detect Magic". */
function bigrams(s) {
  const t = norm(s).replace(/[^a-z0-9]/g, '');
  const m = new Map();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}
function charSim(a, b) {
  const A = bigrams(a), B = bigrams(b);
  let na = 0, nb = 0, inter = 0;
  for (const v of A.values()) na += v;
  for (const v of B.values()) nb += v;
  for (const [g, v] of A) if (B.has(g)) inter += Math.min(v, B.get(g));
  return na + nb ? (2 * inter) / (na + nb) : 0;
}
const sim = (a, b) => Math.max(charSim(a, b), 0.95 * tokenSim(a, b));

/* De SRD gebruikt voor een aantal spreuken een andere naam dan het spelersboek: de
   tovenaarsnamen zijn eraf gehaald. Wie zijn lijst uit een boek of D&D Beyond plakt,
   typt de boeknaam — die vertalen we hier terug. */
const ALIASES = {
  "bigby's hand": 'Arcane Hand',
  "mordenkainen's sword": 'Arcane Sword',
  "nystul's magic aura": "Arcanist's Magic Aura",
  "evard's black tentacles": 'Black Tentacles',
  "mordenkainen's faithful hound": 'Faithful Hound',
  "tenser's floating disk": 'Floating Disk',
  "otiluke's freezing sphere": 'Freezing Sphere',
  "drawmij's instant summons": 'Instant Summons',
  "leomund's secret chest": 'Secret Chest',
  "mordenkainen's magnificent mansion": 'Magnificent Mansion',
  "melf's acid arrow": 'Acid Arrow',
  "mordenkainen's private sanctum": 'Private Sanctum',
  "otiluke's resilient sphere": 'Resilient Sphere',
  "rary's telepathic bond": 'Telepathic Bond',
  "leomund's tiny hut": 'Tiny Hut',
  "tasha's hideous laughter": 'Hideous Laughter',
  "otto's irresistible dance": 'Irresistible Dance',
};

/* ---------- catalogus: SRD + eigen spreuken ---------- */
/* Eigen spreuken staan in localStorage en worden gewoon tussen de SRD-spreuken
   gemengd, zodat filters, kiezer, plaklijst en kaarten er niets van hoeven te weten. */
let CUSTOM = [];
try { CUSTOM = JSON.parse(localStorage.getItem('spc.custom') || '[]'); } catch (e) { CUSTOM = []; }
let SPELLS = [];
let byId = new Map();
let bySlug = new Map();
function rebuildCatalog() {
  SPELLS = [...D.spells, ...CUSTOM];
  byId = new Map(SPELLS.map(s => [s.id, s]));
  bySlug = new Map(SPELLS.map(s => [slug(s.name), s]));
}
const saveCustom = () => localStorage.setItem('spc.custom', JSON.stringify(CUSTOM));
rebuildCatalog();
const SCHOOL_KEY = { Abjuration: 'abjuration', Conjuration: 'conjuration', Divination: 'divination',
  Enchantment: 'enchantment', Evocation: 'evocation', Illusion: 'illusion',
  Necromancy: 'necromancy', Transmutation: 'transmutation' };

/* ---------- taal: nl indien systeem/keuze Nederlands, anders Engels ---------- */
let LANG = (() => {
  const pick = new URLSearchParams(location.search).get('lang')
    || localStorage.getItem('spc.lang') || navigator.language || 'en';
  return String(pick).toLowerCase().startsWith('nl') ? 'nl' : 'en';
})();
const STR = {
  nl: {
    tagline: 'D&D 5e-spreuken → printbare kaarten',
    tabPick: '✶ Kiezen', tabPaste: '📜 Plakken', tabOwn: '✎ Eigen',
    lblOName: 'Naam', lblOLevel: 'Niveau', lblOSchool: 'School', lblOClasses: "Klassen (komma's)",
    lblOTime: 'Bezweringstijd', lblORange: 'Bereik', lblOComps: 'Componenten', lblODur: 'Duur',
    lblOMat: 'Materiaal', lblOConc: 'Concentratie', lblORitual: 'Ritueel',
    lblODesc: 'Beschrijving (lege regel = nieuwe alinea)', lblOHigher: 'Op hoger niveau',
    btnOSave: '✓ Opslaan', btnONew: 'Nieuw', btnODel: 'Verwijderen',
    btnOExport: '⭳ Exporteren', btnOImport: '⭱ Importeren',
    ownHint: 'De SRD bevat niet elke spreuk uit het spelersboek (Hex, Chromatic Orb, Dissonant Whispers en een handvol andere ontbreken). Voeg ze hier zelf toe — ze komen gewoon tussen de andere in de lijst te staan en worden lokaal bewaard.',
    ownEmpty: 'Nog geen eigen spreuken.',
    ownNeedName: 'Geef de spreuk eerst een naam.',
    ownSaved: n => `✔ ‘${n}’ opgeslagen en aangevinkt.`,
    ownDeleted: n => `‘${n}’ verwijderd.`,
    ownImported: n => `✔ ${n} eigen spreuk${n === 1 ? '' : 'en'} geïmporteerd.`,
    ownBadFile: 'Dat bestand bevat geen lijst met spreuken.',
    ownTag: 'eigen', ownFoot: 'eigen kaart',
    srdNote: 'Niet alles uit het spelersboek zit in de SRD — voeg ontbrekende spreuken toe op de tab “Eigen”.',
    lblSearch: 'Zoeken', lblClass: 'Klasse', lblSort: 'Sorteren', lblLevel: 'Niveau',
    sortLevel: 'Niveau', sortName: 'A–Z', sortSchool: 'School',
    allClasses: 'Alle klassen', cantrip: 'Cantrip', lvlN: n => `${n}e niveau`,
    lblFConc: 'Concentratie', lblFRitual: 'Ritueel',
    selAll: 'Alles kiezen', selNone: 'Wissen',
    pickCount: (v, t) => `${v} van ${t} zichtbaar · ${SEL.size} gekozen`,
    listEmpty: 'Geen spreuk voldoet aan deze filters.',
    panelLabel: 'Spreukenlijst (één naam per regel)',
    btnParse: '✶ Zoek spreuken', btnSample: 'Voorbeeld',
    pasteHint: 'Namen worden ook herkend met tikfouten, nummering, bulletpunten of een niveau-aanduiding erachter. Wat niet gevonden wordt, komt hieronder te staan.',
    optionsLegend: 'Opties', formatLabel: 'Formaat',
    sizeL: 'Groot', sizeS: 'Compact', sizeA6: 'A6-kaarten',
    lblMargin: 'Printmarge', lblPaper: 'Papier',
    paperOpts: { a4: 'A4 — 4 kaarten per vel', a6: 'A6 — 1 per vel (105 × 148)', '10x15': '10 × 15 cm — 1 per vel (100 × 150)' },
    marginOpts: { 0: '0 mm — randloos', 3: '3 mm — krap', 4: '4 mm — standaard', 6: '6 mm', 8: '8 mm — veilig' },
    lblHigher: 'Tekst "op hoger niveau"', lblMaterial: 'Materiaalcomponent voluit',
    lblFacts: 'Balk met schade/redding/gebied', lblIndex: 'Overzichtskaart met de lijst',
    lblFill: 'Korte spreuken uitvergroten tot de kaart vol is',
    lblCont: 'Te lange spreuken doorlopen op de achterkant',
    lblBacks: 'Kaart-achterkanten (dubbelzijdig printen)',
    lblBackBorder: 'Rand', lblBackColor: 'Basis', lblBackColor2: 'Accent',
    lblBackPattern: 'Motief', lblBackImage: 'Afbeelding', lblBackScale: 'Grootte', lblBackTile: 'tegelen',
    print: ' Afdrukken',
    empty: 'Kies links je spreuken — de kaarten verschijnen hier.',
    cardSize: (w, h) => `kaart ${w} × ${h} mm`,
    statusMade: n => `✔ ${n} kaart${n === 1 ? '' : 'en'} klaar.`,
    statusNone: 'Nog geen spreuken gekozen.',
    statusPaste: 'Plak eerst een lijst met spreuknamen.',
    statusFound: (n, t) => `✔ ${n} van ${t} regels herkend.`,
    statusNotFound: names => `⚠ Niet gevonden: ${names.join(', ')}`,
    statusGuess: (from, to) => `‘${from}’ → ${to}`,
    statusGuessHead: '↪ Gelezen als:',
    queueInfo: (q, s, sh) => `Printopdracht: ${q} kaart${q === 1 ? '' : 'en'}`
      + (sh ? ` op ${sh} vel${sh === 1 ? '' : 'len'}` : '') + (s ? ` · ${s} overgeslagen` : '') + '.',
    queueCont: n => `${n} spreuk${n === 1 ? '' : 'en'} loopt door op de achterkant.`,
    skipTray: n => `${n} overgeslagen kaart${n === 1 ? '' : 'en'} — klik op de kop om terug te zetten`,
    contTag: 'vervolg', contMore: '→ verder op de achterkant',
    indexTitle: 'Spreukenlijst', indexSub: n => `${n} spreuken`,
    hintExclude: 'Tip: klik op een kaartkop om die kaart bij het afdrukken over te slaan. Overgeslagen kaarten gaan naar de lade onder de vellen en tellen niet mee in de printopdracht.',
    a6Hint: 'A6-modus: <b>4 kaarten op één A4-vel</b> (2×2) om uit te snijden. De kaarten vullen het vel tot aan de veiligheidsmarge hieronder — die marge is de rand die je printer niet kan bedrukken. In het printvenster: papier A4, <b>pagina\'s per blad: 1</b> (de app maakt het 2×2-vel zelf!), schaal <b>100%</b> (niet "passend maken"), en vink <b>kop- en voettekst uit</b>.',
    contHint: 'Past een spreuk alleen door hem sterk te verkleinen, dan blijft op de voorkant staan wat op ware grootte past en gaat de rest naar een vervolgkaart op de achterkant — dus daar geen motief. Print dan <b>dubbelzijdig</b>, omslaan over de <b>lange zijde</b>.',
    backsHint: 'Achterkanten werken alleen in A6-modus: achter elk vel met 4 voorkanten komt een gespiegeld vel met achterkanten. Print dubbelzijdig en laat omslaan over de <b>lange zijde</b>.',
    credits: 'Spreukdata: SRD 5.1 (OGL) via <a href="https://github.com/5e-bits/5e-database" style="color:inherit">5e-bits/5e-database</a>, lokaal opgeslagen.',
  },
  en: {
    tagline: 'D&D 5e spells → printable cards',
    tabPick: '✶ Pick', tabPaste: '📜 Paste', tabOwn: '✎ Own',
    lblOName: 'Name', lblOLevel: 'Level', lblOSchool: 'School', lblOClasses: 'Classes (comma separated)',
    lblOTime: 'Casting time', lblORange: 'Range', lblOComps: 'Components', lblODur: 'Duration',
    lblOMat: 'Material', lblOConc: 'Concentration', lblORitual: 'Ritual',
    lblODesc: 'Description (blank line = new paragraph)', lblOHigher: 'At higher levels',
    btnOSave: '✓ Save', btnONew: 'New', btnODel: 'Delete',
    btnOExport: '⭳ Export', btnOImport: '⭱ Import',
    ownHint: 'The SRD does not contain every spell from the Player\'s Handbook (Hex, Chromatic Orb, Dissonant Whispers and a handful of others are missing). Add them here — they slot in with the rest and are stored locally.',
    ownEmpty: 'No spells of your own yet.',
    ownNeedName: 'Give the spell a name first.',
    ownSaved: n => `✔ ‘${n}’ saved and picked.`,
    ownDeleted: n => `‘${n}’ deleted.`,
    ownImported: n => `✔ Imported ${n} spell${n === 1 ? '' : 's'} of your own.`,
    ownBadFile: 'That file does not contain a list of spells.',
    ownTag: 'own', ownFoot: 'own card',
    srdNote: 'Not everything in the Player\'s Handbook is in the SRD — add missing spells on the “Own” tab.',
    lblSearch: 'Search', lblClass: 'Class', lblSort: 'Sort', lblLevel: 'Level',
    sortLevel: 'Level', sortName: 'A–Z', sortSchool: 'School',
    allClasses: 'All classes', cantrip: 'Cantrip', lvlN: n => `Level ${n}`,
    lblFConc: 'Concentration', lblFRitual: 'Ritual',
    selAll: 'Select all', selNone: 'Clear',
    pickCount: (v, t) => `${v} of ${t} shown · ${SEL.size} picked`,
    listEmpty: 'No spell matches these filters.',
    panelLabel: 'Spell list (one name per line)',
    btnParse: '✶ Find spells', btnSample: 'Sample',
    pasteHint: 'Names are matched even with typos, numbering, bullets or a trailing level. Anything not found is listed below.',
    optionsLegend: 'Options', formatLabel: 'Format',
    sizeL: 'Large', sizeS: 'Compact', sizeA6: 'A6 cards',
    lblMargin: 'Print margin', lblPaper: 'Paper',
    paperOpts: { a4: 'A4 — 4 cards per sheet', a6: 'A6 — 1 per sheet (105 × 148)', '10x15': '10 × 15 cm — 1 per sheet (100 × 150)' },
    marginOpts: { 0: '0 mm — borderless', 3: '3 mm — tight', 4: '4 mm — standard', 6: '6 mm', 8: '8 mm — safe' },
    lblHigher: '"At higher levels" text', lblMaterial: 'Full material component',
    lblFacts: 'Damage/save/area bar', lblIndex: 'Index card with the list',
    lblFill: 'Scale short spells up to fill the card',
    lblCont: 'Long spells continue on the back',
    lblBacks: 'Card backs (double-sided printing)',
    lblBackBorder: 'Border', lblBackColor: 'Base', lblBackColor2: 'Accent',
    lblBackPattern: 'Pattern', lblBackImage: 'Image', lblBackScale: 'Size', lblBackTile: 'tile',
    print: ' Print',
    empty: 'Pick your spells on the left — cards appear here.',
    cardSize: (w, h) => `card ${w} × ${h} mm`,
    statusMade: n => `✔ ${n} card${n === 1 ? '' : 's'} ready.`,
    statusNone: 'No spells picked yet.',
    statusPaste: 'Paste a list of spell names first.',
    statusFound: (n, t) => `✔ Matched ${n} of ${t} lines.`,
    statusNotFound: names => `⚠ Not found: ${names.join(', ')}`,
    statusGuess: (from, to) => `‘${from}’ → ${to}`,
    statusGuessHead: '↪ Read as:',
    queueInfo: (q, s, sh) => `Print job: ${q} card${q === 1 ? '' : 's'}`
      + (sh ? ` on ${sh} sheet${sh === 1 ? '' : 's'}` : '') + (s ? ` · ${s} skipped` : '') + '.',
    queueCont: n => `${n} spell${n === 1 ? '' : 's'} continue on the back.`,
    skipTray: n => `${n} skipped card${n === 1 ? '' : 's'} — click the header to put one back`,
    contTag: 'continued', contMore: '→ continues on the back',
    indexTitle: 'Spell List', indexSub: n => `${n} spells`,
    hintExclude: 'Tip: click a card header to skip that card when printing. Skipped cards move to the tray below the sheets and are left out of the print job.',
    a6Hint: 'A6 mode: <b>4 cards on one A4 sheet</b> (2×2) to cut out. The cards fill the sheet up to the safety margin below — that margin is the edge your printer cannot print on. In the print dialog: paper A4, <b>pages per sheet: 1</b> (the app builds the 2×2 sheet itself!), scale <b>100%</b> (not "fit to page"), and switch <b>headers and footers off</b>.',
    contHint: 'If a spell only fits by shrinking it a lot, the front keeps what fits at full size and the rest moves to a continuation card on the back — so no pattern there. Print <b>double-sided</b>, flipping on the <b>long edge</b>.',
    backsHint: 'Card backs only work in A6 mode: behind each sheet of 4 fronts comes a mirrored sheet of backs. Print double-sided, flipping on the <b>long edge</b>.',
    credits: 'Spell data: SRD 5.1 (OGL) via <a href="https://github.com/5e-bits/5e-database" style="color:inherit">5e-bits/5e-database</a>, stored locally.',
  },
};
let T = STR[LANG];

/* ---------- staat ---------- */
const SEL = new Set(JSON.parse(localStorage.getItem('spc.sel') || '[]').filter(id => byId.has(id)));
const filters = {
  q: '', cls: '', min: 0, max: 9, conc: false, ritual: false,
  schools: new Set(D.schools),
  sort: localStorage.getItem('spc.sort') || 'level',
};
const saveSel = () => localStorage.setItem('spc.sel', JSON.stringify([...SEL]));

const opts = {
  higher: true, material: true, facts: true, index: false,
};
const backOpts = {
  on: localStorage.getItem('spc.backs') === '1',
  border: localStorage.getItem('spc.backBorder') || '#1c1830',
  color: localStorage.getItem('spc.backColor') || '#2b2540',
  color2: localStorage.getItem('spc.backColor2') || '#c9a24b',
  pattern: localStorage.getItem('spc.backPattern') || 'stars',
  image: null, scale: 100, tile: false,
};
let contOn = localStorage.getItem('spc.cont') === '1';
let fillOn = localStorage.getItem('spc.fill') !== '0';   // standaard aan

/* ---------- spreuk → tekst ---------- */
const lvlLabel = l => (l === 0 ? T.cantrip : T.lvlN(l));
const compLine = s => (s.comps || []).join(', ');

/* De regel zoals het spelersboek hem onder de spreuknaam zet: "3rd-level evocation",
   "Evocation cantrip", met "(ritual)" erachter. Altijd Engels — de spreuktekst zelf
   is dat ook. */
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const phbLine = s => (s.lvl === 0 ? `${s.school} cantrip` : `${ORD[s.lvl]}-level ${s.school.toLowerCase()}`)
  + (s.ritual ? ' (ritual)' : '');

/* ***Kop.*** en **vet** uit de SRD-tekst naar HTML; alles daarvoor ge-escaped. */
const inlineMd = t => esc(t)
  .replace(/\*\*\*(.+?)\*\*\*/g, '<b>$1</b>')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

/* Zeven spreuken (Confusion, Reincarnate, …) hebben markdown-tabellen in de tekst.
   Opeenvolgende |-regels worden één echte tabel; de rest wordt een alinea. */
function descHtml(paras) {
  const out = [];
  let table = null;
  const flush = () => {
    if (!table) return;
    const [head, ...rows] = table;
    out.push(`<table class="tbl"><thead><tr>${head.map(c => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead>`
      + `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    table = null;
  };
  for (const p of paras) {
    const line = String(p).trim();
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue;   // scheidingsregel
      (table = table || []).push(cells);
      continue;
    }
    flush();
    out.push(`<p>${inlineMd(line)}</p>`);
  }
  flush();
  return out;
}

/* De snelle feiten onderaan: wat je midden in een gevecht wil zien zonder te lezen. */
function factsOf(s) {
  const f = [];
  const dmgAt = s.dmg && (s.dmg.slot || s.dmg.char);
  if (dmgAt) {
    const keys = Object.keys(dmgAt).map(Number).sort((a, b) => a - b);
    const base = dmgAt[String(s.dmg.slot ? Math.max(s.lvl, keys[0]) : keys[0])] || dmgAt[String(keys[0])];
    f.push(`<span class="f">Damage <b>${esc(base)}${s.dmg.t ? ' ' + esc(s.dmg.t.toLowerCase()) : ''}</b></span>`);
  }
  if (s.heal) {
    const k = Object.keys(s.heal).map(Number).sort((a, b) => a - b);
    f.push(`<span class="f">Healing <b>${esc(s.heal[String(Math.max(s.lvl, k[0]))] || s.heal[String(k[0])])}</b></span>`);
  }
  if (s.dc) {
    const eff = { half: 'half', none: 'negates', other: 'see text' }[s.dc.s] || s.dc.s;
    f.push(`<span class="f">Save <b>${esc(s.dc.t)}</b>${eff ? ` (${esc(eff)})` : ''}</span>`);
  }
  if (s.aoe) f.push(`<span class="f">Area <b>${s.aoe.s} ft ${esc(s.aoe.t)}</b></span>`);
  return f;
}

function schoolIcon(school) {
  const key = SCHOOL_KEY[school];
  return key ? `<svg class="school-icon" aria-hidden="true"><use href="#s-${key}"/></svg>` : '';
}

/* ---------- kaart ---------- */
function spellCard(s) {
  const body = [];
  const badges = [];
  if (s.conc) badges.push('<span class="badge conc">Concentration</span>');
  if (s.ritual) badges.push('<span class="badge ritual">Ritual</span>');
  if (s.atk) badges.push(`<span class="badge atk">${esc(s.atk)} attack</span>`);
  if (badges.length) body.push(`<div class="badges">${badges.join('')}</div>`);
  if (s.mat && opts.material) body.push(`<p class="mat"><b>M:</b> ${esc(s.mat)}</p>`);

  const blocks = descHtml(s.desc).map(h => `<div class="ab">${h}</div>`);
  if (opts.higher && s.higher && s.higher.length) {
    blocks.push(`<div class="ab higher"><div class="ab-head">At Higher Levels</div>`
      + descHtml(s.higher).join('') + '</div>');
  }
  body.push(`<div class="abilities">${blocks.join('')}</div>`);

  const facts = opts.facts ? factsOf(s) : [];
  const cls = SCHOOL_KEY[s.school] ? ` sch-${SCHOOL_KEY[s.school]}` : '';
  const lvlTxt = s.lvl === 0 ? 'Cantrip' : 'Level';

  return `<article class="card${cls}" data-id="${esc(s.id)}">
    <header class="card-head">
      ${schoolIcon(s.school)}
      <div class="title">
        <h2>${esc(s.name)}</h2>
        <div class="subtitle">${esc(phbLine(s))}</div>
      </div>
      <div class="lvl"><b>${s.lvl}</b><span>${lvlTxt}</span></div>
    </header>
    <div class="statbar">
      <div class="st"><span>Casting time</span><b>${esc(s.time)}</b></div>
      <div class="st"><span>Range</span><b>${esc(s.range)}</b></div>
      <div class="st"><span>Components</span><b>${esc(compLine(s))}</b></div>
      <div class="st"><span>Duration</span><b>${esc(s.dur)}</b></div>
    </div>
    <div class="card-body"><div class="fitbox">${body.join('')}</div></div>
    ${facts.length ? `<div class="facts">${facts.join('')}</div>` : ''}
    <div class="card-foot"><span>${esc(s.classes.join(' · '))}</span>
      <span class="right">${s.custom ? esc(T.ownFoot) : 'D&amp;D 5e SRD'}</span></div>
  </article>`;
}

/* Overzichtskaart: de lijst zelf met afstreepvakjes, gegroepeerd per niveau.
   Een A6-kaart heeft een vaste hoogte, dus lange lijsten lopen door op een volgende
   overzichtskaart in plaats van van de kaart af. */
const INDEX_CHUNK = 30;

function indexCards(list, a6) {
  const chunks = [];
  const per = a6 ? INDEX_CHUNK : list.length;
  for (let i = 0; i < list.length; i += per) chunks.push(list.slice(i, i + per));
  return chunks.map((chunk, n) => {
    const groups = new Map();
    for (const s of chunk) { if (!groups.has(s.lvl)) groups.set(s.lvl, []); groups.get(s.lvl).push(s); }
    const parts = [...groups.keys()].sort((a, b) => a - b).map(lvl => {
      const items = groups.get(lvl).map(s => `<li>
        <span class="box"></span>
        <span class="ix-sch" style="background:var(--sch-${SCHOOL_KEY[s.school] || 'evocation'})"></span>
        <span>${esc(s.name)}</span>
        <span class="ix-meta">${s.conc ? 'C' : ''}${s.ritual ? 'R' : ''} ${esc(s.time.replace('1 ', ''))}</span>
      </li>`).join('');
      return `<div class="ab"><div class="ix-lvl">${esc(lvlLabel(lvl))}</div><ul>${items}</ul></div>`;
    });
    const part = chunks.length > 1 ? ` ${n + 1}/${chunks.length}` : '';
    return `<article class="card index" data-id="__index${n}">
      <header class="card-head">
        <div class="title"><div class="sub-top">Grimoire</div><h2>${esc(T.indexTitle + part)}</h2>
        <div class="subtitle">${esc(T.indexSub(list.length))}</div></div>
      </header>
      <div class="card-body"><div class="fitbox"><div class="abilities">${parts.join('')}</div></div></div>
    </article>`;
  }).join('');
}

/* ---------- kaarten bouwen ---------- */
const sortSpells = list => [...list].sort((a, b) => {
  if (filters.sort === 'name') return a.name.localeCompare(b.name);
  if (filters.sort === 'school') return a.school.localeCompare(b.school) || a.lvl - b.lvl || a.name.localeCompare(b.name);
  return a.lvl - b.lvl || a.name.localeCompare(b.name);
});

function build() {
  const cards = $('#cards');
  const a6 = cards.classList.contains('size-a6');
  const list = sortSpells([...SEL].map(id => byId.get(id)).filter(Boolean));
  const index = opts.index && list.length ? indexCards(list, a6) : '';
  cards.innerHTML = index + list.map(spellCard).join('');
  cards.dataset.empty = T.empty;
  setStatus(list.length
    ? `<span class="ok">${esc(T.statusMade(cards.querySelectorAll('.card').length))}</span>`
    : T.statusNone);
  buildSheets();
  fitA6();
}

/* ---------- fitten (A6): inhoud passend schalen ---------- */
/* Onder deze schaal is de tekst op papier kleiner dan ~8pt; zulke kaarten komen in
   aanmerking om door te lopen op de achterkant (als die optie aanstaat). */
const CONT_THRESHOLD = 0.8;

/* Korte spreuken laten een A6-kaart half leeg; daarom mag de tekst ook groeien tot
   de kaart vol staat. Boven deze factor gaat het op een groteletterboek lijken. */
const MAX_UP = 1.45;

function fitCard(card, a6) {
  const body = card.querySelector('.card-body');
  const fit = body && body.querySelector(':scope > .fitbox');
  if (!fit) return 1;
  fit.style.transform = '';
  fit.style.width = '';
  fit.classList.remove('two-col');
  if (!a6) return 1;
  const cs = getComputedStyle(body);
  const availH = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const availW = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);

  /* Meten is duur: elke breedtewijziging dwingt een herberekening van de kaart, en dat
     kost enkele milliseconden. Bij een klassenpakket van ~200 kaarten telt dat hard aan,
     dus schatten we de schaal eerst en verfijnen daarna nog een paar keer.
     De doos krijgt de omgekeerde breedte, zodat de tekst ná het schalen precies zo breed
     is als de kaart. */
  const measure = k => { fit.style.width = (availW / k) + 'px'; return fit.offsetHeight * k; };
  /* Bij het schalen blijft het tekstoppervlak ongeveer gelijk: half zo klein betekent
     twee keer zo breed en dus ruwweg de helft van de hoogte. De hoogte loopt daardoor
     zo'n beetje met k² — vandaar de wortel als eerste gok. */
  const guess = h => Math.sqrt(availH / h);
  /* Verfijning binnen een bracket waarvan de ondergrens gegarandeerd past. */
  const refine = (lo, hi, bestKnown) => {
    let best = bestKnown;
    for (let i = 0; i < 3; i++) {
      const mid = (lo + hi) / 2;
      if (measure(mid) <= availH) { best = mid; lo = mid; } else { hi = mid; }
    }
    return best;
  };

  const h1 = fit.offsetHeight;
  if (h1 <= availH + 1) {
    if (!fillOn) { fit.style.width = ''; return 1; }
    const est = Math.min(MAX_UP, Math.max(1, guess(h1)));
    const up = measure(est) <= availH ? refine(est, MAX_UP, est) : refine(1, est, 1);
    if (up > 1.02) { fit.style.width = (availW / up) + 'px'; fit.style.transform = `scale(${up})`; }
    else { fit.style.width = ''; fit.style.transform = ''; }
    return 1;                              // niet krimpen ⇒ nooit doorlopen op de achterkant
  }

  const shrink = () => {
    const est = Math.min(1, Math.max(0.3, guess(fit.offsetHeight)));
    return measure(est) <= availH ? refine(est, 1, est) : refine(0.3, est, 0.3);
  };
  fit.style.width = '';
  let best = shrink();
  /* Twee kolommen alleen proberen als de tekst er anders echt klein op komt — het kost
     een tweede zoektocht, en bij een lichte verkleining winnen kolommen toch niets. */
  if (best < 0.78 && fit.querySelectorAll('.ab').length > 1) {
    fit.classList.add('two-col');
    fit.style.width = '';
    const best2 = shrink();
    if (best2 > best + 0.03) best = best2;
    else fit.classList.remove('two-col');
  }
  fit.style.width = (availW / best) + 'px';
  fit.style.transform = `scale(${best})`;
  return best;
}

function fitA6() {
  const a6 = $('#cards').classList.contains('size-a6');
  for (const card of $$('#cards .card')) if (card._cont) mergeCont(card._cont);
  contCount = 0;
  for (const card of $$('#cards .a6sheet > .card, #cards > .card, #cards .skiptray > .card')) {
    const scale = fitCard(card, a6);
    if (!a6 || !contOn || scale >= CONT_THRESHOLD || card.classList.contains('cont')) continue;
    if (splitCard(card)) contCount++;
  }
  buildBacks();
  renderQueueInfo();
}

/* Verdeelt de tekstblokken over voor- en achterkant. Startpunt: op de voorkant blijft
   wat op ware grootte past. Daarna schuiven er blokken terug zolang de slechtste van
   de twee helften daar groter van wordt — een halfvolle voorkant met een propvolle
   achterkant leest immers ook niet. */
function splitCard(card) {
  const body = card.querySelector('.card-body');
  const fit = body.querySelector(':scope > .fitbox');
  const host = fit && fit.querySelector(':scope > .abilities');
  if (!host) return false;
  const abs = [...host.children].filter(e => e.classList.contains('ab'));
  if (abs.length < 2) return false;
  const cs = getComputedStyle(body);
  const availH = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let used = fit.offsetHeight - host.offsetHeight;    // badges, materiaalregel
  let keep0 = 0;
  for (const ab of abs) {
    const h = ab.offsetHeight + (parseFloat(getComputedStyle(ab).marginBottom) || 0);
    if (keep0 >= 1 && used + h > availH) break;
    used += h; keep0++;
  }
  if (keep0 >= abs.length) return false;

  const cont = contCard(card);
  const chost = cont.querySelector('.fitbox > .abilities');
  card._cont = cont; cont._front = card;
  measureSheet().appendChild(cont);
  const more = document.createElement('div');
  more.className = 'cont-more';
  more.textContent = T.contMore;

  const apply = keep => {
    abs.forEach((ab, i) => (i < keep ? host : chost).appendChild(ab));
    host.appendChild(more);
    return Math.min(fitCard(card, true), fitCard(cont, true));
  };
  let bestKeep = keep0, bestScore = apply(keep0), last = keep0;
  for (let k = keep0 + 1; k < abs.length; k++) {
    const score = apply(k); last = k;
    if (score > bestScore + 0.01) { bestScore = score; bestKeep = k; } else break;
  }
  if (last !== bestKeep) apply(bestKeep);
  return true;
}

function contCard(front) {
  const el = document.createElement('article');
  el.className = 'card cont ' + [...front.classList].filter(c => c.startsWith('sch-')).join(' ');
  const name = (front.querySelector('.card-head h2') || {}).textContent || '';
  el.innerHTML = `<header class="card-head"><div class="title">
      <div class="sub-top">• ${esc(T.contTag)} •</div><h2>${esc(name)}</h2></div></header>
    <div class="card-body"><div class="fitbox"><div class="abilities"></div></div></div>`;
  return el;
}

function mergeCont(cont) {
  const front = cont._front;
  const host = front && front.querySelector('.card-body > .fitbox > .abilities');
  if (host) {
    for (const ab of [...cont.querySelectorAll('.card-body > .fitbox > .abilities > .ab')]) host.appendChild(ab);
    const more = front.querySelector('.cont-more');
    if (more) more.remove();
    front._cont = null;
  }
  cont.remove();
}

/* Onzichtbaar vel met dezelfde maatvoering als een echt vel, zodat een vervolgkaart
   gemeten kan worden voordat hij op een achterkantvel staat. */
function measureSheet() {
  let m = $('#measureSheet');
  if (!m) {
    m = document.createElement('div');
    m.id = 'measureSheet';
    m.className = 'a6sheet measure';
    $('#cards').appendChild(m);
  }
  return m;
}

/* ---------- achterkanten ---------- */
function styleBack(b) {
  const inner = b.querySelector('.cardback-inner');
  if (inner) {
    for (const c of [...inner.classList]) if (c.startsWith('pat-')) inner.classList.remove(c);
    inner.classList.add('pat-' + backOpts.pattern);
  }
  b.style.setProperty('--border-color', backOpts.border);
  b.style.setProperty('--back-color', backOpts.color);
  b.style.setProperty('--back-color2', backOpts.color2);
  if (backOpts.image) {
    b.style.setProperty('--back-img', `url("${backOpts.image}")`);
    b.style.setProperty('--back-img-repeat', backOpts.tile ? 'repeat' : 'no-repeat');
    b.style.setProperty('--back-img-size',
      (!backOpts.tile && backOpts.scale === 100) ? 'cover' : backOpts.scale + '%');
  } else {
    b.style.removeProperty('--back-img');
  }
}
const refreshBacks = () => $$('.cardback').forEach(styleBack);

function buildBacks() {
  const cards = $('#cards');
  for (const b of $$('#cards .a6sheet.backs')) {
    for (const cont of [...b.querySelectorAll(':scope > .card.cont')]) cont.remove();
    b.remove();
  }
  const m = $('#measureSheet');
  if (m) m.remove();
  if (!cards.classList.contains('size-a6')) return;
  const sheets = [...cards.querySelectorAll('.a6sheet:not(.backs):not(.measure)')];
  // Zodra er íets op een achterkant komt, krijgt élk vel een achterpagina — ook een
  // lege. Anders verschuift bij dubbelzijdig printen de voor/achter-afwisseling en
  // belandt de volgende voorkant op de rug van de vorige kaart.
  if (!backOpts.on && !sheets.some(s => [...s.children].some(c => c._cont))) return;
  const enkel = cardsPerSheet() === 1;
  for (const sheet of sheets) {
    const group = [...sheet.children].filter(c => c.classList.contains('card'));
    const back = document.createElement('div');
    back.className = 'a6sheet backs';
    group.forEach((c, i) => {
      const cell = c._cont || (backOpts.on ? patternBack() : null);
      if (!cell) return;
      // Op een 2×2-vel gespiegeld voor dubbelzijdig printen (omslaan over de lange
      // zijde); bij één kaart per vel is de achterkant simpelweg de volgende pagina.
      cell.style.gridRow = String(enkel ? 1 : i < 2 ? 1 : 2);
      cell.style.gridColumn = String(enkel ? 1 : i % 2 === 0 ? 2 : 1);
      back.appendChild(cell);
    });
    sheet.after(back);
  }
}
function patternBack() {
  const b = document.createElement('div');
  b.className = 'cardback';
  b.appendChild(Object.assign(document.createElement('div'), { className: 'cardback-inner' }));
  styleBack(b);
  return b;
}

/* ---------- vellen ---------- */
/* Volgnummer per top-level element in #cards: de A6-indeling verplaatst kaarten
   (naar een vel of naar de overslaan-lade), dus de DOM-volgorde is niet meer de
   originele; met dit nummer zetten we alles altijd terug zoals het gemaakt is. */
let ordSeq = 0;

function buildSheets() {
  const cards = $('#cards');
  const a6 = cards.classList.contains('size-a6');

  for (const b of $$('#cards .a6sheet.backs')) {
    for (const cont of [...b.querySelectorAll(':scope > .card.cont')]) cont.remove();
    b.remove();
  }
  const items = [...cards.querySelectorAll('.card:not(.cont)')];
  for (const n of items) if (!n.dataset.ord) n.dataset.ord = String(++ordSeq);
  items.sort((a, b) => a.dataset.ord - b.dataset.ord);
  for (const box of $$('#cards .a6sheet, #cards .skiptray')) box.remove();
  for (const n of items) cards.appendChild(n);

  const queue = items.filter(n => !n.classList.contains('excluded'));
  if (!a6) { updateQueueInfo(queue.length, items.length - queue.length, 0); return; }

  const per = cardsPerSheet();                 // 4 op een A4-snijvel, 1 op klein papier
  for (let idx = 0; idx < queue.length; idx += per) {
    const group = queue.slice(idx, idx + per);
    const sheet = document.createElement('div');
    sheet.className = 'a6sheet';
    cards.insertBefore(sheet, group[0]);
    group.forEach(c => sheet.appendChild(c));
  }
  buildBacks();

  const skipped = items.filter(n => n.classList.contains('excluded'));
  if (skipped.length) {
    const tray = document.createElement('div');
    tray.className = 'skiptray no-print';
    tray.appendChild(Object.assign(document.createElement('div'),
      { className: 'skiptray-head', textContent: T.skipTray(skipped.length) }));
    cards.appendChild(tray);
    skipped.forEach(c => tray.appendChild(c));
  }
  updateQueueInfo(queue.length, skipped.length, Math.ceil(queue.length / per));
}

const queueState = { queued: 0, skipped: 0, sheets: 0 };
let contCount = 0;
function updateQueueInfo(queued, skipped, sheets) {
  Object.assign(queueState, { queued, skipped, sheets });
  renderQueueInfo();
}
function renderQueueInfo() {
  const el = $('#queueInfo');
  if (!el) return;
  el.hidden = !(queueState.queued + queueState.skipped);
  el.innerHTML = esc(T.queueInfo(queueState.queued, queueState.skipped, queueState.sheets))
    + (contCount ? ' ' + esc(T.queueCont(contCount)) : '');
}

function setStatus(html) { $('#status').innerHTML = html; }

/* Kop aanklikken = kaart overslaan bij het afdrukken (en weer terug). */
$('#cards').addEventListener('click', e => {
  const head = e.target.closest('.card-head');
  if (!head) return;
  const card = head.closest('.card');
  if (!card || card.classList.contains('cont')) return;
  card.classList.toggle('excluded');
  buildSheets();
  fitA6();
});

/* ---------- kiezer ---------- */
function visibleSpells() {
  const q = norm(filters.q);
  return SPELLS.filter(s => {
    if (s.lvl < filters.min || s.lvl > filters.max) return false;
    if (filters.cls && !s.classes.includes(filters.cls)) return false;
    if (!filters.schools.has(s.school)) return false;
    if (filters.conc && !s.conc) return false;
    if (filters.ritual && !s.ritual) return false;
    if (q && !norm(s.name).includes(q) && !norm(s.desc.join(' ')).includes(q)) return false;
    return true;
  });
}

function renderPicker() {
  const list = sortSpells(visibleSpells());
  const box = $('#spellList');
  if (!list.length) {
    box.innerHTML = `<div class="sl-empty">${esc(T.listEmpty)}</div>`;
  } else {
    const out = [];
    let group = null;
    for (const s of list) {
      const g = filters.sort === 'school' ? s.school : filters.sort === 'name' ? s.name[0].toUpperCase() : lvlLabel(s.lvl);
      if (g !== group) { out.push(`<div class="sl-group">${esc(g)}</div>`); group = g; }
      const tags = (s.custom ? '✎ ' : '') + (s.conc ? 'C' : '') + (s.ritual ? 'R' : '');
      out.push(`<label class="sl-item${SEL.has(s.id) ? ' sel' : ''}" data-id="${esc(s.id)}">
        <input type="checkbox"${SEL.has(s.id) ? ' checked' : ''}>
        <span class="sl-dot" style="--dot:var(--sch-${SCHOOL_KEY[s.school] || 'evocation'})"></span>
        <span class="nm">${esc(s.name)}</span>
        ${tags ? `<span class="sl-tag">${tags}</span>` : ''}
        <span class="sl-tag">${s.lvl}</span>
      </label>`);
    }
    box.innerHTML = out.join('');
  }
  $('#pickCount').textContent = T.pickCount(list.length, SPELLS.length);
}

$('#spellList').addEventListener('change', e => {
  const item = e.target.closest('.sl-item');
  if (!item) return;
  const id = item.dataset.id;
  if (e.target.checked) SEL.add(id); else SEL.delete(id);
  item.classList.toggle('sel', e.target.checked);
  $('#pickCount').textContent = T.pickCount($$('#spellList .sl-item').length, SPELLS.length);
  saveSel();
  build();
});

$('#btnSelAll').addEventListener('click', () => {
  for (const s of visibleSpells()) SEL.add(s.id);
  saveSel(); renderPicker(); build();
});
$('#btnSelNone').addEventListener('click', () => {
  SEL.clear(); saveSel(); renderPicker(); build();
});

/* ---------- lijst plakken ---------- */
const SAMPLE = `Fire Bolt
Mage Hand
Prestidigitation
Shield
Magic Missile
Misty Step
Mirror Image
Counterspell
Fireball
Fly
Greater Invisibility
Polymorph`;

/* Eén regel → spreuk. Bulletpunten, nummering en een niveau-aanduiding worden eraf
   gehaald; daarna exacte match op naam en anders de beste woordoverlap. */
function matchLine(raw) {
  let line = String(raw)
    .replace(/^[\s\-–—•*·>]+/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\s*\((?:[^)]*)\)\s*$/, '')
    .replace(/\s*[–—-]\s*(?:cantrip|level\s*\d|niveau\s*\d|\d(?:st|nd|rd|th)?\s*level).*$/i, '')
    .replace(/\s*\bx\s*\d+\s*$/i, '')
    .trim();
  if (!line) return null;
  const exact = bySlug.get(slug(line));
  if (exact) return { spell: exact, exact: true, from: line };

  // boeknaam → SRD-naam; anders generiek de tovenaarsnaam ervoor weglaten
  const alias = ALIASES[norm(line)]
    || (/^[a-z]+'s\s+/i.test(norm(line)) ? norm(line).replace(/^[a-z]+'s\s+/i, '') : null);
  if (alias) {
    const hit = bySlug.get(slug(alias));
    if (hit) return { spell: hit, exact: false, from: line };
  }

  // partiële naam ("magic miss"): begint precies één spreuknaam ermee?
  const pre = SPELLS.filter(s => slug(s.name).startsWith(slug(line)));
  if (pre.length === 1) return { spell: pre[0], exact: false, from: line };

  let best = null, score = 0;
  for (const s of SPELLS) {
    const v = sim(line, s.name);
    if (v > score) { score = v; best = s; }
  }
  return score >= 0.62 ? { spell: best, exact: false, from: line } : { spell: null, from: line };
}

function parseList() {
  const text = $('#listInput').value;
  if (!text.trim()) { setStatus(`<span class="warn">${esc(T.statusPaste)}</span>`); return; }
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const missed = [], guessed = [];
  let hit = 0;
  SEL.clear();
  for (const line of lines) {
    const m = matchLine(line);
    if (!m) continue;
    if (!m.spell) { missed.push(m.from); continue; }
    SEL.add(m.spell.id);
    hit++;
    if (!m.exact) guessed.push(T.statusGuess(m.from, m.spell.name));
  }
  saveSel();
  localStorage.setItem('spc.list', text);
  renderPicker();
  build();
  const parts = [`<span class="ok">${esc(T.statusFound(hit, lines.length))}</span>`];
  if (guessed.length) parts.push(`${esc(T.statusGuessHead)} ${guessed.map(esc).join('; ')}`);
  if (missed.length) {
    parts.push(`<span class="warn">${esc(T.statusNotFound(missed))}</span>`);
    parts.push(esc(T.srdNote));
  }
  setStatus(parts.join('<br>'));
}

$('#btnParse').addEventListener('click', parseList);
$('#btnSample').addEventListener('click', () => { $('#listInput').value = SAMPLE; parseList(); });

/* ---------- filters bedienen ---------- */
/* Klassen uit de SRD plus wat er in eigen spreuken is ingevuld. */
const allClasses = () => [...new Set([...D.classes, ...CUSTOM.flatMap(s => s.classes || [])])].sort();

function fillSelects() {
  const cls = $('#fClass');
  const classes = allClasses();
  cls.innerHTML = `<option value="">${esc(T.allClasses)}</option>`
    + classes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  cls.value = classes.includes(filters.cls) ? filters.cls : '';
  // formulier voor eigen spreuken deelt de niveau- en schoolopties
  $('#oLevel').innerHTML = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map(l => `<option value="${l}">${esc(lvlLabel(l))}</option>`).join('');
  $('#oSchool').innerHTML = D.schools.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  if (editingId) {
    const cur = CUSTOM.find(x => x.id === editingId);
    if (cur) { $('#oLevel').value = String(cur.lvl); $('#oSchool').value = cur.school; }
  }
  for (const [sel, val] of [['#fLvlMin', filters.min], ['#fLvlMax', filters.max]]) {
    $(sel).innerHTML = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      .map(l => `<option value="${l}">${esc(lvlLabel(l))}</option>`).join('');
    $(sel).value = String(val);
  }
  $('#fSort').innerHTML = `<option value="level">${esc(T.sortLevel)}</option>`
    + `<option value="name">${esc(T.sortName)}</option>`
    + `<option value="school">${esc(T.sortSchool)}</option>`;
  $('#fSort').value = filters.sort;
  $('#fSchools').innerHTML = D.schools.map(s =>
    `<button class="chip${filters.schools.has(s) ? ' on' : ''}" data-school="${esc(s)}"
      style="--chip:var(--sch-${SCHOOL_KEY[s] || 'evocation'})">${esc(s)}</button>`).join('');
}

$('#fSchools').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const s = chip.dataset.school;
  // ctrl/cmd-klik = alleen deze school; gewone klik = aan/uit
  if (e.ctrlKey || e.metaKey) { filters.schools = new Set([s]); }
  else if (filters.schools.has(s)) filters.schools.delete(s);
  else filters.schools.add(s);
  if (!filters.schools.size) filters.schools = new Set(D.schools);
  $$('#fSchools .chip').forEach(c => c.classList.toggle('on', filters.schools.has(c.dataset.school)));
  renderPicker();
});

let searchTimer = 0;
$('#fSearch').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { filters.q = e.target.value; renderPicker(); }, 140);
});
$('#fClass').addEventListener('change', e => { filters.cls = e.target.value; renderPicker(); });
$('#fLvlMin').addEventListener('change', e => {
  filters.min = +e.target.value;
  if (filters.min > filters.max) { filters.max = filters.min; $('#fLvlMax').value = String(filters.max); }
  renderPicker();
});
$('#fLvlMax').addEventListener('change', e => {
  filters.max = +e.target.value;
  if (filters.max < filters.min) { filters.min = filters.max; $('#fLvlMin').value = String(filters.min); }
  renderPicker();
});
$('#fConc').addEventListener('change', e => { filters.conc = e.target.checked; renderPicker(); });
$('#fRitual').addEventListener('change', e => { filters.ritual = e.target.checked; renderPicker(); });
$('#fSort').addEventListener('change', e => {
  filters.sort = e.target.value;
  localStorage.setItem('spc.sort', filters.sort);
  renderPicker(); build();
});

/* ---------- eigen spreuken ---------- */
let editingId = null;

/* Formulier → spreukobject in exact hetzelfde formaat als de SRD-data. */
function readOwnForm() {
  const name = $('#oName').value.trim();
  if (!name) return null;
  const paras = t => String(t).split(/\n\s*\n/).map(p => p.trim().replace(/\n/g, ' ')).filter(Boolean);
  const s = {
    id: editingId || 'custom-' + slug(name) + '-' + Date.now().toString(36),
    name,
    lvl: +$('#oLevel').value || 0,
    school: $('#oSchool').value,
    time: $('#oTime').value.trim() || '1 action',
    range: $('#oRange').value.trim() || 'Self',
    comps: $('#oComps').value.split(',').map(c => c.trim()).filter(Boolean),
    dur: $('#oDur').value.trim() || 'Instantaneous',
    desc: paras($('#oDesc').value),
    classes: $('#oClasses').value.split(',').map(c => c.trim()).filter(Boolean).sort(),
    custom: 1,
  };
  if (!s.desc.length) s.desc = ['—'];
  const mat = $('#oMat').value.trim();
  if (mat) s.mat = mat;
  if ($('#oConc').checked) s.conc = 1;
  if ($('#oRitual').checked) s.ritual = 1;
  const higher = paras($('#oHigher').value);
  if (higher.length) s.higher = higher;
  return s;
}

function fillOwnForm(s) {
  editingId = s ? s.id : null;
  $('#oName').value = s ? s.name : '';
  $('#oLevel').value = String(s ? s.lvl : 1);
  $('#oSchool').value = s ? s.school : D.schools[0];
  $('#oClasses').value = s ? s.classes.join(', ') : '';
  $('#oTime').value = s ? s.time : '1 action';
  $('#oRange').value = s ? s.range : '60 feet';
  $('#oComps').value = s ? s.comps.join(', ') : 'V, S';
  $('#oDur').value = s ? s.dur : 'Instantaneous';
  $('#oMat').value = (s && s.mat) || '';
  $('#oConc').checked = !!(s && s.conc);
  $('#oRitual').checked = !!(s && s.ritual);
  $('#oDesc').value = s ? s.desc.join('\n\n') : '';
  $('#oHigher').value = (s && s.higher) ? s.higher.join('\n\n') : '';
  renderOwnList();
}

function renderOwnList() {
  const box = $('#ownList');
  if (!CUSTOM.length) { box.innerHTML = `<div class="sl-empty">${esc(T.ownEmpty)}</div>`; return; }
  box.innerHTML = CUSTOM.map(s => `<label class="sl-item${s.id === editingId ? ' sel' : ''}" data-own="${esc(s.id)}">
    <span class="sl-dot" style="--dot:var(--sch-${SCHOOL_KEY[s.school] || 'evocation'})"></span>
    <span class="nm">${esc(s.name)}</span>
    <span class="sl-tag">${s.lvl}</span></label>`).join('');
}
$('#ownList').addEventListener('click', e => {
  const item = e.target.closest('[data-own]');
  if (!item) return;
  const s = CUSTOM.find(x => x.id === item.dataset.own);
  if (s) fillOwnForm(s);
});

$('#btnOSave').addEventListener('click', () => {
  const s = readOwnForm();
  if (!s) { setStatus(`<span class="warn">${esc(T.ownNeedName)}</span>`); return; }
  const at = CUSTOM.findIndex(x => x.id === s.id);
  if (at >= 0) CUSTOM[at] = s; else CUSTOM.push(s);
  saveCustom();
  rebuildCatalog();
  editingId = s.id;
  SEL.add(s.id); saveSel();
  fillSelects(); renderPicker(); renderOwnList(); build();
  setStatus(`<span class="ok">${esc(T.ownSaved(s.name))}</span>`);
});
$('#btnONew').addEventListener('click', () => fillOwnForm(null));
$('#btnODel').addEventListener('click', () => {
  if (!editingId) return;
  const gone = CUSTOM.find(x => x.id === editingId);
  CUSTOM = CUSTOM.filter(x => x.id !== editingId);
  SEL.delete(editingId);
  saveCustom(); saveSel(); rebuildCatalog();
  fillOwnForm(null);
  fillSelects(); renderPicker(); build();
  if (gone) setStatus(`<span class="ok">${esc(T.ownDeleted(gone.name))}</span>`);
});

$('#btnOExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(CUSTOM, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'grimoire-forge-eigen-spreuken.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#btnOImport').addEventListener('click', () => $('#oImportFile').click());
$('#oImportFile').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let list;
    try { list = JSON.parse(reader.result); } catch (err) { list = null; }
    if (!Array.isArray(list)) { setStatus(`<span class="warn">${esc(T.ownBadFile)}</span>`); return; }
    let added = 0;
    for (const raw of list) {
      if (!raw || !raw.name) continue;
      const s = { ...raw, custom: 1, id: raw.id || 'custom-' + slug(raw.name) };
      s.desc = Array.isArray(s.desc) ? s.desc : [String(s.desc || '—')];
      s.classes = Array.isArray(s.classes) ? s.classes : [];
      s.comps = Array.isArray(s.comps) ? s.comps : String(s.comps || '').split(',').map(c => c.trim()).filter(Boolean);
      const at = CUSTOM.findIndex(x => x.id === s.id);
      if (at >= 0) CUSTOM[at] = s; else CUSTOM.push(s);
      added++;
    }
    saveCustom(); rebuildCatalog();
    fillSelects(); renderPicker(); renderOwnList(); build();
    setStatus(`<span class="ok">${esc(T.ownImported(added))}</span>`);
    e.target.value = '';
  };
  reader.readAsText(file);
});

/* ---------- tabs ---------- */
function setTab(t) {
  if (!['pick', 'paste', 'own'].includes(t)) t = 'pick';
  for (const [key, pane, tab] of [['pick', '#panePick', '#tabPick'],
    ['paste', '#panePaste', '#tabPaste'], ['own', '#paneOwn', '#tabOwn']]) {
    $(pane).hidden = key !== t;
    $(tab).classList.toggle('active', key === t);
  }
  localStorage.setItem('spc.tab', t);
}
$('#tabPick').addEventListener('click', () => setTab('pick'));
$('#tabPaste').addEventListener('click', () => setTab('paste'));
$('#tabOwn').addEventListener('click', () => setTab('own'));

/* ---------- opties ---------- */
$('#btnPrint').addEventListener('click', () => window.print());

const pageStyle = document.createElement('style');
document.head.appendChild(pageStyle);
const SIZE_BTN = { l: '#sizeL', s: '#sizeS', a6: '#sizeA6' };
$('#sizeL').addEventListener('click', () => setSize('l'));
$('#sizeS').addEventListener('click', () => setSize('s'));
$('#sizeA6').addEventListener('click', () => setSize('a6'));
function setSize(s) {
  if (!SIZE_BTN[s]) s = 'l';
  for (const [k, sel] of Object.entries(SIZE_BTN)) {
    $('#cards').classList.toggle('size-' + k, s === k);
    $(sel).classList.toggle('active', s === k);
  }
  $('#a6Hint').hidden = s !== 'a6';
  $('#marginRow').hidden = s !== 'a6';
  $('#paperRow').hidden = s !== 'a6';
  localStorage.setItem('spc.size', s);
  applyPaper();
  // de overzichtskaart wordt alleen in A6 in stukken geknipt, dus die moet opnieuw
  if (opts.index && $('#cards').querySelector('.card')) { build(); return; }
  buildSheets();
  fitA6();
}

/* Papierkeuze binnen A6-modus. Op A4 komen er 4 kaarten op een snijvel; op de
   kleinere formaten krijgt elke kaart een eigen pagina en hoef je niets te snijden.
   Maten in mm — 10×15 cm fotopapier is nét geen A6 (100×150 tegen 105×148), en dat
   verschil is precies genoeg om de kaarten niet meer passend te krijgen. */
const PAPERS = {
  a4: { w: 210, h: 297, per: 4 },
  a6: { w: 105, h: 148, per: 1 },
  '10x15': { w: 100, h: 150, per: 1 },
};
let paper = PAPERS[localStorage.getItem('spc.paper')] ? localStorage.getItem('spc.paper') : 'a4';
const cardsPerSheet = () => PAPERS[paper].per;
function applyPaper() {
  const a6mode = $('#cards').classList.contains('size-a6');
  const p = PAPERS[paper];
  $('#cards').classList.toggle('one-up', a6mode && p.per === 1);
  $('#sheetPaper').value = paper;
  const root = document.documentElement.style;
  root.setProperty('--sheet-w', p.w + 'mm');
  root.setProperty('--sheet-h', p.h + 'mm');
  // let op: 'A6' bestaat niet als CSS-paginaformaat (de spec kent A5/A4/A3/B5/B4/
  // letter/legal), dus alles met expliciete maten — anders valt de browser terug op
  // zijn standaardpapier en past hij de pagina passend, wat net niet uitkomt.
  pageStyle.textContent = a6mode
    ? `@page { size: ${p.w}mm ${p.h}mm; margin: 0; }`
    : '@page { size: A4 portrait; margin: 9mm; }';
  showCardSize();
}
function setPaper(p) {
  paper = PAPERS[p] ? p : 'a4';
  localStorage.setItem('spc.paper', paper);
  applyPaper();
  // andere kaartmaat = andere indeling van de overzichtskaart
  if (opts.index && $('#cards').querySelector('.card')) { build(); return; }
  buildSheets();
  fitA6();
}
$('#sheetPaper').addEventListener('change', e => setPaper(e.target.value));

/* Veiligheidsmarge: de rand die de printer niet kan bedrukken. Alles daarbinnen is
   kaart, dus een kleinere marge = grotere kaarten en grotere tekst. */
function setSheetMargin(mm) {
  const n = Number(mm);
  mm = Number.isFinite(n) ? Math.min(20, Math.max(0, n)) : 4;   // 0 mm is geldig: randloos
  document.documentElement.style.setProperty('--sheet-margin', mm + 'mm');
  localStorage.setItem('spc.margin', String(mm));
  showCardSize();
  fitA6();
}
/* Wat een kaart met de huidige papier- en margekeuze wordt: op een A4-snijvel een
   kwart vel, op klein papier het hele vel — beide minus de marge. */
function showCardSize() {
  const mm = Number($('#sheetMargin').value) || 0;
  const dec = x => String(Math.round(x * 10) / 10).replace('.', LANG === 'nl' ? ',' : '.');
  const p = PAPERS[paper];
  const [w, h] = p.per === 1 ? [p.w - 2 * mm, p.h - 2 * mm] : [(p.w - 2 * mm) / 2, (p.h - 2 * mm) / 2];
  $('#marginNote').textContent = T.cardSize(dec(w), dec(h));
}
$('#sheetMargin').addEventListener('change', e => setSheetMargin(e.target.value));

for (const [id, key] of [['optHigher', 'higher'], ['optMaterial', 'material'], ['optFacts', 'facts'], ['optIndex', 'index']]) {
  const saved = localStorage.getItem('spc.' + id);
  if (saved !== null) opts[key] = saved === '1';
  $('#' + id).checked = opts[key];
  $('#' + id).addEventListener('change', e => {
    opts[key] = e.target.checked;
    localStorage.setItem('spc.' + id, e.target.checked ? '1' : '0');
    build();
  });
}

$('#optFill').checked = fillOn;
$('#optFill').addEventListener('change', e => {
  fillOn = e.target.checked;
  localStorage.setItem('spc.fill', fillOn ? '1' : '0');
  fitA6();
});

$('#optCont').checked = contOn;
$('#optCont').addEventListener('change', e => {
  contOn = e.target.checked;
  localStorage.setItem('spc.cont', contOn ? '1' : '0');
  fitA6();
});

/* achterkanten */
$('#optBacks').checked = backOpts.on;
$('#backPanel').hidden = !backOpts.on;
$('#backBorder').value = backOpts.border;
$('#backColor').value = backOpts.color;
$('#backColor2').value = backOpts.color2;
$('#backPattern').value = backOpts.pattern;
$('#optBacks').addEventListener('change', e => {
  backOpts.on = e.target.checked;
  localStorage.setItem('spc.backs', backOpts.on ? '1' : '0');
  $('#backPanel').hidden = !backOpts.on;
  buildSheets(); fitA6();
});
for (const [id, key, store] of [['#backBorder', 'border', 'spc.backBorder'],
  ['#backColor', 'color', 'spc.backColor'], ['#backColor2', 'color2', 'spc.backColor2']]) {
  $(id).addEventListener('input', e => {
    backOpts[key] = e.target.value;
    localStorage.setItem(store, e.target.value);
    refreshBacks();
  });
}
$('#backPattern').addEventListener('change', e => {
  backOpts.pattern = e.target.value;
  localStorage.setItem('spc.backPattern', backOpts.pattern);
  refreshBacks();
});
$('#backImage').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    backOpts.image = reader.result;      // alleen deze sessie; niet in localStorage
    $('#imgScaleRow').hidden = false;
    refreshBacks();
  };
  reader.readAsDataURL(file);
});
$('#backScale').addEventListener('input', e => {
  backOpts.scale = +e.target.value;
  $('#backScaleVal').textContent = backOpts.scale + '%';
  refreshBacks();
});
$('#backTile').addEventListener('change', e => { backOpts.tile = e.target.checked; refreshBacks(); });
$('#btnBackImgClear').addEventListener('click', () => {
  backOpts.image = null;
  $('#backImage').value = '';
  $('#imgScaleRow').hidden = true;
  refreshBacks();
});

/* ---------- taal ---------- */
function applyLang() {
  T = STR[LANG];
  document.documentElement.lang = LANG;
  $('#langNL').classList.toggle('active', LANG === 'nl');
  $('#langEN').classList.toggle('active', LANG === 'en');
  const text = {
    '#tagline': T.tagline, '#tabPick': T.tabPick, '#tabPaste': T.tabPaste, '#tabOwn': T.tabOwn,
    '#lblOName': T.lblOName, '#lblOLevel': T.lblOLevel, '#lblOSchool': T.lblOSchool,
    '#lblOClasses': T.lblOClasses, '#lblOTime': T.lblOTime, '#lblORange': T.lblORange,
    '#lblOComps': T.lblOComps, '#lblODur': T.lblODur, '#lblOMat': T.lblOMat,
    '#lblOConc': T.lblOConc, '#lblORitual': T.lblORitual,
    '#lblODesc': T.lblODesc, '#lblOHigher': T.lblOHigher,
    '#btnOSave': T.btnOSave, '#btnONew': T.btnONew, '#btnODel': T.btnODel,
    '#btnOExport': T.btnOExport, '#btnOImport': T.btnOImport, '#ownHint': T.ownHint,
    '#lblSearch': T.lblSearch, '#lblClass': T.lblClass, '#lblSort': T.lblSort, '#lblLevel': T.lblLevel,
    '#lblFConc': T.lblFConc, '#lblFRitual': T.lblFRitual,
    '#btnSelAll': T.selAll, '#btnSelNone': T.selNone,
    '#panelLabel': T.panelLabel, '#btnParse': T.btnParse, '#btnSample': T.btnSample,
    '#optionsLegend': T.optionsLegend, '#formatLabel': T.formatLabel,
    '#sizeL': T.sizeL, '#sizeS': T.sizeS, '#sizeA6': T.sizeA6, '#lblMargin': T.lblMargin,
    '#lblPaper': T.lblPaper,
    '#lblHigher': T.lblHigher, '#lblMaterial': T.lblMaterial, '#lblFacts': T.lblFacts,
    '#lblIndex': T.lblIndex, '#lblFill': T.lblFill, '#lblCont': T.lblCont, '#lblBacks': T.lblBacks,
    '#lblBackBorder': T.lblBackBorder, '#lblBackColor': T.lblBackColor, '#lblBackColor2': T.lblBackColor2,
    '#lblBackPattern': T.lblBackPattern, '#lblBackImage': T.lblBackImage,
    '#lblBackScale': T.lblBackScale, '#lblBackTile': T.lblBackTile,
    '#hintExclude': T.hintExclude,
  };
  for (const [sel, val] of Object.entries(text)) { const el = $(sel); if (el) el.textContent = val; }
  const html = { '#a6Hint': T.a6Hint, '#contHint': T.contHint, '#backsHint': T.backsHint,
    '#credits': T.credits, '#pasteHint': T.pasteHint };
  for (const [sel, val] of Object.entries(html)) { const el = $(sel); if (el) el.innerHTML = val; }
  $('#btnPrint').innerHTML = `🖨<span class="btn-txt">${esc(T.print)}</span>`;
  $('#cards').dataset.empty = T.empty;
  for (const [sel, map] of [['#sheetPaper', T.paperOpts], ['#sheetMargin', T.marginOpts]]) {
    for (const o of $(sel).options) if (map[o.value]) o.textContent = map[o.value];
  }
  fillSelects();
  setSheetMargin($('#sheetMargin').value);
  renderOwnList();
  renderPicker();
  build();
}
function setLang(l) {
  LANG = l;
  localStorage.setItem('spc.lang', l);
  applyLang();
}
$('#langNL').addEventListener('click', () => setLang('nl'));
$('#langEN').addEventListener('click', () => setLang('en'));

/* ---------- start ---------- */
$('#dataVersion').textContent = `SRD · ${SPELLS.length} spells · ${D.version}`;
$('#listInput').value = localStorage.getItem('spc.list') || '';
setTab(localStorage.getItem('spc.tab') || 'pick');
const params = new URLSearchParams(location.search);
if (params.get('paper')) setPaper(params.get('paper'));
if (params.get('cont')) { contOn = params.get('cont') === '1'; $('#optCont').checked = contOn; }
setSize(params.get('size') || localStorage.getItem('spc.size') || 'l');
$('#sheetMargin').value = params.get('margin') || localStorage.getItem('spc.margin') || '4';
applyLang();

// diepe link: ?spells=fireball,shield  of  ?class=Wizard&level=0-3 (+ &size=a6)
if (params.get('spells')) {
  SEL.clear();
  for (const part of params.get('spells').split(',')) {
    const s = bySlug.get(slug(part)) || byId.get(part.trim());
    if (s) SEL.add(s.id);
  }
  saveSel(); renderPicker(); build();
} else if (params.get('class')) {
  const cls = D.classes.find(c => slug(c) === slug(params.get('class')));
  if (cls) {
    filters.cls = cls;
    const range = (params.get('level') || '0-9').split('-').map(Number);
    filters.min = range[0] || 0;
    filters.max = range.length > 1 ? range[1] : filters.min;
    fillSelects();
    for (const s of visibleSpells()) SEL.add(s.id);
    saveSel(); renderPicker(); build();
  }
}
})();
