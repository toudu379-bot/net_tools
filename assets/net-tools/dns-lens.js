/* DNS Lens — every DNS record type for a name, over DNS-over-HTTPS. */
NT.register("dns", function (root) {
  const { esc, $, doh } = NT;
  const TYPES = [
    { t: "A",      d: "IPv4 address",                 common: true },
    { t: "AAAA",   d: "IPv6 address",                 common: true },
    { t: "CNAME",  d: "Alias to another name",        common: true },
    { t: "MX",     d: "Mail servers",                 common: true },
    { t: "NS",     d: "Authoritative nameservers",    common: true },
    { t: "TXT",    d: "Text, SPF and verification",   common: true },
    { t: "SOA",    d: "Start of authority",           common: true },
    { t: "CAA",    d: "Allowed certificate issuers",  common: true },
    { t: "SRV",    d: "Service location" },
    { t: "PTR",    d: "Reverse lookup" },
    { t: "HTTPS",  d: "HTTPS service binding" },
    { t: "SVCB",   d: "General service binding" },
    { t: "DS",     d: "DNSSEC delegation signer" },
    { t: "DNSKEY", d: "DNSSEC public keys" },
    { t: "TLSA",   d: "DANE certificate association" },
    { t: "NAPTR",  d: "Naming authority pointer" },
  ];

  root.innerHTML = NT.hero("DNS lookup", "DNS Lens", "Look up every record type for a domain in one go. Enter an IP address to get its reverse (PTR) record.") + `
    <form class="nt-panel" autocomplete="off">
      <label class="nt-label" for="nt-dns-q">Domain or IP address</label>
      <div class="nt-row">
        <input class="nt-input nt-grow" id="nt-dns-q" type="text" spellcheck="false" autocapitalize="off" placeholder="example.com">
        <select class="nt-select" id="nt-dns-resolver" aria-label="Resolver">
          ${Object.entries(NT.RESOLVERS).map(([k, r]) => `<option value="${k}">${r.name} ${r.ip}</option>`).join("")}
        </select>
        <button class="nt-btn" type="submit">Look up</button>
      </div>
      <div class="nt-cmd"><code aria-label="Equivalent dig command"></code><button class="nt-ghost" type="button" data-act="copy-dig">Copy command</button></div>
      <p class="nt-hint"></p>
    </form>
    <div class="nt-bar">
      <div class="nt-tally" aria-live="polite"></div>
      <div class="nt-leds" aria-label="Record type overview"></div>
      <div class="nt-presets">
        <button class="nt-ghost" type="button" data-preset="common">Common types</button>
        <button class="nt-ghost" type="button" data-preset="all">Turn all on</button>
        <button class="nt-ghost" type="button" data-preset="none">Turn all off</button>
      </div>
    </div>
    <section class="nt-grid" aria-label="DNS records"></section>
    <p class="nt-foot">Queries go straight from your browser to the selected resolver over DNS-over-HTTPS. Nothing is stored except your switch settings.</p>`;

  const form = $(root, "form"), input = $(root, "#nt-dns-q"), resolverSel = $(root, "#nt-dns-resolver");
  const hint = $(root, ".nt-hint"), dig = $(root, ".nt-cmd code"), grid = $(root, ".nt-grid"), leds = $(root, ".nt-leds"), btn = $(root, ".nt-btn");
  let enabled = new Set(NT.store.get("dns-enabled", TYPES.filter((x) => x.common).map((x) => x.t)));
  const cards = {}, state = {};
  let runId = 0, current = null;

  for (const T of TYPES) {
    const c = NT.card({ tag: T.t, title: T.d, toggle: true, checked: enabled.has(T.t) });
    const led = document.createElement("button");
    led.type = "button"; led.className = "nt-led"; led.textContent = T.t; led.title = T.t;
    led.addEventListener("click", () => c.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }));
    c.led = led; leds.appendChild(led); grid.appendChild(c); cards[T.t] = c;
    c.switch.addEventListener("change", () => {
      c.switch.checked ? enabled.add(T.t) : enabled.delete(T.t);
      NT.store.set("dns-enabled", [...enabled]);
      if (c.switch.checked && current) lookupOne(T, current, runId);
      else set(T.t, c.switch.checked ? "idle" : "off");
      updateDig();
    });
    set(T.t, enabled.has(T.t) ? "idle" : "off");
  }

  function set(type, st, status, body) {
    state[type] = st;
    const c = cards[type];
    c.classList.toggle("wide", st === "found" && c._n > 4);
    const text = status != null ? status : st === "off" ? "Off. Switch on to include it." : st === "skip" ? "Not used for IP addresses." : st === "loading" ? "Looking up" : "Ready";
    c.set(st === "skip" ? "off" : st, text, body !== undefined ? body : st === "loading" ? undefined : "");
    tally();
  }
  function tally() {
    const n = { found: 0, empty: 0, error: 0 };
    for (const k in state) if (n[state[k]] != null) n[state[k]]++;
    $(root, ".nt-tally").innerHTML = `<span><i class="nt-dot ok"></i><strong>${n.found}</strong> found</span>
      <span><i class="nt-dot"></i><strong>${n.empty}</strong> empty</span><span><i class="nt-dot err"></i><strong>${n.error}</strong> failed</span>`;
  }

  function parse(raw) {
    let s = raw.trim();
    if (!s) return { error: "Enter a domain name or IP address." };
    s = s.replace(/^[a-z]+:\/\//i, "").replace(/[\/?#].*$/, "").replace(/^.*@/, "");
    if (NT.isIPv4(s)) return { ip: true, display: s, name: s.split(".").reverse().join(".") + ".in-addr.arpa" };
    const v6 = s.includes(":") && NT.expandV6(s);
    if (v6) return { ip: true, display: s.replace(/^\[|\]$/g, ""), name: v6.replace(/:/g, "").split("").reverse().join(".") + ".ip6.arpa" };
    const d = NT.cleanDomain(s);
    if (!NT.isDomain(d)) return { error: `"${raw.trim()}" doesn't look like a domain name. Use a form like example.com.` };
    return { ip: false, display: d, name: d };
  }

  function updateDig() {
    const p = parse(input.value), ip = NT.RESOLVERS[resolverSel.value].ip;
    if (p.error) { dig.innerHTML = `dig @${ip} …`; return; }
    if (p.ip) { dig.innerHTML = `dig @${ip} <b>-x ${esc(p.display)}</b> +noall +answer`; return; }
    const types = TYPES.filter((T) => enabled.has(T.t)).map((T) => T.t);
    dig.innerHTML = types.length ? `dig @${ip} +noall +answer ` + types.map((t) => `<b>${esc(p.name)}</b> <i>${t}</i>`).join(" ") : `dig @${ip} <b>${esc(p.name)}</b> <i>(switch on a record type)</i>`;
  }

  function hexBytes(data) {
    const m = /^\\#\s+\d+\s+([0-9a-f\s]+)$/i.exec(String(data).trim());
    if (!m) return null;
    const hex = m[1].replace(/\s+/g, ""), out = [];
    for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
    return out;
  }
  function fmt(type, data) {
    data = String(data);
    switch (type) {
      case "A": case "AAAA":
        return { html: `${esc(data)} <a class="nt-ttl" href="${esc(NT.link("whois", data))}" title="WHOIS and location for ${esc(data)}">whois</a>`, copy: data };
      case "MX": { const [p, ...h] = data.split(/\s+/); return { sort: +p, html: `<span class="nt-pri">${esc(p)}</span>${esc(h.join(" "))}`, copy: h.join(" ") }; }
      case "SRV": { const [p, w, port, target] = data.split(/\s+/); return { sort: +p, html: `<span class="nt-pri">${esc(p)}</span>${esc(target)}:${esc(port)} <span class="nt-ttl">weight ${esc(w)}</span>`, copy: data }; }
      case "TXT": { const t = NT.txt(data); return { html: esc(t), copy: t }; }
      case "CAA": {
        const b = hexBytes(data);
        if (b) { const tl = b[1], s = `${b[0]} ${String.fromCharCode(...b.slice(2, 2 + tl))} "${String.fromCharCode(...b.slice(2 + tl))}"`; return { html: esc(s), copy: s }; }
        return { html: esc(data), copy: data };
      }
      default: return { html: esc(data), copy: data };
    }
  }
  function soa(data) {
    const f = data.split(/\s+/), L = ["Primary NS", "Admin", "Serial", "Refresh", "Retry", "Expire", "Min TTL"];
    return NT.kv(L.map((l, i) => [l, esc(i > 2 && f[i] ? `${f[i]} (${NT.ttl(+f[i])})` : f[i] || "")]));
  }

  async function lookupOne(T, q, id) {
    const c = cards[T.t];
    if (q.ip && T.t !== "PTR") { set(T.t, "skip"); return; }
    set(T.t, "loading");
    try {
      const r = await doh(q.name, T.t, resolverSel.value);
      if (id !== runId) return;
      const ms = ` · ${r.ms} ms`;
      if (r.status !== 0) {
        const [m, h] = NT.RCODES[r.status] || [`The resolver returned error code ${r.status}.`, "Try another resolver."];
        set(T.t, "error", "Lookup failed" + ms, NT.msg("err", esc(m), esc(h))); return;
      }
      const via = r.chain.length ? `<p class="nt-via">via CNAME ${r.chain.map((x) => `<code>${esc(x.data)}</code>`).join(" → ")}</p>` : "";
      c._n = r.answers.length;
      if (!r.answers.length) { set(T.t, "empty", `No ${T.t} records${ms}`, via); return; }
      const n = r.answers.length, status = `${n} record${n > 1 ? "s" : ""} found${ms}`;
      if (T.t === "SOA") { set(T.t, "found", status, via + soa(r.answers[0].data) + `<p class="nt-note" style="margin-top:.5rem">TTL ${NT.ttl(r.answers[0].TTL)}</p>`); return; }
      const rows = r.answers.map((a) => Object.assign(fmt(T.t, a.data), { ttl: a.TTL }));
      if (rows[0].sort != null) rows.sort((a, b) => a.sort - b.sort);
      set(T.t, "found", status, via + NT.recordList(rows));
    } catch (e) {
      if (id !== runId) return;
      set(T.t, "error", "Lookup failed", NT.msg("err", esc(e.message), esc(e.hint)));
    }
  }

  async function run() {
    const p = parse(input.value);
    if (p.error) { hint.textContent = p.error; hint.classList.add("bad"); input.focus(); return; }
    hint.classList.remove("bad");
    hint.textContent = p.ip ? `Reverse lookup for ${p.display} → ${p.name}` : `Showing records for ${p.name}`;
    if (p.ip && !enabled.has("PTR")) { enabled.add("PTR"); cards.PTR.switch.checked = true; NT.store.set("dns-enabled", [...enabled]); }
    current = p; NT.setQuery(p.display);
    const id = ++runId;
    btn.disabled = true; btn.textContent = "Looking up…";
    await Promise.allSettled(TYPES.map((T) => (enabled.has(T.t) ? lookupOne(T, p, id) : set(T.t, "off"))));
    if (id === runId) { btn.disabled = false; btn.textContent = "Look up"; }
    updateDig();
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
  input.addEventListener("input", updateDig);
  resolverSel.addEventListener("change", () => { NT.store.set("dns-resolver", resolverSel.value); updateDig(); if (current) run(); });
  $(root, "[data-act=copy-dig]").addEventListener("click", () => NT.copy(dig.textContent, "Copied command"));
  root.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    const p = b.dataset.preset;
    enabled = new Set(p === "all" ? TYPES.map((T) => T.t) : p === "common" ? TYPES.filter((T) => T.common).map((T) => T.t) : []);
    NT.store.set("dns-enabled", [...enabled]);
    TYPES.forEach((T) => (cards[T.t].switch.checked = enabled.has(T.t)));
    if (current && enabled.size) run(); else TYPES.forEach((T) => set(T.t, enabled.has(T.t) ? "idle" : "off"));
    updateDig();
  }));

  resolverSel.value = NT.store.get("dns-resolver", "cf");
  input.value = NT.query() || "cloudflare.com";
  updateDig();
  run();
});
