// Badge Line Highlighter — content script.
// Watches the page (including Shadow DOM) and, as soon as the sparkle icon (✦)
// appears, lights it up: the line holding a "SAST ✦" style badge gets a running
// gold laser, buttons like "✦ Triage with AI" get a gold light running round
// their border, and every sparkle icon glows.
//
// Robustness rules:
// - Marks are data-cpf-* attributes, never classes: frameworks like React rewrite
//   `className` on click/select/hover, which used to wipe the highlight.
// - Every pass re-applies marks (idempotent) instead of assuming they're still set.
// - Only changed subtrees are rescanned; a cheap full pass every few seconds heals
//   anything missed.
// - When the extension is reloaded/updated, this instance stops quietly.

(() => {
  const DEFAULTS = {
    enabled: true,
    animate: true,
    speed: 2.4, // seconds per laser sweep
    lineColor: "#ffd700", // gold
    accentColor: "#b8860b", // dark gold
    words: "" // comma separated; empty = any word
  };

  const ATTR = {
    line: "data-cpf-line",
    badge: "data-cpf-badge",
    button: "data-cpf-button",
    icon: "data-cpf-icon"
  };
  const ALL_ATTRS = Object.values(ATTR);

  const SPARKLE_CHARS = /[✦✧✨❇❈✱✲✳✴✶✷✸✹✺✻✼✽❋⁂✢✣✤✥]/;
  const SPARKLE_CHARS_G = new RegExp(SPARKLE_CHARS.source, "g");
  const SPARKLE_NAMES = /sparkl|auto-?awesome|magic|\bai\b|gen-?ai|copilot/i;
  const ICON_SELECTOR = "svg, img, i, [class*='icon' i], [data-icon]";
  const ROW_SELECTOR = "tr, [role='row'], li, [role='listitem'], [role='treeitem']";
  const BUTTON_SELECTOR = "button, [role='button'], a";
  const NOT_BADGE = "td, th, tr, tbody, table, [role='row'], [role='gridcell'], [role='cell']";
  const BADGE_CLASS = /chip|badge|pill|tag\b|tag-|token/i;
  const MAX_BADGE_TEXT = 30;
  const FLUSH_DELAY_MS = 80;
  const HEAL_INTERVAL_MS = 4000;
  const MAX_PENDING = 1500; // beyond this, one full pass is cheaper

  let settings = { ...DEFAULTS };
  let wordList = [];
  const badges = new Map(); // badge or button element -> its line element (null for buttons)
  const icons = new Set(); // glowing icon elements
  const roots = new Set(); // document + every open shadow root found so far
  const pending = new Set(); // nodes added/changed since the last pass
  let fullPass = true;
  let flushTimer = null;
  let healTimer = null;
  let lastCount = -1;
  let stopped = false;

  // ---------- lifecycle ----------

  // Only the newest copy of this script in a page is in charge.
  const instance = {};
  globalThis.__cpfInstance = instance;

  function alive() {
    try {
      return !stopped && globalThis.__cpfInstance === instance && !!chrome.runtime && !!chrome.runtime.id;
    } catch (_) {
      return false;
    }
  }

  // The extension was reloaded or updated, or a newer copy took over the page:
  // stop quietly, without touching the DOM the new copy manages.
  function stop() {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    clearTimeout(flushTimer);
    clearInterval(healTimer);
  }

  function safely(fn) {
    return (...args) => {
      if (!alive()) return stop();
      try {
        return fn(...args);
      } catch (err) {
        if (!alive()) return stop();
        console.debug("[Badge Line Highlighter]", err);
      }
    };
  }

  // ---------- styles & shadow roots ----------

  const SHEET_MARKER = "[data-cpf-sheet]";
  let sheet = null;

  function addStyles(root) {
    try {
      if (!sheet) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(`${SHEET_MARKER} {}\n${cpfStyles}`);
      }
      // Drop sheets left by a previous version of the extension, then add ours.
      const isOld = (s) => s !== sheet && s.cssRules[0] && s.cssRules[0].selectorText === SHEET_MARKER;
      root.adoptedStyleSheets = [...root.adoptedStyleSheets.filter((s) => !isOld(s)), sheet];
    } catch (_) {
      // Fallback: a plain <style> element.
      const host = root === document ? document.head || document.documentElement : root;
      host.querySelectorAll(":scope > style[data-cpf]").forEach((s) => s.remove());
      const style = document.createElement("style");
      style.dataset.cpf = "";
      style.textContent = cpfStyles;
      host.appendChild(style);
    }
  }

  const observer = new MutationObserver(safely(onMutations));

  function watchRoot(root) {
    if (roots.has(root)) return false;
    roots.add(root);
    removeLeftoverMarks(root);
    addStyles(root);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return true;
  }

  // Finds open shadow roots (including nested ones) at or below `node`, starts
  // watching them and scans their content.
  function discoverShadowRoots(node) {
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE &&
        node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    for (let el = walker.currentNode; el; el = walker.nextNode()) {
      if (el.shadowRoot && watchRoot(el.shadowRoot)) scanTree(el.shadowRoot);
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
      const names = `${describe(icon)} ${describe(icon.parentElement)} ${title ? title.textContent : ""}`;
      // isSparkle caches its verdict per outline, so repeated passes stay cheap.
      return SPARKLE_NAMES.test(names) || cpfSparkleShape.isSparkle(icon);
    }
    // A wrapper like <span class="chip-icon"><svg/></span>: the inner SVG decides.
    if (icon.querySelector("svg")) return false;
    return SPARKLE_NAMES.test(describe(icon));
  }

  // The badge's visible word, with sparkle characters stripped out.
  function badgeWord(el) {
    return normText(el.textContent.replace(SPARKLE_CHARS_G, ""));
  }

  // A badge is a short word in a chip, a button, or an element with a visible
  // border, like the "SAST ✦" chip. Plain text + icon (e.g. "Confirmed ✦") is not.
  function isBadgeLike(el) {
    if (!(el instanceof Element) || el.matches(NOT_BADGE)) return false;
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

  function hasSparkle(el) {
    for (const icon of iconCandidates(el)) if (iconMatches(icon)) return true;
    return false;
  }

  // The "line" around a badge: a table row / list item, or the nearest wide block.
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

  // Icons at or below a node: SVG/img/icon elements and text with a ✦ character.
  function* iconCandidates(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (SPARKLE_CHARS.test(node.textContent)) yield node;
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      // A change inside an SVG (e.g. a <path>): the SVG itself is the candidate.
      const svg = node.tagName.toLowerCase() !== "svg" && node.closest("svg");
      if (svg) {
        yield svg;
        return;
      }
      if (node.matches(ICON_SELECTOR)) yield node;
    }
    if (!node.querySelectorAll) return;
    yield* node.querySelectorAll(ICON_SELECTOR);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (SPARKLE_CHARS.test(n.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    while (walker.nextNode()) yield walker.currentNode;
  }

  // ---------- marking ----------

  const mark = (el, attr) => el.hasAttribute(attr) || el.setAttribute(attr, "");
  const unmark = (el, attr) => el.removeAttribute(attr);

  // Table rows / list items get the whole line lit; a button with the icon
  // (e.g. "Triage with AI") is itself lit.
  function highlight(badge) {
    const row = badge.closest(ROW_SELECTOR);
    const button = !row && badge.closest(BUTTON_SELECTOR);
    if (button) {
      mark(button, ATTR.button);
      badges.set(button, null);
      return;
    }
    const line = row || findLine(badge);
    if (!line) return;
    // The badge may have moved to another row (recycled rows): release the old one.
    const previous = badges.get(badge);
    if (previous && previous !== line) release(badge);
    mark(badge, ATTR.badge);
    mark(line, ATTR.line);
    badges.set(badge, line);
  }

  function release(badge) {
    const line = badges.get(badge);
    badges.delete(badge);
    unmark(badge, ATTR.badge);
    unmark(badge, ATTR.button);
    if (line && ![...badges.values()].includes(line)) unmark(line, ATTR.line);
  }

  // Every occurrence of the icon glows, wherever it appears on the page.
  function glow(icon) {
    let el = icon;
    if (icon.nodeType === Node.TEXT_NODE) {
      // Only glow a sparkle character when its element holds little else.
      el = icon.parentElement;
      if (!el || normText(el.textContent).length > 3) return;
    }
    mark(el, ATTR.icon);
    icons.add(el);
  }

  function clearAll() {
    for (const badge of [...badges.keys()]) release(badge);
    for (const el of icons) unmark(el, ATTR.icon);
    icons.clear();
  }

  // Remove marks left behind by an earlier copy of this script (e.g. before an update).
  function removeLeftoverMarks(root) {
    const selector = ALL_ATTRS.map((a) => `[${a}]`).join(",");
    root.querySelectorAll(selector).forEach((el) => ALL_ATTRS.forEach((a) => el.removeAttribute(a)));
  }

  // ---------- scanning ----------

  function consider(icon) {
    if (!iconMatches(icon)) return;
    glow(icon);
    const badge = findBadge(icon);
    if (badge && wordAllowed(badge)) highlight(badge);
  }

  function scanTree(node) {
    discoverShadowRoots(node);
    for (const icon of iconCandidates(node)) consider(icon);
  }

  // Re-checks everything currently lit: drops what no longer applies (removed,
  // recycled into a row without the icon, filtered out) and re-applies the
  // marks of the rest in case something stripped them.
  function reconcile() {
    for (const [badge, line] of [...badges]) {
      const ok =
        badge.isConnected &&
        (!line || (line.isConnected && line.contains(badge))) &&
        hasSparkle(badge) &&
        wordAllowed(badge);
      if (!ok) {
        release(badge);
      } else if (line) {
        mark(badge, ATTR.badge);
        mark(line, ATTR.line);
      } else {
        mark(badge, ATTR.button);
      }
    }
    for (const el of [...icons]) {
      if (el.isConnected && hasSparkle(el)) {
        mark(el, ATTR.icon);
      } else {
        unmark(el, ATTR.icon);
        icons.delete(el);
      }
    }
  }

  function flush() {
    flushTimer = null;
    if (!settings.enabled) {
      pending.clear();
      return;
    }
    if (fullPass) {
      fullPass = false;
      pending.clear();
      for (const root of [...roots]) scanTree(root);
    } else {
      const nodes = [...pending];
      pending.clear();
      for (const node of nodes) if (node.isConnected) scanTree(node);
    }
    reconcile();
    reportCount();
  }
  const safeFlush = safely(flush);

  function schedule(delay = FLUSH_DELAY_MS) {
    if (!flushTimer) flushTimer = setTimeout(safeFlush, delay);
  }

  function onMutations(records) {
    for (const r of records) {
      if (r.type === "childList") {
        r.addedNodes.forEach((n) => pending.add(n));
        // A removal can change a badge's content (e.g. its icon was removed).
        if (r.removedNodes.length) pending.add(r.target);
      } else {
        pending.add(r.target);
      }
    }
    if (pending.size > MAX_PENDING) {
      pending.clear();
      fullPass = true;
    }
    schedule();
  }

  function heal() {
    if (document.visibilityState !== "visible" || !settings.enabled) return;
    fullPass = true;
    if (window.requestIdleCallback) requestIdleCallback(() => schedule(0), { timeout: 1000 });
    else schedule(0);
  }

  // ---------- settings & count ----------

  function reportCount() {
    const count = badges.size;
    if (count === lastCount) return;
    lastCount = count;
    chrome.runtime.sendMessage({ type: "count", count }, () => void chrome.runtime.lastError);
  }

  function applySettings(next) {
    settings = { ...DEFAULTS, ...next };
    wordList = settings.words.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
    // Custom properties inherit into shadow roots, so setting them here reaches everything.
    const style = document.documentElement.style;
    style.setProperty("--cpf-line-bg", settings.lineColor);
    style.setProperty("--cpf-accent", settings.accentColor);
    style.setProperty("--cpf-play", settings.animate ? "running" : "paused");
    style.setProperty("--cpf-speed", `${Math.min(5, Math.max(1, Number(settings.speed) || 2.4))}s`);
    clearAll();
    fullPass = true;
    clearTimeout(flushTimer);
    flushTimer = null;
    safeFlush();
  }

  // ---------- start ----------

  chrome.storage.onChanged.addListener(
    safely((changes, area) => {
      if (area === "local" && Object.keys(changes).some((k) => k in DEFAULTS)) {
        chrome.storage.local.get(DEFAULTS, safely(applySettings));
      }
    })
  );

  watchRoot(document);
  healTimer = setInterval(safely(heal), HEAL_INTERVAL_MS);
  chrome.storage.local.get(DEFAULTS, safely(applySettings));
})();
