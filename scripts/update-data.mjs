#!/usr/bin/env node
/* Haalt de D&D 5e SRD-spreuken op en compileert ze naar data/spells.js.
 *
 * Bron: 5e-bits/5e-database — de dataset achter dnd5eapi.co. Dat is de officiële
 * SRD 5.1-inhoud onder de OGL, dus vrij te gebruiken; hij is bovendien netjes
 * gestructureerd (losse alinea's, materiaalcomponent apart, schade per slotniveau,
 * redding, effectgebied) en dat is precies wat een mooie kaart nodig heeft.
 *
 * De ruwe download blijft in data/srd/ staan (gitignored) zodat --offline opnieuw
 * kan compileren zonder netwerk; het gecompileerde data/spells.js gaat wél mee in
 * git en is daarmee de fallback als de download een keer faalt.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'data', 'srd');
const RAW_FILE = join(RAW_DIR, '5e-SRD-Spells.json');
const OUT_FILE = join(ROOT, 'data', 'spells.js');
const SRC_URL = 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/5e-SRD-Spells.json';

const OFFLINE = process.argv.includes('--offline');

/* ---------------------------------------------------------------------------
 * Overlay op de SRD
 *
 * De SRD is de basis, maar mist twee dingen die aan de tafel wél gelden. Beide
 * staan hier expliciet in plaats van in de data, zodat een verse download ze niet
 * wegpoetst en meteen zichtbaar is wat er is toegevoegd.
 * ------------------------------------------------------------------------- */

/* De Artificer staat niet in de SRD (hij komt uit Tasha's), maar zijn spreukenlijst
 * bestaat vrijwel volledig uit SRD-spreuken. Deze lijst is dezelfde die de
 * dnd-spellbook-app gebruikt, zodat beide apps dezelfde klassenindeling tonen. */
const ARTIFICER_SPELLS = [
  'Acid Splash', 'Aid', 'Alarm', 'Alter Self', 'Animate Objects', 'Arcane Eye', 'Arcane Lock',
  'Blink', 'Blur', 'Continual Flame', 'Create Food and Water', 'Creation', 'Cure Wounds',
  'Dancing Lights', 'Darkvision', 'Detect Magic', 'Disguise Self', 'Dispel Magic',
  'Enhance Ability', 'Enlarge/Reduce', 'Expeditious Retreat', 'Fabricate', 'Faerie Fire',
  'False Life', 'Feather Fall', 'Fire Bolt', 'Fly', 'Freedom of Movement', 'Glyph of Warding',
  'Grease', 'Greater Restoration', 'Guidance', 'Haste', 'Heat Metal', 'Identify', 'Invisibility',
  'Jump', 'Lesser Restoration', 'Levitate', 'Light', 'Longstrider', 'Mage Hand', 'Magic Mouth',
  'Magic Weapon', 'Mending', 'Message', 'Poison Spray', 'Prestidigitation',
  'Protection from Energy', 'Protection from Poison', 'Purify Food and Drink', 'Ray of Frost',
  'Resistance', 'Revivify', 'Rope Trick', 'Sanctuary', 'See Invisibility', 'Shocking Grasp',
  'Spare the Dying', 'Spider Climb', 'Stone Shape', 'Stoneskin', 'Wall of Stone',
  'Water Breathing', 'Water Walk', 'Web',
];

/* Wrathful Smite hoort bij de smite-reeks van de paladin maar ontbreekt in de
 * 5e-bits-export; hier in dezelfde vorm aangevuld. */
const EXTRA_SPELLS = [{
  index: 'wrathful-smite',
  name: 'Wrathful Smite',
  level: 1,
  school: { name: 'Evocation' },
  casting_time: '1 bonus action',
  range: 'Self',
  components: ['V'],
  duration: 'Concentration, up to 1 minute',
  concentration: true,
  ritual: false,
  desc: [
    "The next time you hit with a melee weapon attack during this spell's duration, your attack deals an extra 1d6 psychic damage. Additionally, if the target is a creature, it must make a Wisdom saving throw or be frightened of you until the spell ends. As an action, the creature can make a Wisdom check against your spell save DC to steel its resolve and end this spell.",
  ],
  higher_level: [],
  classes: [{ name: 'Paladin' }],
  subclasses: [],
  damage: { damage_type: { name: 'Psychic' }, damage_at_slot_level: { 1: '1d6' } },
  dc: { dc_type: { name: 'WIS' }, dc_success: 'none' },
}];

