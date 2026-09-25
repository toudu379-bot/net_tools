/* ==========================================================================
   net_tools — core
   Shared helpers for every tool plus two self-mounting widgets:
     <div data-nt-tool="subnet"></div>   a tool (its own script registers it)
     <div data-nt-geo></div>             visitor location badge with flag
     <header data-nt-shell></header>     standalone header (this repo only)
   Optional page config, set before this script:
     window.NT_CONFIG = { links: { dns: "/tools/dns/", subnet: "...", email: "...", whois: "..." } }
   ========================================================================== */
(function () {
  "use strict";
  if (window.NT && window.NT.__core) return; // already loaded (e.g. header badge and a tool on one page)
  const NT = (window.NT = window.NT || {});
  NT.__core = true;
  const cfg = (NT.config = Object.assign({}, window.NT_CONFIG || {}));

  // Site root of this repo, derived from where this script was loaded (…/assets/net-tools/nt-core.js).
  const src = (document.currentScript && document.currentScript.src) || "";
  const siteRoot = src ? src.replace(/assets\/net-tools\/[^/]*$/, "") : "./";

  NT.TOOLS = [
    { id: "dns",    name: "DNS Lens",          path: "dns-lens/",    blurb: "Every DNS record type for a name, in one lookup." },
    { id: "subnet", name: "Subnet calculator", path: "subnet/",      blurb: "sipcalc-style IPv4 and IPv6 details, splitting, summarising and ranges." },
    { id: "email",  name: "Email security",    path: "email-check/", blurb: "MX, SPF lookup budget, DMARC, DKIM, BIMI, MTA-STS and TLS-RPT." },
    { id: "whois",  name: "WHOIS & IP info",   path: "whois/",       blurb: "RDAP registration data, routing and location for domains, IPs and ASNs." },
    { id: "evpn",   name: "EVPN calculator",   path: "evpn/",        blurb: "VLAN and VRF to VNI allocation, RD/RT and leaf config, and EVPN route scaling." },
  ];
  NT.link = function (id, q) {
    const t = NT.TOOLS.find((x) => x.id === id);
    const base = (cfg.links && cfg.links[id]) || (t ? siteRoot + t.path : "#");
    return q ? base + (base.includes("?") ? "&" : "?") + "q=" + encodeURIComponent(q) : base;
  };

  /* ---------- small helpers ---------- */
  NT.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  NT.$ = (root, sel) => root.querySelector(sel);
  NT.$$ = (root, sel) => Array.from(root.querySelectorAll(sel));
  NT.html = function (str) { const t = document.createElement("template"); t.innerHTML = str.trim(); return t.content.firstElementChild; };
  NT.store = {
    get(k, d) { try { const v = localStorage.getItem("nt:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("nt:" + k, JSON.stringify(v)); } catch (e) {} },
  };
  NT.session = {
    get(k) { try { const v = sessionStorage.getItem("nt:" + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem("nt:" + k, JSON.stringify(v)); } catch (e) {} },
  };
  NT.query = () => new URLSearchParams(location.search).get("q") || "";
  NT.setQuery = function (q) {
    try { const u = new URL(location.href); if (q) u.searchParams.set("q", q); else u.searchParams.delete("q"); history.replaceState(null, "", u); } catch (e) {}
  };
  NT.ttl = function (s) {
    if (s == null) return "";
    if (s < 60) return s + "s";
    if (s < 3600) return Math.round(s / 60) + "m";
    if (s < 86400) return +(s / 3600).toFixed(1) + "h";
    return +(s / 86400).toFixed(1) + "d";
  };
  NT.num = (n) => (typeof n === "bigint" ? n.toLocaleString("en-US") : Number(n).toLocaleString("en-US"));
  NT.date = function (iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
  };
  NT.daysFrom = (iso) => Math.round((new Date(iso) - Date.now()) / 86400000);
  const regionNames = (function () { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { return null; } })();
  NT.country = (cc) => { if (!cc) return ""; try { return (regionNames && regionNames.of(cc.toUpperCase())) || cc; } catch (e) { return cc; } };
  NT.flag = function (cc, cls) {
    if (!cc || !/^[a-z]{2}$/i.test(cc)) return "";
    return `<img class="nt-flag ${cls || ""}" src="https://flagcdn.com/${cc.toLowerCase()}.svg" alt="${NT.esc(NT.country(cc))}" title="${NT.esc(NT.country(cc))}" loading="lazy">`;
  };
  NT.isIPv4 = (s) => /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(s);
  NT.isIPv6 = (s) => s.includes(":") && /^[0-9a-f:.]+$/i.test(s) && !!NT.expandV6(s);
  NT.expandV6 = function (ip) {
    ip = ip.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
    const m = ip.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/); // embedded IPv4
    if (m) {
      if (!NT.isIPv4(m[2])) return null;
      const o = m[2].split(".").map(Number);
      ip = m[1] + ((o[0] << 8) | o[1]).toString(16) + ":" + ((o[2] << 8) | o[3]).toString(16);
    }
    const parts = ip.split("::");
    if (parts.length > 2) return null;
    const head = parts[0] ? parts[0].split(":") : [];
    const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 0 || (parts.length === 1 && missing !== 0) || (parts.length === 2 && missing < 1)) return null;
    const groups = [...head, ...Array(missing).fill("0"), ...tail];
    if (groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
    return groups.map((g) => g.padStart(4, "0")).join(":").toLowerCase();
  };
  NT.cleanDomain = function (raw) {
    let s = String(raw || "").trim();
    s = s.replace(/^[a-z]+:\/\//i, "").replace(/[\/?#].*$/, "").replace(/^.*@/, "").replace(/:\d+$/, "").replace(/\.$/, "").toLowerCase();
    return s;
  };
  NT.isDomain = (s) => /^(?=.{1,253}$)([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z0-9-]{2,63}$/i.test(s);

  /* ---------- network ---------- */
  NT.fetchJSON = async function (url, opts) {
    opts = opts || {};
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 10000);
    try {
      const res = await fetch(url, { headers: opts.headers || { accept: "application/json" }, signal: ctrl.signal });
      if (!res.ok) { const e = new Error("HTTP " + res.status); e.status = res.status; throw e; }
      return await res.json();
    } catch (e) {
      if (e.name === "AbortError") { const t = new Error("The service did not answer in time."); t.timeout = true; throw t; }
      if (e.status) throw e;
      const n = new Error("Could not reach the service."); n.network = true; throw n;
    } finally { clearTimeout(timer); }
  };

  NT.RESOLVERS = {
    cf:     { name: "Cloudflare", ip: "1.1.1.1", url: (n, t) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(n)}&type=${t}` },
    google: { name: "Google",     ip: "8.8.8.8", url: (n, t) => `https://dns.google/resolve?name=${encodeURIComponent(n)}&type=${t}` },
    ali:    { name: "AliDNS",     ip: "223.5.5.5", url: (n, t) => `https://dns.alidns.com/resolve?name=${encodeURIComponent(n)}&type=${t}` },
  };
  NT.RCODES = {
    1: ["Malformed query (FORMERR).", "The resolver could not parse this name. Check for stray characters."],
    2: ["The resolver could not get an answer (SERVFAIL).", "Usually a DNSSEC failure or unreachable nameservers. Try another resolver."],
    3: ["This name does not exist (NXDOMAIN).", "Check the spelling, or whether the domain is registered."],
    4: ["The resolver does not support this query (NOTIMP).", "Try another resolver."],
    5: ["The resolver refused the query (REFUSED).", "Try another resolver."],
  };
  const TYPE_NUM = { A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33, NAPTR: 35, DS: 43, DNSKEY: 48, TLSA: 52, SVCB: 64, HTTPS: 65, CAA: 257 };
  NT.TYPE_NUM = TYPE_NUM;

  /** DNS over HTTPS. Resolves to {status, answers (only the asked type), chain (CNAMEs), ad, ms}. */
  NT.doh = async function (name, type, resolver) {
    const r = NT.RESOLVERS[resolver || "cf"] || NT.RESOLVERS.cf;
    const t0 = performance.now();
    let json;
    try {
      json = await NT.fetchJSON(r.url(name, type), { headers: { accept: "application/dns-json" }, timeout: 8000 });
    } catch (e) {
      const err = new Error(e.timeout ? "The resolver did not answer within 8 seconds." : e.status ? `The resolver answered with HTTP ${e.status}.` : "Could not reach the resolver.");
      err.hint = e.network ? "Check your connection, or whether a firewall blocks DNS-over-HTTPS." : "Try again, or switch resolver.";
      throw err;
    }
    const all = json.Answer || [];
    const num = TYPE_NUM[type];
    return {
      status: json.Status,
      answers: all.filter((a) => a.type === num),
      chain: type === "CNAME" ? [] : all.filter((a) => a.type === 5),
      ad: !!json.AD,
      ms: Math.round(performance.now() - t0),
    };
  };
  /** TXT strings joined, quotes removed. */
  NT.txt = (data) => { data = String(data); return data.startsWith('"') ? data.replace(/^"|"$/g, "").replace(/"\s*"/g, "") : data; };

  /* ---------- UI helpers ---------- */
  let toastEl, toastT;
  NT.toast = function (msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "nt-toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 1600);
  };
  NT.copy = async function (text, label) {
    try { await navigator.clipboard.writeText(text); NT.toast(label || "Copied"); }
    catch (e) { NT.toast("Copy blocked by the browser. Select the text instead."); }
  };
  // One delegated handler for every copy / show-all button inside any tool.
  document.addEventListener("click", function (e) {
    const c = e.target.closest("[data-nt-copy]");
    if (c) { NT.copy(c.getAttribute("data-nt-copy"), c.getAttribute("data-nt-copied") || "Copied value"); return; }
    const m = e.target.closest(".nt-more");
    if (m) {
      const list = m.previousElementSibling;
      const open = list.classList.toggle("clamped") === false;
      m.setAttribute("aria-expanded", String(open));
      m.textContent = open ? "Show fewer" : m.getAttribute("data-label");
    }
  });
  NT.copyBtn = (text, label) => `<button class="nt-copy" type="button" data-nt-copy="${NT.esc(text)}" aria-label="Copy ${NT.esc(label || "value")}">Copy</button>`;

  /**
   * Pack a .nt-grid so cards flow up into the gap left by a shorter neighbour, instead of
   * every row being as tall as its tallest card. Uses fine grid rows plus a row span per card,
   * which keeps left-to-right reading order (CSS masonry isn't supported widely enough yet).
   * Re-runs whenever a card resizes, cards are added or removed, or the grid changes width.
   */
  const ROW = 4; // px per grid row
  NT.masonry = function (grid) {
    if (!grid || grid.__masonry) return;
    grid.__masonry = true;
    grid.classList.add("nt-masonry");
    let queued = false;
    const apply = () => {
      queued = false;
      const cs = getComputedStyle(grid);
      if (cs.display !== "grid") return; // single column fallback: leave the cards alone
      const gap = parseFloat(cs.rowGap) || 0;
      for (const item of grid.children) {
        item.style.gridRowEnd = "auto";
        const h = item.getBoundingClientRect().height;
        if (!h) continue;
        item.style.gridRowEnd = "span " + Math.max(1, Math.ceil((h + gap) / (ROW + gap)));
      }
    };
    // rAF is paused while the tab is in the background, so a timer backs it up; whichever fires first wins.
    grid.__repack = apply;
    const schedule = () => {
      if (queued) return;
      queued = true;
      const run = () => { if (queued) apply(); };
      requestAnimationFrame(run);
      setTimeout(run, 120);
    };
    document.addEventListener("visibilitychange", schedule);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(schedule);
      ro.observe(grid);
      const watch = () => { for (const item of grid.children) if (!item.__ro) { item.__ro = true; ro.observe(item); } };
      watch();
      new MutationObserver(() => { watch(); schedule(); }).observe(grid, { childList: true, subtree: true, characterData: true });
    } else {
      new MutationObserver(schedule).observe(grid, { childList: true, subtree: true, characterData: true });
      window.addEventListener("resize", schedule);
    }
    schedule();
  };

  /** Result card with a state (idle|loading|found|empty|warn|error|off). */
  NT.card = function (o) {
    const el = NT.html(`
      <article class="nt-card" data-state="idle" ${o.id ? `id="${o.id}"` : ""}>
        <div class="nt-card-head">
          <span class="nt-tag">${NT.esc(o.tag)}</span>
          <div class="nt-meta"><h3>${NT.esc(o.title)}</h3><p class="nt-status"></p></div>
          ${o.toggle ? `<label class="nt-switch" title="Include ${NT.esc(o.tag)}">
            <input type="checkbox" role="switch" aria-label="Include ${NT.esc(o.tag)}" ${o.checked ? "checked" : ""}>
            <span class="nt-track"></span></label>` : ""}
        </div>
        <div class="nt-card-body"></div>
      </article>`);
    el.set = function (state, status, body) {
      el.dataset.state = state;
      el.querySelector(".nt-status").textContent = status || "";
      if (body !== undefined) el.querySelector(".nt-card-body").innerHTML = body;
      if (el.led) el.led.dataset.state = state === "skip" ? "off" : state;
      return el;
    };
    el.switch = el.querySelector(".nt-switch input");
    return el;
  };
  /** Record list with optional "show all" clamp. rows: [{html, ttl, copy}] */
  NT.recordList = function (rows, opts) {
    opts = opts || {};
    const clamp = rows.length > (opts.clampAt || 12);
    return `<ul class="nt-records${opts.one ? " one" : ""}${clamp ? " clamped" : ""}">${rows.map((r, i) => `
      <li class="nt-rec" style="animation-delay:${Math.min(i, 12) * 35}ms">
        <span class="nt-val">${r.html}</span>
        ${r.ttl != null ? `<span class="nt-ttl" title="Time to live">${NT.ttl(r.ttl)}</span>` : ""}
        ${r.copy != null ? NT.copyBtn(r.copy) : ""}
      </li>`).join("")}</ul>` +
      (clamp ? `<button class="nt-ghost nt-more" type="button" aria-expanded="false" data-label="Show all ${rows.length}">Show all ${rows.length}</button>` : "");
  };
  NT.kv = (pairs) => `<dl class="nt-kv">${pairs.filter(Boolean).map(([k, v, copy]) =>
    `<dt>${NT.esc(k)}</dt><dd><span>${v}</span>${copy != null ? NT.copyBtn(copy, k) : ""}</dd>`).join("")}</dl>`;
  NT.msg = (kind, text, hint) => `<div class="nt-msg ${kind}">${text}${hint ? `<small>${hint}</small>` : ""}</div>`;
  NT.hero = (eyebrow, title, lede) => `<header class="nt-hero"><p class="nt-eyebrow">${eyebrow}</p><h1>${title}</h1>${lede ? `<p class="nt-lede">${lede}</p>` : ""}</header>`;

  /* ---------- theme (same storage key and attribute as tomislavk.blog) ---------- */
  NT.theme = {
    get: () => document.documentElement.dataset.theme || "dark",
    set(t) {
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem("site-theme", t); } catch (e) {}
      document.querySelectorAll(".nt-theme").forEach((b) => {
        b.setAttribute("aria-pressed", String(t === "dark"));
        b.setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode");
      });
    },
  };

  /* ---------- geolocation ---------- */
  function normIpinfo(j) {
    const [lat, lon] = (j.loc || ",").split(",");
    const m = /^(AS\d+)\s+(.*)$/.exec(j.org || "");
    return { ip: j.ip, city: j.city, region: j.region, cc: j.country, asn: m ? m[1] : "", org: m ? m[2] : j.org || "", tz: j.timezone, lat, lon, postal: j.postal, src: "ipinfo.io", bogon: !!j.bogon };
  }
  function normIpapi(j) {
    if (j.error) throw new Error(j.reason || "ipapi.co error");
    return { ip: j.ip, city: j.city, region: j.region, cc: j.country_code, asn: j.asn || "", org: j.org || "", tz: j.timezone, lat: j.latitude, lon: j.longitude, postal: j.postal, src: "ipapi.co" };
  }
  /** Location for an IP (or the visitor when ip is empty). ipinfo.io first, ipapi.co as fallback. Cached per session. */
  NT.geo = async function (ip) {
    const key = "geo:" + (ip || "self");
    const hit = NT.session.get(key);
    if (hit) return hit;
    let out;
    try { out = normIpinfo(await NT.fetchJSON(ip ? `https://ipinfo.io/${encodeURIComponent(ip)}/json` : "https://ipinfo.io/json", { timeout: 7000 })); }
    catch (e) { out = normIpapi(await NT.fetchJSON(ip ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : "https://ipapi.co/json/", { timeout: 7000 })); }
    NT.session.set(key, out);
    return out;
  };

  function mountGeo(el) {
    if (el.dataset.ntMounted) return;
    el.dataset.ntMounted = "1";
    el.classList.add("nt-geo");
    el.innerHTML = `<button class="nt-geo-btn" type="button" aria-expanded="false" aria-label="Your IP address and location">
        <span class="nt-geo-ph"></span><span class="ip">Finding your IP…</span></button>`;
    const btn = el.firstElementChild;
    let pop = null;
    NT.geo("").then((g) => {
      const place = [g.city, g.cc].filter(Boolean).join(", ");
      btn.innerHTML = `${NT.flag(g.cc) || '<span class="nt-geo-ph" style="animation:none"></span>'}<span class="ip">${NT.esc(g.ip)}</span>${place ? `<span class="place">${NT.esc(place)}</span>` : ""}`;
      btn.title = `Your IP: ${g.ip}${place ? " · " + place : ""}`;
      pop = NT.html(`<div class="nt-geo-pop" hidden role="dialog" aria-label="Your connection">
        <h4>Your connection</h4>
        ${NT.kv([
          ["IP address", NT.esc(g.ip), g.ip],
          g.org && ["Network", NT.esc([g.asn, g.org].filter(Boolean).join(" · "))],
          (g.city || g.cc) && ["Location", `${NT.flag(g.cc)} ${NT.esc([g.city, g.region, NT.country(g.cc)].filter(Boolean).join(", "))}`],
          g.tz && ["Time zone", NT.esc(g.tz)],
        ])}
        <a href="${NT.esc(NT.link("whois", g.ip))}">Look up this IP →</a>
        <p class="src">Location from ${g.src}. City-level results are approximate.</p>
      </div>`);
      el.appendChild(pop);
    }).catch(() => {
      btn.innerHTML = `<span class="ip">IP lookup unavailable</span>`;
      btn.disabled = true;
    });
    btn.addEventListener("click", () => {
      if (!pop) return;
      pop.hidden = !pop.hidden;
      btn.setAttribute("aria-expanded", String(!pop.hidden));
    });
    document.addEventListener("click", (e) => { if (pop && !pop.hidden && !el.contains(e.target)) { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pop && !pop.hidden) { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus(); } });
  }

  /* ---------- standalone header ---------- */
  function mountShell(el) {
    if (el.dataset.ntMounted) return;
    el.dataset.ntMounted = "1";
    el.classList.add("nt-shell");
    const active = el.getAttribute("data-active");
    el.innerHTML = `<div class="nt-shell-inner">
      <a class="nt-brand" href="${siteRoot}"><span class="nt-mark">nt</span><span><strong>net_tools</strong><small>Network tools that run in your browser</small></span></a>
      <nav class="nt-nav" aria-label="Tools">${NT.TOOLS.map((t) => `<a href="${NT.link(t.id)}"${t.id === active ? ' aria-current="page"' : ""}>${t.name}</a>`).join("")}</nav>
      <div class="nt-shell-end">
        <div data-nt-geo></div>
        <button class="nt-theme" type="button"><span class="nt-theme-track" aria-hidden="true"><span class="nt-theme-thumb"></span></span></button>
      </div></div>`;
    el.querySelector(".nt-theme").addEventListener("click", () => NT.theme.set(NT.theme.get() === "dark" ? "light" : "dark"));
    NT.theme.set(NT.theme.get());
  }

  /* ---------- mounting ---------- */
  NT.tools = NT.tools || {};
  NT.register = function (name, fn) { NT.tools[name] = fn; if (document.readyState !== "loading") mountAll(); };
  function mountAll() {
    document.querySelectorAll("[data-nt-shell]").forEach(mountShell);
    document.querySelectorAll("[data-nt-tool]").forEach((el) => {
      const fn = NT.tools[el.dataset.ntTool];
      if (!fn || el.dataset.ntMounted) return;
      el.dataset.ntMounted = "1";
      el.classList.add("nt");
      fn(el);
      el.querySelectorAll(".nt-grid").forEach(NT.masonry);
    });
    document.querySelectorAll("[data-nt-geo]").forEach(mountGeo);
  }
  NT.mount = mountAll;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
  else mountAll();
})();
