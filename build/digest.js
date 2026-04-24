/* build/digest.js — progressive-enhancement client code for a statically-rendered digest.
 * The server emits full semantic HTML; this JS adds the live clock, section/source
 * filters, mark-as-read persistence, row expand, and copy-as-markdown.
 * Safe to omit entirely — the page still reads and navigates without it.
 */
(function () {
  "use strict";

  // ---------- Live clock ----------
  function fmtDuration(ms) {
    var m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m";
    var h = Math.floor(m / 60), r = m % 60;
    if (h < 24) return h + "h " + r + "m";
    return Math.floor(h / 24) + "d";
  }

  function initLiveClock() {
    var el = document.querySelector(".status-strip");
    if (!el) return;
    var iso = el.getAttribute("data-generated");
    if (!iso) return;
    var gen = new Date(iso).getTime();
    var DAY = 86400000;
    var ago = el.querySelector("[data-ago]");
    var next = el.querySelector("[data-next]");
    var bar = el.querySelector(".progress > span");

    function tick() {
      var now = Date.now();
      var a = Math.max(0, now - gen);
      var n = Math.max(0, (gen + DAY) - now);
      var p = Math.min(1, a / DAY);
      if (ago)  ago.textContent  = fmtDuration(a) + " ago";
      if (next) next.textContent = "next in " + fmtDuration(n);
      if (bar)  bar.style.width  = (p * 100) + "%";
    }
    tick();
    setInterval(tick, 30000);
  }

  // ---------- Read-state (localStorage) ----------
  function readSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); }
    catch { return new Set(); }
  }
  function persistSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([].concat.apply([], [Array.from(set)]))); } catch {}
  }

  function initReadState() {
    var root = document.querySelector("[data-digest-date]");
    if (!root) return;
    var date = root.getAttribute("data-digest-date");
    var key = "digest:read:" + date;
    var set = readSet(key);

    function paint() {
      root.querySelectorAll(".item").forEach(function (el) {
        var id = el.getAttribute("data-id");
        var on = set.has(id);
        el.classList.toggle("read", on);
        var btn = el.querySelector(".toggle-read");
        if (btn) {
          btn.classList.toggle("done", on);
          btn.textContent = on ? "read ✓" : "mark read";
        }
      });
      var reset = document.querySelector("[data-reset-read]");
      if (reset) {
        if (set.size > 0) {
          reset.hidden = false;
          reset.textContent = "Reset · " + set.size;
        } else {
          reset.hidden = true;
        }
      }
    }

    root.addEventListener("click", function (e) {
      var btn = e.target.closest(".toggle-read");
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      var item = btn.closest(".item");
      if (!item) return;
      var id = item.getAttribute("data-id");
      if (set.has(id)) set.delete(id); else set.add(id);
      persistSet(key, set);
      paint();
    });

    var reset = document.querySelector("[data-reset-read]");
    if (reset) reset.addEventListener("click", function () {
      set.clear(); persistSet(key, set); paint();
    });

    paint();
  }

  // ---------- Section + source filters ----------
  function initFilters() {
    var root = document.querySelector("[data-digest-date]");
    if (!root) return;

    var active = new Set();
    root.querySelectorAll(".chip[data-section]").forEach(function (c) {
      active.add(c.getAttribute("data-section"));
      c.classList.add("on");
    });
    var muted = new Set();

    function apply() {
      root.querySelectorAll(".digest-section").forEach(function (sec) {
        var k = sec.getAttribute("data-section");
        var items = sec.querySelectorAll(".item");
        var visibleCount = 0;
        items.forEach(function (it) {
          var itemSources = (it.getAttribute("data-sources") || "").split("|").filter(Boolean);
          var allMuted = itemSources.length > 0 && itemSources.every(function (s) { return muted.has(s); });
          var show = active.has(k) && !allMuted;
          it.style.display = show ? "" : "none";
          if (show) visibleCount++;
        });
        sec.style.display = (visibleCount > 0 && active.has(k)) ? "" : "none";
        var countEl = sec.querySelector("h2.section .count");
        if (countEl && visibleCount > 0) countEl.textContent = visibleCount;
      });
      // empty state
      var anyVisible = Array.from(root.querySelectorAll(".digest-section")).some(function (s) { return s.style.display !== "none"; });
      var empty = root.querySelector(".empty");
      if (empty) empty.hidden = anyVisible;
    }

    root.querySelectorAll(".chip[data-section]").forEach(function (c) {
      c.addEventListener("click", function () {
        var k = c.getAttribute("data-section");
        if (active.has(k)) active.delete(k); else active.add(k);
        c.classList.toggle("on");
        apply();
      });
    });

    root.querySelectorAll(".srcbar .src").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = b.getAttribute("data-source");
        if (muted.has(s)) muted.delete(s); else muted.add(s);
        b.classList.toggle("muted");
        var summary = document.querySelector(".srcbar summary");
        var total = root.querySelectorAll(".srcbar .src").length;
        if (summary) summary.textContent = (total - muted.size) + " of " + total + " outlets shown";
        apply();
      });
    });
  }

  // ---------- Expand rows ----------
  function initExpand() {
    document.querySelectorAll(".item").forEach(function (item) {
      item.addEventListener("click", function (e) {
        // ignore clicks on links and the read toggle
        if (e.target.closest("a")) return;
        if (e.target.closest(".toggle-read")) return;
        var exp = item.querySelector(".expand");
        if (exp) exp.hidden = !exp.hidden;
      });
    });
  }

  // ---------- Copy as markdown ----------
  function buildMarkdown() {
    var root = document.querySelector("[data-digest-date]");
    if (!root) return "";
    var date = root.getAttribute("data-digest-date");
    var lines = ["# AI Digest — " + date, ""];
    var tldr = document.querySelectorAll(".tldr li");
    if (tldr.length) {
      lines.push("## TL;DR");
      tldr.forEach(function (li) { lines.push("- " + li.textContent.trim()); });
      lines.push("");
    }
    document.querySelectorAll(".digest-section").forEach(function (sec) {
      var name = sec.querySelector("h2.section .name");
      if (!name) return;
      lines.push("## " + name.textContent.trim());
      sec.querySelectorAll(".item").forEach(function (it) {
        var t = it.querySelector(".item-title a");
        if (!t) return;
        var adopt = it.classList.contains("adopt") ? " **[adopt]**" : "";
        var summary = (it.querySelector(".item-summary") || { textContent: "" }).textContent.trim();
        var sources = Array.from(it.querySelectorAll(".src-tag")).map(function (s) { return s.textContent.trim(); }).join(", ");
        lines.push("- [" + t.textContent.trim() + "](" + t.getAttribute("href") + ")" + adopt + " — " + summary + " _(" + sources + ")_");
      });
      lines.push("");
    });
    return lines.join("\n");
  }

  function initCopy() {
    var btn = document.querySelector("[data-copy-md]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var md = buildMarkdown();
      navigator.clipboard.writeText(md).then(function () {
        var prev = btn.textContent;
        btn.classList.add("copied");
        btn.textContent = "Copied ✓";
        setTimeout(function () {
          btn.classList.remove("copied");
          btn.textContent = prev;
        }, 1800);
      });
    });
  }

  // ---------- <details> source count on toggle ----------
  function initSourcesDetails() {
    var d = document.querySelector(".srcbar");
    if (!d) return;
    // initial count is already correct from SSR
  }

  // ---------- Init ----------
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {
    initLiveClock();
    initReadState();
    initFilters();
    initExpand();
    initCopy();
    initSourcesDetails();
  });
})();
