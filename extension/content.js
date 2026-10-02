// Badge Line Highlighter — content script.
// Watches the page and highlights the whole line as soon as a button/badge
// containing a word plus the target icon (e.g. "SAST ✦") appears.

(() => {
  // The popup may inject this script again into a tab that already has it.
  if (window.__cpfLoaded) return;
  window.__cpfLoaded = true;

  const DEFAULTS = {
    enabled: true,
    lineColor: "#ffd700", // gold
    accentColor: "#b8860b", // dark gold
    words: "", // comma separated; empty = any word
    learned: [] // [{ sig, label }]
  };

  const SPARKLE_CHARS = /[✦✧✨❇❈✱✲✳✴✶✷✸✹✺✻✼✽❋⁂✢✣✤✥]/;
  const SPARKLE_NAMES = /sparkle|stars?\b|magic|\bai\b|copilot/i;
  const ICON_SELECTOR = "svg, img, i, [class*='icon' i], [data-icon]";
  const ROW_SELECTOR = "tr, [role='row'], li, [role='listitem'], [role='treeitem']";
  const MAX_BADGE_TEXT = 30;

  let settings = { ...DEFAULTS };
  let wordList = [];
  let learnedSigs = new Set();
  const highlighted = new Set(); // { line, badge } entries; line is null for gold buttons
  const glowing = new Set(); // icon elements with the glow effect
  let scanQueued = false;

  // ---------- helpers ----------

  const normText = (s) => (s || "").replace(/\s+/g, " ").trim();

  function iconSignature(icon) {
    if (icon.nodeType === Node.TEXT_NODE) {
      const m = icon.textContent.match(SPARKLE_CHARS);
      return m ? "char:" + m[0] : null;
    }
    const tag = icon.tagName.toLowerCase();
    // A wrapper like <span class="chip-icon"><svg/></span>: use the inner SVG instead,
    // otherwise every chip icon (shield, sparkle, ...) would share the wrapper's class.
    if (tag !== "svg" && tag !== "img" && icon.querySelector("svg, img")) return null;
    if (tag === "svg") {
      const use = icon.querySelector("use");
      const href = use && (use.getAttribute("href") || use.getAttribute("xlink:href"));
      if (href) return "use:" + href;
      const paths = [...icon.querySelectorAll("path, circle, rect, polygon, line, polyline, ellipse")]
        .map((p) => p.getAttribute("d") || p.getAttribute("points") || p.outerHTML.replace(/\s(class|style|fill|stroke)="[^"]*"/g, ""))
        .join("|");
      return paths ? "svg:" + hash(paths) : null;
    }
    if (tag === "img") return icon.getAttribute("src") ? "img:" + icon.getAttribute("src") : null;
    const cls = typeof icon.className === "string" ? icon.className.trim() : "";
    const dataIcon = icon.getAttribute("data-icon");
    if (dataIcon) return "data:" + dataIcon;
    return cls ? "cls:" + cls : null;
  }

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function iconDescriptor(icon) {
    if (icon.nodeType === Node.TEXT_NODE) return "";
    const parts = [
      icon.getAttribute("class"),
      icon.getAttribute("aria-label"),
      icon.getAttribute("data-icon"),
      icon.getAttribute("alt"),
      icon.getAttribute("src")
    ];
    const title = icon.querySelector && icon.querySelector("title");
    if (title) parts.push(title.textContent);
    return parts.filter(Boolean).join(" ");
  }

  function iconMatches(icon) {
    const sig = iconSignature(icon);
    if (sig && learnedSigs.has(sig)) return true;
    if (icon.nodeType === Node.TEXT_NODE) return SPARKLE_CHARS.test(icon.textContent);
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
    learnedSigs = new Set((settings.learned || []).map((l) => l.sig));
    const root = document.documentElement.style;
    root.setProperty("--cpf-line-bg", settings.lineColor);
    root.setProperty("--cpf-accent", settings.accentColor);
    clearAll();
    scan();
  }

  // ---------- pick mode (teach the extension your exact icon) ----------

  let picking = false;
  let hoverEl = null;
  let banner = null;

  function startPick() {
    if (picking || window !== window.top) return;
    picking = true;
    banner = document.createElement("div");
    banner.id = "cpf-pick-banner";
    banner.textContent = "Click the badge with the icon (e.g. SAST ✦). Press Esc to cancel.";
    document.documentElement.appendChild(banner);
    document.addEventListener("mouseover", onPickHover, true);
    document.addEventListener("click", onPickClick, true);
    document.addEventListener("keydown", onPickKey, true);
  }

  function stopPick() {
    picking = false;
    hoverEl && hoverEl.classList.remove("cpf-pick-hover");
    hoverEl = null;
    banner && banner.remove();
    document.removeEventListener("mouseover", onPickHover, true);
    document.removeEventListener("click", onPickClick, true);
    document.removeEventListener("keydown", onPickKey, true);
  }

  function onPickHover(e) {
    hoverEl && hoverEl.classList.remove("cpf-pick-hover");
    hoverEl = e.target;
    hoverEl.classList.add("cpf-pick-hover");
  }

  function onPickKey(e) {
    if (e.key === "Escape") stopPick();
  }

  function onPickClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    stopPick();

    // Walk up from the click to the smallest element holding an icon, and take
    // its icon (the clicked icon itself if the click landed on it).
    let icon = null;
    let badge = null;
    for (let el = target, d = 0; el && el !== document.body && d < 6; d++, el = el.parentElement) {
      if (badgeWord(el).length > MAX_BADGE_TEXT) break;
      icon = [...iconCandidates(el)].find((i) => iconSignature(i));
      if (icon) { badge = el; break; }
    }
    const sig = icon && iconSignature(icon);
    if (!sig) {
      toast("Couldn't find an icon there. Open the extension and try again, clicking right on the ✦ icon.", true);
      return;
    }
    const label = badgeWord(badge) || badgeWord(badge.parentElement);
    chrome.storage.sync.get(DEFAULTS, (cur) => {
      const learned = (cur.learned || []).filter((l) => l.sig !== sig);
      learned.push({ sig, label });
      chrome.storage.sync.set({ learned }, () => toast(`Learned the icon from "${label || "badge"}" ✦`));
    });
  }

  function toast(text, isError) {
    const el = document.createElement("div");
    el.id = "cpf-pick-banner";
    el.textContent = text;
    if (isError) el.style.background = "#d1242f";
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ---------- wiring ----------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "startPick") {
      // Only the top frame runs pick mode; it answers so the popup knows it worked.
      if (window !== window.top) return;
      startPick();
      sendResponse({ ok: true });
    }
    if (msg.type === "rescan") queueScan();
  });

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
