# Grimoire Forge — printbare D&D-spreukkaarten

Kies je spreuken, krijg printbare kaarten. Volledig lokaal: geen build, geen server,
geen account — `index.html` openen is genoeg. Zelfde opzet als
[Warscroll Forge](../warscroll-forge), maar dan voor D&D 5e.

Vergelijkbaar met [spellcards.app](https://spellcards.app), met als verschil dat de
kaarten hier écht opgemaakt zijn: schoolkleuren, iconen, een statbalk, een balk met
schade/redding/effectgebied, en kaarten die zich zelf passend schalen op A6.

## Gebruiken

Dubbelklik `index.html`. Of, met een lokale server (handig voor de deep links):

```bash
npm run serve
```

Drie manieren om spreuken te kiezen:

| Tab | Waarvoor |
|---|---|
| **✶ Kiezen** | Filteren op klasse, niveau, school, concentratie/ritueel + zoeken door naam én spreuktekst. "Alles kiezen" pakt alles wat door de filters komt. |
| **📜 Plakken** | Een lijst spreuknamen plakken (uit D&D Beyond, een spelersboek, een chat). Tikfouten, bulletpunten, nummering en "(3rd level)" erachter worden opgevangen. |
| **✎ Eigen** | Eigen spreuken toevoegen — voor wat er niet in de SRD staat. Blijven lokaal bewaard, met export/import als JSON. |

### Deep links

- `?spells=fireball,shield,magic-missile` — precies deze kaarten
- `?class=Wizard&level=0-3` — alle wizardspreuken tot en met niveau 3
- `&size=a6` / `&size=s` / `&size=l`, `&paper=a4|a6|10x15`, `&margin=4` en `&cont=1` — formaat,
  papier, printmarge en vervolgkaarten meegeven
- `?lang=en` — Engelse interface

## Printen

Drie formaten:

- **Groot** — één kolom, om als naslag te lezen
- **Compact** — twee kolommen
- **A6-kaarten** — kaarten van vast formaat, elke kaart even groot

In A6-modus schaalt elke kaart zijn inhoud passend: lange spreuken krimpen (en gaan
zo nodig naar twee kolommen), korte spreuken worden juist uitvergroot tot de kaart vol
staat. Past een spreuk alleen door hem sterk te verkleinen, dan kan de rest doorlopen
op de achterkant.

**Papier** (alleen in A6-modus):

- **A4** — 4 kaarten op een 2×2-snijvel, kaart 101 × 144,5 mm bij 4 mm marge
- **A6** — 1 kaart per vel van 105 × 148 mm, niets te snijden
- **10 × 15 cm** — 1 kaart per vel fotopapier (100 × 150 mm)

10 × 15 cm is nét geen A6, dus zet in het printvenster **hetzelfde papierformaat** als
hier: wijkt het af, dan maakt de browser de pagina passend en klopt de kaartmaat niet
meer. Verder: **pagina's per blad: 1**, schaal **100%** — niet "passend maken" —
marges **Geen**, en **kop- en voettekst uit**, anders drukt de browser datum en URL
op het vel.

De printmarge is de rand die je printer niet kan bedrukken; alles daarbinnen is kaart,
dus een kleinere marge geeft grotere kaarten en grotere tekst. Let op dat die marge bij
één kaart per vel van élke kaart afgaat (bij 3 mm wordt een kaart 99 × 142 mm op A6 en
94 × 144 mm op 10 × 15), terwijl hij op het A4-snijvel over vier kaarten wordt verdeeld.
Print je printer randloos, kies dan 0 mm voor het volledige vel.

Klik op een kaartkop om die kaart over te slaan: hij verdwijnt uit de printopdracht en
gaat naar de lade onder de vellen, zodat er geen halflege vellen ontstaan.

### Achterkanten

In A6-modus kun je achterkanten aanzetten: achter elk vel komt een achterpagina — op het
A4-snijvel gespiegeld (zodat elke achterkant achter zijn eigen voorkant valt), bij één
kaart per vel gewoon de volgende pagina. Zodra er érgens iets op een achterkant staat,
krijgt elk vel er een, desnoods leeg; anders verschuift de voor/achter-afwisseling. Kies een motief in twee kleuren en/of een eigen
afbeelding. Print dubbelzijdig, omslaan over de **lange zijde**. (Een geüploade
afbeelding blijft alleen deze sessie bewaard.)

## Data

Spreukdata komt uit de **SRD 5.1** (OGL) via
[5e-bits/5e-database](https://github.com/5e-bits/5e-database) — dezelfde dataset als
dnd5eapi.co. Bijwerken:

```bash
npm run update-data
```

Dat downloadt de bron naar `data/srd/` (gitignored) en compileert `data/spells.js`
(wél in git, als fallback). `npm run compile-data` doet hetzelfde zonder netwerk.

Bovenop de SRD zet het script twee dingen die aan tafel wél gelden en in de bron
ontbreken: de **Artificer**-spreukenlijst (uit Tasha's; dezelfde lijst die de
[dnd-spellbook](../dnd-spellbook)-app gebruikt) en **Wrathful Smite**. Samen 320
spreuken, 9 klassen.

**Let op:** de SRD is niet het hele spelersboek. Hex, Chromatic Orb, Dissonant
Whispers, Ensnaring Strike en Searing Smite ontbreken bijvoorbeeld — die tekst valt
niet onder de open licentie. Voeg ze zelf toe op de tab **Eigen**; ze komen daarna
gewoon tussen de rest te staan.

Spreuken die het spelersboek naar een tovenaar vernoemt, heten in de SRD anders
(*Bigby's Hand* → *Arcane Hand*, *Leomund's Tiny Hut* → *Tiny Hut*). Bij het plakken
worden die namen automatisch omgezet.

## Structuur

```
index.html            interface
css/styles.css        opmaak, kaartontwerp, A6-vellen, printregels
js/app.js             filters, matching, kaart-rendering, vellen, achterkanten
data/spells.js        gecompileerde spreukdata (gegenereerd)
scripts/update-data.mjs  download + compileer
```

Geen dependencies; `npm ci` is niet nodig om de app te draaien.
