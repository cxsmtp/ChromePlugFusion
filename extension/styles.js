// Highlight styles. Kept in JS (not a .css file) because they are also added
// inside every shadow root: page sections like Checkmarx's micro-frontends live
// in Shadow DOM, where document-level CSS doesn't reach.
//
// Selectors use data-cpf-* attributes (frameworks rewrite `class`, not these),
// repeated for extra specificity so the gold also wins over a page's own
// "selected row" / hover colours.

globalThis.cpfStyles = `
/* Lets the light run around button borders (registration is document-wide). */
@property --cpf-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

/* ---- Lines: gold, with a bright laser streak sweeping along them ----
   background-attachment: fixed puts every cell on one shared, viewport-sized
   canvas, so the streak runs continuously across all the cells of a row. */
[data-cpf-line][data-cpf-line][data-cpf-line],
[data-cpf-line][data-cpf-line] > td,
[data-cpf-line][data-cpf-line] > th,
[data-cpf-line][data-cpf-line] > [role="gridcell"],
[data-cpf-line][data-cpf-line] > [role="cell"] {
  background-color: var(--cpf-line-bg, #ffd700) !important;
  background-image: linear-gradient(100deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 248, 200, 0.35) 35%,
      rgba(255, 255, 255, 0.85) 47%,
      #ffffff 50%,
      rgba(255, 255, 255, 0.85) 53%,
      rgba(255, 248, 200, 0.35) 65%,
      rgba(255, 255, 255, 0) 100%) !important;
  background-size: 30vw 100vh !important;
  background-repeat: no-repeat !important;
  background-attachment: fixed !important;
  animation: cpf-laser var(--cpf-speed, 2.4s) linear infinite !important;
  animation-play-state: var(--cpf-play, running) !important;
  transition: background-color 0.25s ease !important;
}

/* Gold edge on the left of the line, and a fine gold rule underneath. */
[data-cpf-line][data-cpf-line] > td,
[data-cpf-line][data-cpf-line] > [role="gridcell"],
[data-cpf-line][data-cpf-line] > [role="cell"] {
  box-shadow: inset 0 -1px 0 var(--cpf-accent, #b8860b) !important;
}
[data-cpf-line][data-cpf-line] > td:first-child,
[data-cpf-line][data-cpf-line] > [role="gridcell"]:first-child,
[data-cpf-line][data-cpf-line] > [role="cell"]:first-child {
  box-shadow: inset 4px 0 0 var(--cpf-accent, #b8860b), inset 0 -1px 0 var(--cpf-accent, #b8860b) !important;
}
[data-cpf-line][data-cpf-line]:not(tr):not([role="row"]) {
  box-shadow: inset 4px 0 0 var(--cpf-accent, #b8860b) !important;
}

@keyframes cpf-laser {
  from { background-position: -30vw 0; }
  to   { background-position: 100vw 0; }
}

/* The badge that triggered the line (e.g. "SAST ✦"). */
[data-cpf-badge][data-cpf-badge] {
  outline: 2px solid var(--cpf-accent, #b8860b) !important;
  outline-offset: 1px !important;
  box-shadow: 0 0 8px 2px var(--cpf-line-bg, #ffd700) !important;
  border-radius: 4px;
}

/* ---- Buttons ("Triage with AI", "Remediate with AI"): gold, with a light
   running round and round the border ---- */
[data-cpf-button][data-cpf-button] {
  border: 2px solid transparent !important;
  background:
    linear-gradient(var(--cpf-line-bg, #ffd700), var(--cpf-line-bg, #ffd700)) padding-box,
    conic-gradient(from var(--cpf-angle),
      var(--cpf-accent, #b8860b) 0deg,
      #fffbe6 30deg,
      var(--cpf-line-bg, #ffd700) 60deg,
      var(--cpf-accent, #b8860b) 100deg,
      var(--cpf-accent, #b8860b) 360deg) border-box !important;
  color: #3d2e00 !important;
  box-shadow: 0 0 12px var(--cpf-line-bg, #ffd700) !important;
  animation: cpf-orbit var(--cpf-speed, 2.4s) linear infinite !important;
  animation-play-state: var(--cpf-play, running) !important;
}
[data-cpf-button][data-cpf-button] * {
  color: #3d2e00 !important;
}

@keyframes cpf-orbit {
  to { --cpf-angle: 360deg; }
}

/* ---- Every sparkle icon glows ---- */
[data-cpf-icon][data-cpf-icon] {
  color: var(--cpf-accent, #b8860b) !important;
  animation: cpf-glow 1.2s ease-in-out infinite alternate !important;
  animation-play-state: var(--cpf-play, running) !important;
}

@keyframes cpf-glow {
  from { filter: drop-shadow(0 0 1px var(--cpf-line-bg, #ffd700)); }
  to   { filter: drop-shadow(0 0 4px var(--cpf-line-bg, #ffd700)) drop-shadow(0 0 8px var(--cpf-line-bg, #ffd700)); }
}
`;
