# Sparkle Highlighter (Chrome extension)

Lights up everything that carries the ✦ sparkle (AI) icon, the moment it appears. Built for
Checkmarx One (`SAST ✦`, **Triage with AI**, **Remediate with AI**) and works on any site.

| What appears on the page | What the extension does |
| --- | --- |
| A badge with the icon inside a table row / list item (`SAST ✦`, `SCA ✦`, …) | Lights the **whole row** gold with a bright **laser streak** running along it |
| A button with the icon (`✦ Triage with AI`, `✦ Remediate with AI`) | Fills the **button** with gold, with a light **running round its border** |
| The icon anywhere else (`✦ Proposed Not Exploitable`, State column) | Makes the **icon glow** |
| No icon (plain `SAST`, `Critical`, `Triage →`) | Nothing |

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.

That's it: highlighting is automatic. Updates are applied to open tabs without reloading them.

## Popup & shortcut

- **Highlighting** on/off; also **Alt+Shift+G** anywhere (change it at `chrome://extensions/shortcuts`).
- **Running laser** on/off, and **laser speed**.
- **Colour** presets (gold by default) or custom line/edge colours.
- **Only words**: e.g. `SAST, SCA` to limit which badges light their row (empty = any word).
- Live count of lit lines/buttons on the current tab (also on the toolbar icon).

## How it works

**Recognising the icon (no setup).** An icon counts as the sparkle when it is a sparkle character
(✦ ✧ ✨ …), is named like one (`sparkle`, `auto_awesome`, Checkmarx's `data-el-id-icon="ai"`, …), or is
an SVG whose **outline is a four-pointed star** (`sparkle-shape.js`): long sharp points up/down/left/right
with pinched sides. A `+`, `×`, shield, circle, 5-point star, logo, chevron, etc. don't match.

**Shadow DOM.** Checkmarx One renders its results table and details panel inside shadow roots. The
extension discovers every open shadow root, watches it, and adopts its stylesheet there.

**Stability.**
- Marks are `data-cpf-*` attributes, not classes. Frameworks such as React rewrite `class` when you
  click, select or hover a row, which used to switch the highlight off.
- Every pass re-applies marks; only changed parts of the page are rescanned, and a cheap full pass
  every 4 s heals anything missed (rows recycled by virtual scrolling, marks stripped by the page).
- Settings are in `storage.local` and slider/colour changes are debounced (dragging a colour picker
  used to exceed Chrome's storage write quota).
- No forced page layouts: icon outlines are read from the SVG path data (not `getTotalLength()`), and
  passes run right after a frame is drawn. A forced layout can start the page's web-font downloads,
  and Chrome then lists any font failure (e.g. `Failed to decode downloaded font`) under this extension.
- After the extension is reloaded or updated, the old copy in a tab stops quietly and the new copy
  takes over; messaging and badge calls never throw on closed tabs.

## Try it

Open `demo/index.html` (allow file URLs for the extension in `chrome://extensions` → Details).
