const DEFAULTS = {
  enabled: true,
  animate: true,
  speed: 2.4,
  lineColor: "#ffd700",
  accentColor: "#b8860b",
  words: ""
};

// [name, line colour, edge colour]
const PRESETS = [
  ["Gold", "#ffd700", "#b8860b"],
  ["Soft gold", "#fff1a8", "#d4a017"],
  ["Amber", "#ffc46b", "#c46a00"],
  ["Green", "#c8f7c5", "#2da44e"],
  ["Blue", "#cde4ff", "#0969da"],
  ["Purple", "#ead7ff", "#8250df"]
];

const $ = (id) => document.getElementById(id);
const store = chrome.storage.local;

// Colour pickers and the slider fire continuously while dragging: save at most
// every 150 ms instead of on every movement.
const timers = {};
function save(patch, debounceMs = 0) {
  const key = Object.keys(patch).join();
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => store.set(patch), debounceMs);
}

function render(s) {
  $("enabled").checked = s.enabled;
  $("animate").checked = s.animate;
  $("speed").value = String(6 - s.speed); // slider: right = faster
  $("lineColor").value = s.lineColor;
  $("accentColor").value = s.accentColor;
  if (document.activeElement !== $("words")) $("words").value = s.words;
  document.body.classList.toggle("off", !s.enabled);
  document.body.classList.toggle("paused", !s.animate);
  document.querySelectorAll(".swatch").forEach((sw) => {
    sw.setAttribute("aria-pressed", String(sw.dataset.line === s.lineColor && sw.dataset.accent === s.accentColor));
  });
}

PRESETS.forEach(([name, line, accent]) => {
  const sw = document.createElement("button");
  sw.className = "swatch";
  sw.title = name;
  sw.dataset.line = line;
  sw.dataset.accent = accent;
  sw.style.background = `linear-gradient(135deg, ${line} 55%, ${accent} 55%)`;
  sw.onclick = () => save({ lineColor: line, accentColor: accent });
  $("presets").appendChild(sw);
});

$("enabled").onchange = (e) => save({ enabled: e.target.checked });
$("animate").onchange = (e) => save({ animate: e.target.checked });
$("speed").oninput = (e) => save({ speed: Math.round((6 - Number(e.target.value)) * 10) / 10 }, 150);
$("lineColor").oninput = (e) => save({ lineColor: e.target.value }, 150);
$("accentColor").oninput = (e) => save({ accentColor: e.target.value }, 150);
$("words").oninput = (e) => save({ words: e.target.value }, 400);
$("reset").onclick = () => save({ lineColor: DEFAULTS.lineColor, accentColor: DEFAULTS.accentColor, speed: DEFAULTS.speed });

// Live count for the current tab (the toolbar badge holds it).
async function refreshCount() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const text = tab ? await chrome.action.getBadgeText({ tabId: tab.id }) : "";
    const { enabled } = await store.get({ enabled: true });
    $("count").textContent = text || "0";
    $("statusText").textContent = enabled ? "lit on this page" : "highlighting is off";
  } catch (_) {
    /* popup closing */
  }
}

chrome.commands.getAll((cmds) => {
  const cmd = cmds.find((c) => c.name === "toggle-highlighting");
  $("shortcut").textContent = (cmd && cmd.shortcut) || "not set";
});

store.get(DEFAULTS, render);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") store.get(DEFAULTS, render);
});
refreshCount();
setInterval(refreshCount, 700);
