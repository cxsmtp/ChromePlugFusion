// Background service worker:
// - shows how many lines/buttons are lit on the toolbar icon (summed over frames),
// - toggles highlighting with the keyboard shortcut (Alt+Shift+G by default),
// - on install/update, brings already-open tabs up to date without a reload.

const DEFAULTS = {
  enabled: true,
  animate: true,
  speed: 2.4,
  lineColor: "#ffd700",
  accentColor: "#b8860b",
  words: ""
};
const CONTENT_FILES = ["sparkle-shape.js", "styles.js", "content.js"];
const ignore = () => {};

// tabId -> Map(frameId -> count)
const counts = new Map();

function showCount(tabId) {
  const frames = counts.get(tabId);
  const total = frames ? [...frames.values()].reduce((a, b) => a + b, 0) : 0;
  // The tab may have closed meanwhile; that's fine.
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#b8860b" }).catch(ignore);
  chrome.action.setBadgeTextColor?.({ tabId, color: "#ffffff" })?.catch(ignore);
  chrome.action.setBadgeText({ tabId, text: total ? String(total) : "" }).catch(ignore);
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "count" || !sender.tab) return;
  const tabId = sender.tab.id;
  if (!counts.has(tabId)) counts.set(tabId, new Map());
  counts.get(tabId).set(sender.frameId ?? 0, Number(msg.count) || 0);
  showCount(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => counts.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") counts.delete(tabId);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-highlighting") return;
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await chrome.storage.local.set({ enabled: !enabled });
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install" && reason !== "update") return;

  // Settings used to live in storage.sync; carry them over once.
  const local = await chrome.storage.local.get(null);
  if (!Object.keys(local).some((k) => k in DEFAULTS)) {
    const synced = await chrome.storage.sync.get(DEFAULTS).catch(() => DEFAULTS);
    await chrome.storage.local.set(synced);
  }

  // Inject the new version into open tabs, so no reload is needed.
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id, allFrames: true }, files: CONTENT_FILES })
      .catch(ignore); // e.g. the Chrome Web Store or a tab still loading
  }
});
