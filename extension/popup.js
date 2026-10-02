const DEFAULTS = {
  enabled: true,
  animate: true,
  lineColor: "#ffd700",
  accentColor: "#b8860b",
  words: ""
};

// [line colour, border colour]
const PRESETS = [
  ["#ffd700", "#b8860b"], // gold
  ["#fff3b0", "#d4a017"], // light gold
  ["#c8f7c5", "#2da44e"], // green
  ["#cde4ff", "#0969da"], // blue
  ["#ffd6d6", "#d1242f"], // red
  ["#ead7ff", "#8250df"]  // purple
];

const $ = (id) => document.getElementById(id);
const save = (patch) => chrome.storage.sync.set(patch);

function render(s) {
  $("enabled").checked = s.enabled;
  $("animate").checked = s.animate;
  $("lineColor").value = s.lineColor;
  $("accentColor").value = s.accentColor;
  $("words").value = s.words;
}

PRESETS.forEach(([line, accent]) => {
  const sw = document.createElement("div");
  sw.className = "swatch";
  sw.style.background = line;
  sw.title = line;
  sw.onclick = () => save({ lineColor: line, accentColor: accent });
  $("presets").appendChild(sw);
});

$("enabled").onchange = (e) => save({ enabled: e.target.checked });
$("animate").onchange = (e) => save({ animate: e.target.checked });
$("lineColor").oninput = (e) => save({ lineColor: e.target.value });
$("accentColor").oninput = (e) => save({ accentColor: e.target.value });
$("words").onchange = (e) => save({ words: e.target.value });
$("reset").onclick = () => save({ lineColor: DEFAULTS.lineColor, accentColor: DEFAULTS.accentColor });

chrome.storage.sync.get(DEFAULTS, render);
chrome.storage.onChanged.addListener(() => chrome.storage.sync.get(DEFAULTS, render));
