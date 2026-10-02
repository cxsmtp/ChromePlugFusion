// Highlight styles. Kept in JS (not content.css) because they must also be added
// inside every shadow root: page sections like Checkmarx's micro-frontends live in
// Shadow DOM, where document-level CSS doesn't reach.

// eslint-disable-next-line no-unused-vars
const cpfStyles = `
/* Lets the light run around button borders (registration is document-wide). */
@property --cpf-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

/* ---- Lines: gold, with a bright laser streak sweeping along them ----
   background-attachment: fixed puts every cell on one shared, viewport-sized
   canvas, so the streak runs continuously across all the cells of a row. */
.cpf-hl-line,
.cpf-hl-line > td,
.cpf-hl-line > th,
.cpf-hl-line > [role="gridcell"],
.cpf-hl-line > [role="cell"] {
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
  animation: cpf-laser var(--cpf-speed, 2.2s) linear infinite !important;
  animation-play-state: var(--cpf-play, running) !important;
}

.cpf-hl-line > td:first-child,
.cpf-hl-line > [role="gridcell"]:first-child,
.cpf-hl-line > [role="cell"]:first-child,
.cpf-hl-line:not(tr):not([role="row"]) {
  box-shadow: inset 4px 0 0 var(--cpf-accent, #b8860b) !important;
}

@keyframes cpf-laser {
  from { background-position: -30vw 0; }
  to   { background-position: 100vw 0; }
}

/* The badge that triggered the line (e.g. "SAST ✦"). */
.cpf-hl-badge:not(.cpf-hl-button) {
  outline: 2px solid var(--cpf-accent, #b8860b) !important;
  outline-offset: 1px !important;
  box-shadow: 0 0 8px 2px var(--cpf-line-bg, #ffd700) !important;
}

/* ---- Buttons ("Triage with AI", "Remediate with AI"): gold, with a light
   running round and round the border ---- */
.cpf-hl-button {
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
  animation: cpf-orbit var(--cpf-speed, 2.2s) linear infinite !important;
  animation-play-state: var(--cpf-play, running) !important;
}

.cpf-hl-button * {
  color: #3d2e00 !important;
}

@keyframes cpf-orbit {
  to { --cpf-angle: 360deg; }
}

/* ---- Every sparkle icon glows ---- */
.cpf-hl-icon {
  color: var(--cpf-accent, #b8860b) !important;
  animation: cpf-glow 1.2s ease-in-out infinite alternate !important;
  animation-play-state: var(--cpf-play, running) !important;
}

@keyframes cpf-glow {
  from { filter: drop-shadow(0 0 1px var(--cpf-line-bg, #ffd700)); }
  to   { filter: drop-shadow(0 0 4px var(--cpf-line-bg, #ffd700)) drop-shadow(0 0 8px var(--cpf-line-bg, #ffd700)); }
}
`;
