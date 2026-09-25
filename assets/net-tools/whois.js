/* WHOIS & IP info — RDAP (rdap.org bootstrap), RIPEstat routing data and ipinfo.io / ipapi.co location. */
NT.register("whois", function (root) {
  const { esc, $ } = NT;
  const RIPE = (path, res) => `https://stat.ripe.net/data/${path}/data.json?resource=${encodeURIComponent(res)}&sourceapp=net_tools`;
  const RDAP = (kind, q) => `https://rdap.org/${kind}/${q}`;

  root.innerHTML = NT.hero("Registration & routing", "WHOIS & IP info",
    "Look up who holds a domain, IP address, prefix or AS number: registration data from RDAP, routing from RIPEstat and approximate location.") + `
    <form class="nt-panel" autocomplete="off">
      <label class="nt-label" for="nt-who-q">Domain, IP address, prefix or AS number</label>
      <div class="nt-row">
        <input class="nt-input nt-grow" id="nt-who-q" type="text" spellcheck="false" autocapitalize="off" placeholder="example.com, 8.8.8.8, 2a00:1450::/32 or AS13335">
        <button class="nt-btn" type="submit">Look up</button>
      </div>
      <div class="nt-row" style="margin-top:.7rem; gap:.4rem" data-slot="examples"></div>
      <p class="nt-hint"></p>
    </form>
    <div data-slot="summary"></div>
    <section class="nt-grid" aria-label="Results"></section>
    <p class="nt-foot">Registration data comes from the registry's RDAP service (found through rdap.org), routing from RIPEstat, and location from ipinfo.io with ipapi.co as a fallback. Location is approximate.</p>`;

  const form = $(root, "form"), input = $(root, "#nt-who-q"), hint = $(root, ".nt-hint"), grid = $(root, ".nt-grid"), btn = $(root, ".nt-btn"), summary = $(root, "[data-slot=summary]");
  $(root, "[data-slot=examples]").innerHTML = ["tomislavk.blog", "wikipedia.org", "1.1.1.1", "2a00:1450:4001::1", "193.0.0.0/21", "AS13335"]
    .map((x) => `<button class="nt-ghost" type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join("");
  root.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.ex; run(); }));

  /* ---------- RDAP helpers ---------- */
  function vcard(ent) {
    const out = {};
    const arr = ent && ent.vcardArray && ent.vcardArray[1];
    if (!arr) return out;
    for (const [k, params, , val] of arr) {
      if (k === "fn") out.fn = val;
      else if (k === "org") out.org = Array.isArray(val) ? val.join(" ") : val;
      else if (k === "email" && !out.email) out.email = val;
      else if (k === "tel" && !out.tel) out.tel = String(val).replace(/^tel:/, "");
      else if (k === "adr") {
        out.adr = (params && params.label) || (Array.isArray(val) ? val.flat().filter(Boolean).join(", ") : val);
        if (Array.isArray(val) && val[6]) out.country = val[6];
      }
    }
    return out;
  }
  function findRole(ents, role, depth) {
    for (const e of ents || []) {
      if ((e.roles || []).includes(role)) return e;
      if ((depth || 0) < 3) { const sub = findRole(e.entities, role, (depth || 0) + 1); if (sub) return sub; }
    }
    return null;
  }
  const event = (j, action) => ((j.events || []).find((e) => e.eventAction === action) || {}).eventDate;
  /** RDAP "self" link as a row, only when it is a real https URL. */
  function sourceRow(j) {
    const href = NT.safeURL((((j.links || []).find((l) => l.rel === "self")) || {}).href);
    return href ? ["RDAP source", `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(new URL(href).host)}</a>`] : null;
  }
  const rirOf = (j) => {
    const href = NT.safeURL((((j.links || []).find((l) => l.rel === "self")) || {}).href);
    return href ? new URL(href).host.replace(/^rdap\.(db\.)?/, "").replace(/\.(net|org)$/, "").toUpperCase() : "";
  };
  const numOr = (v, d) => (Number.isFinite(+v) ? +v : d);
  const redacted = (s) => !s || /redacted|privacy|withheld|not disclosed|data protected/i.test(s);
  const STATUS = {
    "active": ["ok", "Active"], "ok": ["ok", "Active"],
    "client transfer prohibited": ["ok", "Transfer lock (registrar)"], "server transfer prohibited": ["ok", "Transfer lock (registry)"],
    "client delete prohibited": ["ok", "Delete lock (registrar)"], "server delete prohibited": ["ok", "Delete lock (registry)"],
    "client update prohibited": ["ok", "Update lock (registrar)"], "server update prohibited": ["ok", "Update lock (registry)"],
    "client renew prohibited": ["warn", "Renewal blocked (registrar)"], "server renew prohibited": ["warn", "Renewal blocked (registry)"],
    "client hold": ["err", "On hold: not published in DNS"], "server hold": ["err", "On hold by registry: not published in DNS"],
    "redemption period": ["err", "Expired, in redemption period"], "pending delete": ["err", "Pending deletion"],
    "pending transfer": ["warn", "Transfer in progress"], "inactive": ["warn", "Inactive: no nameservers"], "auto renew period": ["ok", "Recently auto-renewed"],
  };
  let ianaDns = null;
  async function tldHasRdap(tld) {
    try {
      if (!ianaDns) ianaDns = await NT.fetchJSON("https://data.iana.org/rdap/dns.json");
      return ianaDns.services.some(([tlds]) => tlds.includes(tld));
    } catch (e) { return null; }
  }
  async function rdap(kind, q) {
    return NT.fetchJSON(RDAP(kind, q), { headers: { accept: "application/rdap+json, application/json" }, timeout: 12000 });
  }

  /* ---------- cards ---------- */
  function cards(list) {
    grid.innerHTML = "";
    const out = {};
    for (const [k, tag, title, wide] of list) { out[k] = NT.card({ tag, title }); if (wide) out[k].classList.add("wide"); grid.appendChild(out[k]); out[k].set("loading", "Looking up"); }
    return out;
  }
  const raw = (j) => `<details class="nt-raw"><summary>Raw RDAP response</summary><pre>${esc(JSON.stringify(j, null, 2))}</pre></details>`;
  const fail = (e, what) => NT.msg("err", esc(e.status === 404 ? `No ${what} record found.` : e.timeout ? "The service did not answer in time." : e.status ? `The service answered with HTTP ${e.status}.` : "Could not reach the service."),
    e.status === 404 ? "" : "Try again in a moment.");
  function setSummary(icon, title, chips) {
    summary.innerHTML = `<div class="nt-verdict" data-state="idle" style="margin-top:1.4rem">
      <div style="display:grid; place-items:center; min-width:3rem">${icon}</div>
      <div class="nt-grow"><h2 class="mono" style="font-family:var(--nt-mono); overflow-wrap:anywhere">${esc(title)}</h2></div>
      <div class="nt-chips">${chips.filter(Boolean).join("")}</div></div>`;
  }
  const typeIcon = (t) => `<span class="nt-tag" style="min-width:3.4rem">${t}</span>`;

  /* ---------- domain ---------- */
  async function lookupDomain(d) {
    const c = cards([["reg", "RDAP", "Registration"], ["status", "EPP", "Domain status"], ["ns", "NS", "Nameservers"], ["contacts", "WHO", "Contacts"], ["dns", "A", "Points to"]]);
    setSummary(typeIcon("DOMAIN"), d, []);
    resolveTo(d, c.dns);
    // Registries only know registered names, so walk up from the full name (www.bbc.co.uk → bbc.co.uk).
    let j, asked = d, e = null;
    const labels = d.split(".");
    for (let i = 0; i < labels.length - 1 && !j; i++) {
      asked = labels.slice(i).join(".");
      try { j = await rdap("domain", asked); e = null; }
      catch (err) { e = err; if (err.status !== 404) break; }
    }
    if (!j) {
      const tld = labels[labels.length - 1];
      const has = e.status === 404 ? await tldHasRdap(tld) : null;
      const msg = has === false
        ? NT.msg("warn", `The .${esc(tld)} registry doesn't publish RDAP, so its data can't be read from a browser.`, `Use the registry's own WHOIS page, listed at <a href="https://www.iana.org/domains/root/db/${esc(tld)}.html" target="_blank" rel="noopener noreferrer">iana.org/domains/root/db/${esc(tld)}</a>.`)
        : e.status === 404 ? NT.msg("warn", `${esc(d)} is not registered, or the registry has no record of it.`) : fail(e, "registration");
      c.reg.set(has === false || e.status === 404 ? "warn" : "error", has === false ? "No RDAP for this TLD" : e.status === 404 ? "Not found" : "Lookup failed", msg);
      ["status", "ns", "contacts"].forEach((k) => c[k].set("off", "Not available", ""));
      return;
    }
    const reg = findRole(j.entities, "registrar"), regV = vcard(reg);
    const ianaId = reg && (reg.publicIds || []).find((p) => /iana/i.test(p.type));
    const created = event(j, "registration"), updated = event(j, "last changed"), expires = event(j, "expiration");
    const days = expires ? NT.daysFrom(expires) : null;
    const signed = j.secureDNS && j.secureDNS.delegationSigned;
    const expTxt = expires ? `${NT.date(expires)} <span class="nt-sub">(${days < 0 ? `expired ${-days} days ago` : `in ${NT.num(days)} days`})</span>` : "Not published";
    const regState = days != null && days < 0 ? "error" : days != null && days < 30 ? "warn" : "found";
    c.reg.set(regState, days != null && days < 0 ? "Expired" : days != null && days < 30 ? `Expires in ${days} days` : "Registered",
      (asked !== d ? NT.msg("info", `Showing the registered domain ${esc(asked)}.`) + "<div style='height:.5rem'></div>" : "") +
      NT.kv([
        ["Domain", esc((j.ldhName || asked).toLowerCase()), (j.ldhName || asked).toLowerCase()],
        ["Registrar", esc(regV.fn || "Not published")],
        ianaId && ["IANA registrar ID", esc(ianaId.identifier)],
        ["Registered", created ? NT.date(created) : "Not published"],
        ["Last changed", updated ? NT.date(updated) : "Not published"],
        ["Expires", expTxt],
        ["DNSSEC", signed ? `<span class="nt-chip ok">Signed</span>` : `<span class="nt-chip">Not signed</span>`],
        sourceRow(j),
      ]) + raw(j));
    setSummary(typeIcon("DOMAIN"), (j.ldhName || asked).toLowerCase(), [
      regV.fn && `<span class="nt-chip">${esc(regV.fn)}</span>`,
      expires && `<span class="nt-chip ${regState === "found" ? "ok" : regState === "warn" ? "warn" : "err"}">Expires ${NT.date(expires)}</span>`,
      `<span class="nt-chip ${signed ? "ok" : ""}">DNSSEC ${signed ? "on" : "off"}</span>`,
    ]);

    const st = (j.status || []).map((s) => [s, STATUS[s.toLowerCase()] || ["", s]]);
    const worst = st.some(([, [k]]) => k === "err") ? "error" : st.some(([, [k]]) => k === "warn") ? "warn" : "found";
    c.status.set(st.length ? worst : "empty", st.length ? `${st.length} status code${st.length > 1 ? "s" : ""}` : "None published",
      st.length ? `<ul class="nt-records one">${st.map(([code, [k, label]]) => `<li class="nt-rec"><span class="nt-val"><span class="nt-chip ${k}">${esc(label)}</span> <span class="nt-note">${esc(code)}</span></span></li>`).join("")}</ul>` : "");

    const ns = (j.nameservers || []).map((n) => (n.ldhName || "").toLowerCase().replace(/\.$/, "")).filter(Boolean);
    c.ns.set(ns.length ? "found" : "warn", ns.length ? `${ns.length} nameserver${ns.length > 1 ? "s" : ""}` : "None published",
      ns.length ? NT.recordList(ns.map((n) => ({ html: esc(n), copy: n })), { one: true }) : NT.msg("warn", "No nameservers are delegated, so the domain doesn't resolve."));

    const regt = vcard(findRole(j.entities, "registrant")), abuse = vcard(findRole(reg ? reg.entities : j.entities, "abuse") || findRole(j.entities, "abuse"));
    const rows = [
      ["Registrant", redacted(regt.fn) && redacted(regt.org) ? `<span class="nt-note">Redacted for privacy</span>` : esc(regt.org || regt.fn)],
      regt.country && ["Registrant country", `${NT.flag(regt.country)} ${esc(NT.country(regt.country))}`],
      abuse.email && ["Abuse email", `<a href="mailto:${esc(abuse.email)}">${esc(abuse.email)}</a>`, abuse.email],
      abuse.tel && ["Abuse phone", esc(abuse.tel), abuse.tel],
    ];
    c.contacts.set("found", "From the registry", NT.kv(rows));
  }
  async function resolveTo(d, card) {
    try {
      const [a, aaaa] = await Promise.all([NT.doh(d, "A"), NT.doh(d, "AAAA")]);
      const ips = [...a.answers, ...aaaa.answers].map((x) => x.data);
      card.set(ips.length ? "found" : "empty", ips.length ? `${ips.length} address${ips.length > 1 ? "es" : ""}` : "No A or AAAA records",
        ips.length ? NT.recordList(ips.map((ip) => ({ html: `<a href="${esc(NT.link("whois", ip))}" data-ip="${esc(ip)}">${esc(ip)}</a>`, copy: ip })), { one: true }) : "");
      card.querySelectorAll("[data-ip]").forEach((a) => a.addEventListener("click", (e) => { if (e.ctrlKey || e.metaKey) return; e.preventDefault(); input.value = a.dataset.ip; run(); }));
    } catch (e) { card.set("error", "Lookup failed", NT.msg("err", esc(e.message))); }
  }

  /* ---------- IP / prefix ---------- */
  async function lookupIP(ip, prefix) {
    const q = prefix ? `${ip}/${prefix}` : ip;
    const c = cards([["geo", "GEO", "Location"], ["net", "RDAP", "Network registration"], ["route", "BGP", "Routing"], ["ptr", "PTR", "Reverse DNS"]]);
    setSummary(typeIcon(prefix ? "PREFIX" : ip.includes(":") ? "IPv6" : "IPv4"), q, []);
    const chips = {};
    const paint = () => setSummary(chips.flag || typeIcon(prefix ? "PREFIX" : ip.includes(":") ? "IPv6" : "IPv4"), q, [chips.place, chips.asn, chips.net]);

    // location
    NT.geo(ip).then((g) => {
      if (g.bogon) { c.geo.set("empty", "Private or reserved address", NT.msg("info", "This address isn't routed on the public internet, so it has no location.")); return; }
      chips.flag = NT.flag(g.cc, "lg"); chips.place = g.cc ? `<span class="nt-chip">${esc([g.city, NT.country(g.cc)].filter(Boolean).join(", "))}</span>` : ""; paint();
      c.geo.set("found", [g.city, NT.country(g.cc)].filter(Boolean).join(", ") || "Location found", NT.kv([
        ["Country", `${NT.flag(g.cc)} ${esc(NT.country(g.cc))}`],
        (g.city || g.region) && ["City / region", esc([g.city, g.region].filter(Boolean).join(", "))],
        g.postal && ["Postal code", esc(g.postal)],
        Number.isFinite(+g.lat) && Number.isFinite(+g.lon) && ["Coordinates", `<a href="https://www.openstreetmap.org/?mlat=${+g.lat}&mlon=${+g.lon}#map=9/${+g.lat}/${+g.lon}" target="_blank" rel="noopener noreferrer">${+g.lat}, ${+g.lon}</a>`],
        g.tz && ["Time zone", esc(g.tz)],
        g.org && ["Network", esc([g.asn, g.org].filter(Boolean).join(" · "))],
      ]) + `<p class="nt-note" style="margin-top:.5rem">Source: ${esc(g.src)}${prefix ? `, for ${esc(ip)}` : ""}. City-level location is approximate.</p>`);
    }).catch(() => c.geo.set("error", "Lookup failed", NT.msg("err", "Both location services failed or hit their rate limit.", "Try again in a minute.")));

    // RDAP network
    rdap("ip", q).then((j) => {
      const org = vcard(findRole(j.entities, "registrant") || findRole(j.entities, "administrative")), abuse = vcard(findRole(j.entities, "abuse"));
      const cidrs = (j.cidr0_cidrs || []).map((x) => `${x.v4prefix || x.v6prefix}/${x.length}`);
      const rir = rirOf(j) || (j.port43 || "").replace(/^whois\./, "").split(".")[0].toUpperCase();
      chips.net = j.name ? `<span class="nt-chip mono">${esc(j.name)}</span>` : ""; paint();
      c.net.set("found", j.name || j.handle || "Registered", NT.kv([
        ["Network name", esc(j.name || "")],
        ["Handle", esc(j.handle || "")],
        ["Range", esc(`${j.startAddress} – ${j.endAddress}`), `${j.startAddress} - ${j.endAddress}`],
        cidrs.length && ["CIDR", esc(cidrs.join(", ")), cidrs.join(", ")],
        j.type && ["Type", esc(j.type)],
        j.country && ["Country", `${NT.flag(j.country)} ${esc(NT.country(j.country))}`],
        (org.org || org.fn) && ["Organisation", esc(org.org || org.fn)],
        abuse.email && ["Abuse email", `<a href="mailto:${esc(abuse.email)}">${esc(abuse.email)}</a>`, abuse.email],
        rir && ["Registry", esc(rir)],
        event(j, "registration") && ["Registered", NT.date(event(j, "registration"))],
        event(j, "last changed") && ["Last changed", NT.date(event(j, "last changed"))],
      ]) + raw(j));
    }).catch((e) => c.net.set("error", "Lookup failed", fail(e, "network")));

    // RIPEstat routing
    NT.fetchJSON(RIPE("prefix-overview", q)).then((r) => {
      const d = r.data || {};
      if (!d.announced) { c.route.set("empty", "Not announced in BGP", NT.msg("info", "No route for this address is visible in the global routing table.")); return; }
      const asns = d.asns || [];
      chips.asn = asns[0] ? `<span class="nt-chip mono">AS${asns[0].asn}</span>` : ""; paint();
      c.route.set("found", `Announced by ${asns.length} AS${asns.length > 1 ? "es" : ""}`, NT.kv([
        ["Announced prefix", `<span class="mono">${esc(d.resource)}</span>`, d.resource],
        ...asns.map((a) => { const n = numOr(a.asn, 0); return ["Origin AS", `<a href="${esc(NT.link("whois", "AS" + n))}" data-asn="AS${n}">AS${n}</a> <span class="nt-sub">${esc(a.holder || "")}</span>`, "AS" + n]; }),
        d.block && d.block.desc && ["Allocation", esc(`${d.block.resource} · ${d.block.desc}`)],
      ]) + `<p class="nt-note" style="margin-top:.5rem">As seen by RIPE RIS route collectors. The most specific announced route is shown.</p>`);
      c.route.querySelectorAll("[data-asn]").forEach((a) => a.addEventListener("click", (e) => { if (e.ctrlKey || e.metaKey) return; e.preventDefault(); input.value = a.dataset.asn; run(); }));
    }).catch((e) => c.route.set("error", "Lookup failed", fail(e, "routing")));

    // PTR
    const name = ip.includes(":")
      ? NT.expandV6(ip).replace(/:/g, "").split("").reverse().join(".") + ".ip6.arpa"
      : ip.split(".").reverse().join(".") + ".in-addr.arpa";
    NT.doh(name, "PTR").then((r) => {
      const names = r.answers.map((a) => a.data);
      c.ptr.set(names.length ? "found" : "empty", names.length ? names[0] : "No PTR record",
        names.length ? NT.recordList(names.map((n, i) => ({ html: esc(n), ttl: r.answers[i].TTL, copy: n })), { one: true }) : NT.msg("info", `No reverse DNS name is set for ${esc(ip)}.`));
    }).catch((e) => c.ptr.set("error", "Lookup failed", NT.msg("err", esc(e.message))));
  }

  /* ---------- ASN ---------- */
  async function lookupASN(n) {
    const c = cards([["as", "AS", "AS overview"], ["reg", "RDAP", "Registration"], ["pfx", "PFX", "Announced prefixes", true]]);
    setSummary(typeIcon("ASN"), "AS" + n, []);
    let holder = "";
    NT.fetchJSON(RIPE("as-overview", "AS" + n)).then((r) => {
      const d = r.data || {};
      holder = d.holder || "";
      setSummary(typeIcon("ASN"), "AS" + n, [holder && `<span class="nt-chip">${esc(holder)}</span>`, `<span class="nt-chip ${d.announced ? "ok" : ""}">${d.announced ? "Announced" : "Not announced"}</span>`]);
      c.as.set(d.holder ? "found" : "empty", d.holder || "No data", NT.kv([
        ["AS number", `AS${n}`, `AS${n}`],
        ["Holder", esc(d.holder || "Unknown")],
        ["Visible in BGP", d.announced ? `<span class="nt-chip ok">Yes</span>` : `<span class="nt-chip">No</span>`],
        d.block && ["AS block", esc(`${d.block.resource} · ${d.block.desc || d.block.name || ""}`)],
        ["Tools", `<a href="https://bgp.tools/as/${n}" target="_blank" rel="noopener noreferrer">bgp.tools</a> · <a href="https://www.peeringdb.com/asn/${n}" target="_blank" rel="noopener noreferrer">PeeringDB</a> · <a href="https://stat.ripe.net/AS${n}" target="_blank" rel="noopener noreferrer">RIPEstat</a>`],
      ]));
    }).catch((e) => c.as.set("error", "Lookup failed", fail(e, "AS")));

    rdap("autnum", n).then((j) => {
      const org = vcard(findRole(j.entities, "registrant") || findRole(j.entities, "administrative")), abuse = vcard(findRole(j.entities, "abuse"));
      c.reg.set("found", j.name || "Registered", NT.kv([
        ["Name", esc(j.name || "")],
        ["Handle", esc(j.handle || "")],
        j.country && ["Country", `${NT.flag(j.country)} ${esc(NT.country(j.country))}`],
        (org.org || org.fn) && ["Organisation", esc(org.org || org.fn)],
        abuse.email && ["Abuse email", `<a href="mailto:${esc(abuse.email)}">${esc(abuse.email)}</a>`, abuse.email],
        event(j, "registration") && ["Registered", NT.date(event(j, "registration"))],
        sourceRow(j),
      ]) + raw(j));
    }).catch((e) => c.reg.set("error", "Lookup failed", fail(e, "AS registration")));

    NT.fetchJSON(RIPE("announced-prefixes", "AS" + n), { timeout: 20000 }).then((r) => {
      const list = ((r.data || {}).prefixes || []).map((p) => p.prefix);
      const v4 = list.filter((p) => !p.includes(":")), v6 = list.filter((p) => p.includes(":"));
      if (!list.length) { c.pfx.set("empty", "No prefixes announced", ""); return; }
      c.pfx.set("found", `${NT.num(v4.length)} IPv4 · ${NT.num(v6.length)} IPv6`,
        `<p class="nt-note" style="margin-bottom:.6rem">Prefixes seen announced by AS${n} in the last two weeks (RIPEstat default window).</p>` + NT.recordList([...v4, ...v6].map((p) => ({ html: `<a href="${esc(NT.link("whois", p))}" data-pfx="${esc(p)}">${esc(p)}</a>`, copy: p })), { clampAt: 24 }));
      c.pfx.querySelectorAll("[data-pfx]").forEach((a) => a.addEventListener("click", (e) => { if (e.ctrlKey || e.metaKey) return; e.preventDefault(); input.value = a.dataset.pfx; run(); }));
    }).catch((e) => c.pfx.set("error", "Lookup failed", fail(e, "prefix")));
  }

  /* ---------- dispatch ---------- */
  function classify(raw) {
    const s = raw.trim().replace(/^\[|\]$/g, "");
    let m;
    if ((m = /^as\s?(\d{1,10})$/i.exec(s)) || (m = /^(\d{1,10})$/.exec(s))) return { kind: "asn", n: m[1] };
    if ((m = /^([^/\s]+)\/(\d{1,3})$/.exec(s)) && (NT.isIPv4(m[1]) || NT.expandV6(m[1]))) {
      const max = NT.isIPv4(m[1]) ? 32 : 128;
      if (+m[2] > max) return { error: `/${m[2]} is too long for this address family.` };
      return { kind: "ip", ip: m[1], prefix: +m[2] };
    }
    if (NT.isIPv4(s) || (s.includes(":") && NT.expandV6(s))) return { kind: "ip", ip: s };
    const d = NT.cleanDomain(s);
    if (NT.isDomain(d)) return { kind: "domain", d };
    return { error: s ? `"${s}" isn't a domain, IP address, prefix or AS number.` : "Enter a domain, IP address, prefix or AS number." };
  }
  function run() {
    const x = classify(input.value);
    if (x.error) { hint.textContent = x.error; hint.classList.add("bad"); return; }
    hint.classList.remove("bad"); hint.textContent = "";
    const q = x.kind === "asn" ? "AS" + x.n : x.kind === "ip" ? x.ip + (x.prefix != null ? "/" + x.prefix : "") : x.d;
    input.value = q; NT.setQuery(q);
    btn.disabled = true; setTimeout(() => { btn.disabled = false; }, 800);
    if (x.kind === "asn") lookupASN(x.n);
    else if (x.kind === "ip") lookupIP(x.ip, x.prefix);
    else lookupDomain(x.d);
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
  input.value = NT.query() || "wikipedia.org";
  run();
});
