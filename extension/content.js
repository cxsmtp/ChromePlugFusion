// Badge Line Highlighter — content script.
// Watches the page (including Shadow DOM) and, as soon as the sparkle icon (✦)
// appears, lights it up: the line holding a "SAST ✦" style badge gets a running
// gold laser, buttons like "✦ Triage with AI" get a gold light running round
// their border, and every sparkle icon glows.

(() => {
  const DEFAULTS = {
    enabled: true,
    animate: true,
    lineColor: "#ffd700", // gold
    accentColor: "#b8860b", // dark gold
    words: "" // comma separated; empty = any word
  };

  const SPARKLE_CHARS = /[✦✧✨❇❈✱✲✳✴✶✷✸✹✺✻✼✽❋⁂✢✣✤✥]/;
  const SPARKLE_NAMES = /sparkl|auto-?awesome|magic|\bai\b|gen-?ai|copilot/i;
  const ICON_SELECTOR = "svg, img, i, [class*='icon' i], [data-icon]";
  const ROW_SELECTOR = "tr, [role='row'], li, [role='listitem'], [role='treeitem']";
  const BADGE_CLASS = /chip|badge|pill|tag\b|tag-|token/i;
  const MAX_BADGE_TEXT = 30;
  const SCAN_DELAY_MS = 120;

  let settings = { ...DEFAULTS };
  let wordList = [];
  const highlighted = new Set(); // { line, badge } entries; line is null for gold buttons
  const glowing = new Set(); // icon elements with the glow effect
  const roots = new Set(); // document + every open shadow root found so far
  let scanTimer = null;

  // ---------- styles & shadow roots ----------

  let sheet = null;
  function addStyles(root) {
    try {
      sheet = sheet || new CSSStyleSheet();
      if (!sheet.cssRules.length) sheet.replaceSync(cpfStyles);
      if (!root.adoptedStyleSheets.includes(sheet)) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      }
    } catch (_) {
      // Fallback for pages where adopting a sheet fails.
      const host = root === document ? document.head || document.documentElement : root;
      if (!host.querySelector(":scope > style[data-cpf]")) {
        const style = document.createElement("style");
        style.dataset.cpf = "";
        style.textContent = cpfStyles;
        host.appendChild(style);
      }
    }
  }

  const observer = new MutationObserver(queueScan);
  function watchRoot(root) {
    if (roots.has(root)) return;
    roots.add(root);
    addStyles(root);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  // Finds open shadow roots (also nested ones) below a root.
  function discoverShadowRoots(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let el = walker.currentNode; el; el = walker.nextNode()) {
      if (el.shadowRoot && !roots.has(el.shadowRoot)) {
        watchRoot(el.shadowRoot);
        discoverShadowRoots(el.shadowRoot);
      }
    }
  }

  // ---------- recognising the icon and its badge ----------

  const normText = (s) => (s || "").replace(/\s+/g, " ").trim();

  function describe(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
    return ["class", "data-testid", "aria-label", "data-icon", "data-el-id-icon", "alt", "src"]
      .map((a) => el.getAttribute(a))
      .filter(Boolean)
      .join(" ");
  }

  // Is this the sparkle icon? A ✦ character, an icon named like one (e.g. Checkmarx's
  // data-el-id-icon="ai"), or an SVG whose outline is the four-pointed sparkle shape.
  function iconMatches(icon) {
    if (icon.nodeType === Node.TEXT_NODE) return SPARKLE_CHARS.test(icon.textContent);
    if (icon.tagName.toLowerCase() === "svg") {
      const title = icon.querySelector("title");
      const names = describe(icon) + " " + describe(icon.parentElement) + " " + (title ? title.textContent : "");
      // isSparkle caches its verdict per outline, so repeated scans stay cheap.
      return SPARKLE_NAMES.test(names) || cpfSparkleShape.isSparkle(icon);
    }
    // A wrapper like <span class="chip-icon"><svg/></span>: the inner SVG decides.
    if (icon.querySelector("svg")) return false;
    return SPARKLE_NAMES.test(describe(icon));
  }

  // The badge's visible word, with sparkle characters stripped out.
  function badgeWord(badge) {
    return normText(badge.textContent.replace(new RegExp(SPARKLE_CHARS.source, "g"), ""));
  }

  // A badge is a short word in a chip, a button, or an element with a visible
  // border, like the "SAST ✦" chip. Plain text + icon (e.g. "Confirmed ✦") is not.
  function isBadgeLike(el) {
    if (!(el instanceof Element) || el.matches("td, th, tr, [role='row'], [role='gridcell'], [role='cell']")) {
      return false;
    }
    const text = badgeWord(el);
    if (!text || text.length > MAX_BADGE_TEXT || text.split(" ").length > 3) return false;
    if (el.matches("button, [role='button'], [role='tab']")) return true;
    if (BADGE_CLASS.test(typeof el.className === "string" ? el.className : "")) return true;
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

  // Walk up from an icon to the chip/button that holds both the icon and the word.
  function findBadge(icon) {
    let el = icon.nodeType === Node.TEXT_NODE ? icon.parentElement : icon;
    for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
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
    scanTimer = null;
    if (!settings.enabled || !document.body) return;

    for (const root of [...roots]) discoverShadowRoots(root);

    for (const root of roots) {
      for (const icon of iconCandidates(root)) {
        if (!iconMatches(icon)) continue;
        glow(icon);
        if (icon.nodeType === Node.ELEMENT_NODE && icon.closest(".cpf-hl-badge")) continue;
        const badge = findBadge(icon);
        if (!badge || badge.classList.contains("cpf-hl-badge") || !wordAllowed(badge)) continue;
        highlight(badge);
      }
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

  // Table rows / list items get the whole line lit; a button with the icon
  // (e.g. "Triage with AI") is itself lit.
  function highlight(badge) {
    badge.classList.add("cpf-hl-badge");
    const row = badge.closest(ROW_SELECTOR);
    const button = !row && badge.closest("button, [role='button'], a");
    if (button) {
      button.classList.add("cpf-hl-badge", "cpf-hl-button");
      highlighted.add({ line: null, badge: button });
      return;
    }
    const line = row || findLine(badge);
    line.classList.add("cpf-hl-line");
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
      entry.line.classList.remove("cpf-hl-line");
    }
  }

  function clearAll() {
    for (const entry of [...highlighted]) unhighlight(entry);
    for (const el of glowing) el.classList.remove("cpf-hl-icon");
    glowing.clear();
  }

  function queueScan() {
    if (!scanTimer) scanTimer = setTimeout(scan, SCAN_DELAY_MS);
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
    // Custom properties inherit into shadow roots, so setting them here reaches everything.
    const style = document.documentElement.style;
    style.setProperty("--cpf-line-bg", settings.lineColor);
    style.setProperty("--cpf-accent", settings.accentColor);
    style.setProperty("--cpf-play", settings.animate ? "running" : "paused");
    clearAll();
    scan();
  }

  // ---------- wiring ----------

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    chrome.storage.sync.get(DEFAULTS, applySettings);
  });

  watchRoot(document);
  chrome.storage.sync.get(DEFAULTS, applySettings);
})();
