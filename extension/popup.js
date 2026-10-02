const DEFAULTS = {
  enabled: true,
  lineColor: "#ffd700",
  accentColor: "#b8860b",
  words: "",
  learned: []
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
  $("lineColor").value = s.lineColor;
  $("accentColor").value = s.accentColor;
  $("words").value = s.words;

  const list = $("learned");
  list.innerHTML = "";
  s.learned.forEach((item, i) => {
    const li = document.createElement("li");
    li.textContent = (item.label || "(no text)") + " ✦";
    const del = document.createElement("button");
    del.textContent = "Remove";
    del.onclick = () => save({ learned: s.learned.filter((_, j) => j !== i) });
    li.appendChild(del);
    list.appendChild(li);
  });
  $("noLearned").style.display = s.learned.length ? "none" : "block";
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
$("lineColor").oninput = (e) => save({ lineColor: e.target.value });
$("accentColor").oninput = (e) => save({ accentColor: e.target.value });
$("words").onchange = (e) => save({ words: e.target.value });
$("reset").onclick = () => save({ lineColor: DEFAULTS.lineColor, accentColor: DEFAULTS.accentColor });

$("pick").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: "startPick" }, () => {
    if (chrome.runtime.lastError) {
      alert("Reload the page first, then try again.");
      return;
    }
    window.close();
  });
};

chrome.storage.sync.get(DEFAULTS, render);
chrome.storage.onChanged.addListener(() => chrome.storage.sync.get(DEFAULTS, render));
