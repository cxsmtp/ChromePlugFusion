// Shows how many lines are highlighted on the toolbar icon.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== "count" || !sender.tab) return;
  chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#b8860b" });
  chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.count ? String(msg.count) : "" });
});
