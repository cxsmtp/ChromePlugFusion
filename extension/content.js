// Badge Line Highlighter — content script.
// Watches the page and highlights the whole line as soon as a button/badge
// containing a word plus the target icon (e.g. "SAST ✦") appears.

(() => {
  const DEFAULTS = {
    enabled: true,
    lineColor: "#ffd700", // gold
    accentColor: "#b8860b", // dark gold
    words: "" // comma separated; empty = any word
  };

  const SPARKLE_CHARS = /[✦✧✨❇❈✱✲✳✴✶✷✸✹✺✻✼✽❋⁂✢✣✤✥]/;
  const SPARKLE_NAMES = /sparkl|auto-?awesome|magic|\bai\b|gen-?ai|copilot/i;
  const ICON_SELECTOR = "svg, img, i, [class*='icon' i], [data-icon]";
  const ROW_SELECTOR = "tr, [role='row'], li, [role='listitem'], [role='treeitem']";
  const MAX_BADGE_TEXT = 30;

  let settings = { ...DEFAULTS };
  let wordList = [];
  const highlighted = new Set(); // { line, badge } entries; line is null for gold buttons
  const glowing = new Set(); // icon elements with the glow effect
  let scanQueued = false;

  // ---------- helpers ----------

  const normText = (s) => (s || "").replace(/\s+/g, " ").trim();

  function iconDescriptor(icon) {
    if (icon.nodeType === Node.TEXT_NODE) return "";
    const parts = [
      icon.getAttribute("class"),
      icon.getAttribute("data-testid"),
      icon.getAttribute("aria-label"),
      icon.getAttribute("data-icon"),
      icon.getAttribute("alt"),
      icon.getAttribute("src")
    ];
    const title = icon.querySelector && icon.querySelector("title");
    if (title) parts.push(title.textContent);
    return parts.filter(Boolean).join(" ");
  }

  // Is this the sparkle icon? A ✦ character, an icon named like one, or an SVG
  // whose outline has the four-pointed sparkle shape (see sparkle-shape.js).
  function iconMatches(icon) {
    if (icon.nodeType === Node.TEXT_NODE) return SPARKLE_CHARS.test(icon.textContent);
    const tag = icon.tagName.toLowerCase();
    // isSparkle caches its verdict per outline, so recycled rows stay cheap.
    if (tag === "svg") return SPARKLE_NAMES.test(iconDescriptor(icon)) || cpfSparkleShape.isSparkle(icon);
    // A wrapper like <span class="chip-icon"><svg/></span>: the inner SVG decides.
    if (icon.querySelector("svg")) return false;
    return SPARKLE_NAMES.test(iconDescriptor(icon));
  }

  // The badge's visible word, with sparkle characters stripped out.
  function badgeWord(badge) {
    return normText(badge.textContent.replace(new RegExp(SPARKLE_CHARS.source, "g"), ""));
  }

  // A badge is a short word inside an element with a visible border, like the
  // "SAST ✦" chip. Borderless text + icon (e.g. "Confirmed ✦") is ignored.
  function isBadgeLike(el) {
    if (!(el instanceof Element)) return false;
    const text = badgeWord(el);
    if (!text || text.length > MAX_BADGE_TEXT || text.split(" ").length > 3) return false;
    const cs = getComputedStyle(el);
    const color = cs.borderTopColor;
    return (
      parseFloat(cs.borderTopWidth) > 0 &&
      cs.borderTopStyle !== "none" &&
      color !== "transparent" &&
      !/rgba\([^)]*,\s*0\)$/.test(color)
    );
  }

  function badgeHasMatchingIcon(badge) {
    for (const icon of iconCandidates(badge)) if (iconMatches(icon)) return true;
    return false;
  }

  // Walk up from an icon to the button/badge that holds both the icon and the word.
  function findBadge(icon) {
    let el = icon.nodeType === Node.TEXT_NODE ? icon.parentElement : icon;
    for (let depth = 0; el && depth < 5; depth++, el = el.parentElement) {
      const text = badgeWord(el);
      if (text.length > MAX_BADGE_TEXT) return null;
      if (text && isBadgeLike(el)) return el;
    }
    return null;
  }

  function wordAllowed(badge) {
    if (!wordList.length) return true;
    const word = badgeWord(badge).toLowerCase();
    return wordList.some((w) => word.includes(w));
  }

  // The "line" around the badge: a table row / list item, or the nearest wide block.
  function findLine(badge) {
    const row = badge.closest(ROW_SELECTOR);
    if (row) return row;
    const minWidth = document.documentElement.clientWidth * 0.5;
    let firstBlock = null;
    for (let el = badge.parentElement; el && el !== document.body; el = el.parentElement) {
      const display = getComputedStyle(el).display;
      if (display.startsWith("inline") || display === "contents") continue;
      firstBlock = firstBlock || el;
      if (el.offsetWidth >= minWidth) return el;
    }
    return firstBlock || badge.parentElement;
  }

  // ---------- scanning ----------

  function* iconCandidates(root) {
    yield* root.querySelectorAll(ICON_SELECTOR);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (SPARKLE_CHARS.test(n.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    while (walker.nextNode()) yield walker.currentNode;
  }

  function scan() {
    scanQueued = false;
    if (!settings.enabled || !document.body) return;

    for (const icon of iconCandidates(document.body)) {
      if (!iconMatches(icon)) continue;
      glow(icon);
      if (icon.nodeType === Node.ELEMENT_NODE && icon.closest(".cpf-hl-badge")) continue;
      const badge = findBadge(icon);
      if (!badge || badge.classList.contains("cpf-hl-badge") || !wordAllowed(badge)) continue;
      highlight(badge);
    }

    // Drop entries that no longer apply: removed from the page, or a recycled
    // (virtualised) table row whose badge changed to one without the icon.
    for (const entry of highlighted) {
      const { line, badge } = entry;
      const inPlace = line ? line.contains(badge) : true;
      if (badge.isConnected && inPlace && badgeHasMatchingIcon(badge) && wordAllowed(badge)) continue;
      unhighlight(entry);
    }
    for (const el of glowing) {
      if (el.isConnected && iconMatches(el)) continue;
      el.classList.remove("cpf-hl-icon");
      glowing.delete(el);
    }
    reportCount();
  }

  // Table rows / list items get the whole line highlighted; a standalone button
  // with the icon (e.g. "Triage with AI") is itself filled with the colour.
  function highlight(badge) {
    badge.classList.add("cpf-hl-badge");
    const row = badge.closest(ROW_SELECTOR);
    if (!row && badge.closest("button, [role='button'], a")) {
      badge.classList.add("cpf-hl-button");
      highlighted.add({ line: null, badge });
      return;
    }
    const line = row || findLine(badge);
    line.classList.add("cpf-hl-line", "cpf-hl-flash");
    setTimeout(() => line.classList.remove("cpf-hl-flash"), 1300);
    highlighted.add({ line, badge });
  }

  // Every occurrence of the icon glows, wherever it appears on the page.
  function glow(icon) {
    let el = icon;
    if (icon.nodeType === Node.TEXT_NODE) {
      // Only glow a sparkle character when its element holds little else.
      el = icon.parentElement;
      if (!el || normText(el.textContent).length > 3) return;
    }
    el.classList.add("cpf-hl-icon");
    glowing.add(el);
  }

  function unhighlight(entry) {
    highlighted.delete(entry);
    entry.badge.classList.remove("cpf-hl-badge", "cpf-hl-button");
    // Another highlighted badge may share the same line.
    if (entry.line && ![...highlighted].some((e) => e.line === entry.line)) {
      entry.line.classList.remove("cpf-hl-line", "cpf-hl-flash");
    }
  }

  function clearAll() {
    for (const entry of [...highlighted]) unhighlight(entry);
    for (const el of glowing) el.classList.remove("cpf-hl-icon");
    glowing.clear();
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }

  function reportCount() {
    if (window !== window.top && highlighted.size === 0) return;
    try {
      chrome.runtime.sendMessage({ type: "count", count: highlighted.size });
    } catch (_) {
      /* extension reloaded */
    }
  }

  function applySettings(next) {
    settings = { ...DEFAULTS, ...next };
    wordList = settings.words.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
    const root = document.documentElement.style;
    root.setProperty("--cpf-line-bg", settings.lineColor);
    root.setProperty("--cpf-accent", settings.accentColor);
    clearAll();
    scan();
  }

  // ---------- wiring ----------

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    chrome.storage.sync.get(DEFAULTS, applySettings);
  });

  new MutationObserver(queueScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  chrome.storage.sync.get(DEFAULTS, applySettings);
})();
