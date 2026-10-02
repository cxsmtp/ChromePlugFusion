# Badge Line Highlighter (Chrome extension)

Highlights things on any web page the moment a sparkle icon (✦) appears, for example the
`SAST ✦` chip and the **Triage with AI** / **Remediate with AI** buttons in Checkmarx One.

| What appears on the page | What the extension does |
| --- | --- |
| A bordered badge with the icon and any word, inside a table row / list item (`SAST ✦`, `SCA ✦`, …) | Highlights the **whole row** in gold |
| A button with the icon (`✦ Triage with AI`, `✦ Remediate with AI`) | Fills the **button** with gold |
| The icon anywhere else (`✦ Proposed Not Exploitable`, State column) | Makes the **icon glow** |
| A badge without the icon (plain `SAST`, `Critical`, `Triage →`) | Nothing |

New rows are detected live (`MutationObserver`), including in virtualized tables that reuse rows.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.
3. Reload the page you want to use it on. That's it: highlighting is automatic.

## How the icon is recognised (no setup)

Nothing to pick or configure. An icon counts as the sparkle when it is:

- a sparkle character (✦ ✧ ✨ …), or
- an icon named like one (`sparkle`, `auto_awesome`, `ai`, …), or
- an SVG whose **outline is a four-pointed star**: long sharp points up/down/left/right with
  pinched sides between them (`extension/sparkle-shape.js`). This is what catches unnamed icons
  such as Checkmarx's. A `+`, `×`, shield, circle, 5-point star, logo, chevron, etc. don't match.

## Options (toolbar popup)

- **Line colour / Border colour**: gold by default; pick any colour or use a preset swatch.
- **Only words**: e.g. `SAST, SCA` to restrict which badges highlight rows (empty = any word).
- **Enabled**: turn highlighting on or off.
- The toolbar icon shows how many lines/buttons are highlighted on the current tab.

## Try it

Open `demo/index.html` (allow file URLs for the extension in `chrome://extensions` → Details).
The `SAST ✦` rows turn gold straight away, and a new row is added every 3 seconds.
