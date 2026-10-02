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
3. Reload the page you want to use it on.

## Teach it your icon (do this once)

The built-in detection recognises sparkle characters (✦ ✨ …) and icons named *sparkle* / *stars* / *ai*.
If a site uses an unnamed SVG (as Checkmarx does):

1. Click the extension's toolbar icon, then click **Pick a badge on this page**.
2. Click one `SAST ✦` chip.

The icon is saved, and every badge, button and spot using that same icon is matched on every site,
whatever the word next to it. Learned icons are listed in the popup and can be removed there.

## Options (toolbar popup)

- **Line colour / Border colour**: gold by default; pick any colour or use a preset swatch.
- **Only words**: e.g. `SAST, SCA` to restrict which badges highlight rows (empty = any word).
- **Enabled**: turn highlighting on or off.
- The toolbar icon shows how many lines/buttons are highlighted on the current tab.

## Try it

Open `demo/index.html` (allow file URLs for the extension in `chrome://extensions` → Details), then use
**Pick a badge** on a `SAST ✦` chip. A new row is added every 3 seconds.