/* ------------------------------------------------------------------------- */

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function download() {
  process.stdout.write(`Downloaden: ${SRC_URL}\n`);
  const res = await fetch(SRC_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} bij ${SRC_URL}`);
  const text = await res.text();
  JSON.parse(text);                       // vroeg falen is beter dan halve data wegschrijven
  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(RAW_FILE, text);
  return text;
}

async function loadRaw() {
  if (!OFFLINE) {
    try {
      return await download();
    } catch (err) {
      if (!existsSync(RAW_FILE)) throw err;
      process.stdout.write(`Download mislukt (${err.message}) — cache in data/srd/ wordt gebruikt.\n`);
    }
  }
  if (!existsSync(RAW_FILE)) throw new Error('Geen cache in data/srd/; draai eerst zonder --offline.');
  return readFile(RAW_FILE, 'utf8');
}

/* Eén SRD-spreuk → het compacte kaartformaat. Alleen velden die de kaart of een
 * filter echt gebruikt; lege velden worden weggelaten zodat data/spells.js klein blijft. */
function compileSpell(s) {
  const out = {
    id: s.index,
    name: s.name,
    lvl: s.level,
    school: (s.school && s.school.name) || '',
    time: s.casting_time,
    range: s.range,
    comps: s.components || [],
    dur: s.duration,
    desc: s.desc || [],
    classes: (s.classes || []).map((c) => c.name).sort(),
  };
  if (s.material) out.mat = s.material;
  if (s.concentration) out.conc = 1;
  if (s.ritual) out.ritual = 1;
  if (s.higher_level && s.higher_level.length) out.higher = s.higher_level;
  if (s.subclasses && s.subclasses.length) out.subs = s.subclasses.map((c) => c.name).sort();
  if (s.attack_type) out.atk = s.attack_type;
  if (s.damage) {
    out.dmg = {};
    if (s.damage.damage_type) out.dmg.t = s.damage.damage_type.name;
    if (s.damage.damage_at_slot_level) out.dmg.slot = s.damage.damage_at_slot_level;
    if (s.damage.damage_at_character_level) out.dmg.char = s.damage.damage_at_character_level;
  }
  if (s.heal_at_slot_level) out.heal = s.heal_at_slot_level;
  if (s.dc) out.dc = { t: (s.dc.dc_type && s.dc.dc_type.name) || '', s: s.dc.dc_success || '' };
  if (s.area_of_effect) out.aoe = { t: s.area_of_effect.type, s: s.area_of_effect.size };
  return out;
}

async function main() {
  const raw = JSON.parse(await loadRaw());
  const bySlug = new Map();
  for (const s of [...raw, ...EXTRA_SPELLS]) bySlug.set(norm(s.name), compileSpell(s));

  // Artificer erbij; onbekende namen zijn een fout in de lijst hierboven, niet in de data
  const missing = [];
  for (const name of ARTIFICER_SPELLS) {
    const spell = bySlug.get(norm(name));
    if (!spell) { missing.push(name); continue; }
    if (!spell.classes.includes('Artificer')) spell.classes = ['Artificer', ...spell.classes].sort();
  }
  if (missing.length) process.stdout.write(`Let op — artificer-spreuk niet gevonden: ${missing.join(', ')}\n`);

  const spells = [...bySlug.values()].sort((a, b) => a.lvl - b.lvl || a.name.localeCompare(b.name));
  const classes = [...new Set(spells.flatMap((s) => s.classes))].sort();
  const schools = [...new Set(spells.map((s) => s.school))].sort();

  const payload = {
    version: new Date().toISOString().slice(0, 10),
    source: 'SRD 5.1 (OGL) via 5e-bits/5e-database',
    classes,
    schools,
    spells,
  };
  const js = `/* Gegenereerd door scripts/update-data.mjs — niet met de hand bewerken.\n`
    + `   Bron: ${payload.source}. ${spells.length} spreuken, ${classes.length} klassen. */\n`
    + `window.SPC_DATA = ${JSON.stringify(payload)};\n`;
  await writeFile(OUT_FILE, js);

  process.stdout.write(`Klaar: ${spells.length} spreuken, ${classes.length} klassen, ${schools.length} scholen `
    + `→ data/spells.js (${(js.length / 1024).toFixed(0)} kB)\n`);
}

main().catch((err) => { process.stderr.write(`FOUT: ${err.stack || err.message}\n`); process.exit(1); });
