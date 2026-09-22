/* Email security checker — MX, SPF (10-lookup budget), DMARC, DKIM, BIMI, MTA-STS, TLS-RPT. */
NT.register("email", function (root) {
  const { esc, $ } = NT;
  const COMMON_SELECTORS = ["google", "selector1", "selector2", "default", "dkim", "mail", "k1", "k2", "k3", "s1", "s2", "key1", "key2",
    "mandrill", "mxvault", "zoho", "protonmail", "protonmail2", "protonmail3", "fm1", "fm2", "fm3", "sig1", "smtp", "mailjet", "everlytickey1", "cm"];
  const MX_PROVIDERS = [
    [/google\.com\.?$|googlemail\.com\.?$/i, "Google Workspace"], [/mail\.protection\.outlook\.com\.?$/i, "Microsoft 365"],
    [/protonmail\.ch\.?$/i, "Proton Mail"], [/zoho\.(com|eu|in)\.?$/i, "Zoho Mail"], [/mimecast\.com\.?$/i, "Mimecast"],
    [/pphosted\.com\.?$/i, "Proofpoint"], [/mx\.cloudflare\.net\.?$/i, "Cloudflare Email Routing"], [/messagingengine\.com\.?$/i, "Fastmail"],
    [/icloud\.com\.?$/i, "iCloud Mail"], [/yandex\.(net|ru)\.?$/i, "Yandex"], [/amazonaws\.com\.?$/i, "Amazon SES"],
    [/barracudanetworks\.com\.?$/i, "Barracuda"], [/secureserver\.net\.?$/i, "GoDaddy"], [/ovh\.net\.?$/i, "OVHcloud"],
  ];

  root.innerHTML = NT.hero("Email authentication", "Email security check",
    "Check whether a domain's mail setup stops spoofing: MX, SPF and its 10-lookup limit, DMARC policy, DKIM keys, BIMI, MTA-STS and TLS-RPT.") + `
    <form class="nt-panel" autocomplete="off">
      <label class="nt-label" for="nt-em-q">Domain</label>
      <div class="nt-row">
        <input class="nt-input nt-grow" id="nt-em-q" type="text" spellcheck="false" autocapitalize="off" placeholder="example.com">
        <button class="nt-btn" type="submit">Check domain</button>
      </div>
      <div class="nt-row" style="margin-top:.85rem; align-items:center">
        <div class="nt-grow">
          <label class="nt-label" for="nt-em-sel">DKIM selectors <span style="text-transform:none; letter-spacing:0; font-weight:500">(optional, comma separated)</span></label>
          <input class="nt-input nt-sm" id="nt-em-sel" type="text" spellcheck="false" autocapitalize="off" placeholder="selector1, google">
        </div>
        <label class="nt-row" style="align-items:center; gap:.6rem; cursor:pointer; margin-top:1.3rem">
          <span class="nt-switch"><input type="checkbox" id="nt-em-common" role="switch" checked><span class="nt-track"></span></span>
          <span class="nt-note">Also try ${COMMON_SELECTORS.length} common selectors</span>
        </label>
      </div>
      <p class="nt-hint">A DKIM selector is the name before <code>._domainkey</code> in a signed email's <code>DKIM-Signature</code> header (the <code>s=</code> value).</p>
    </form>
    <div data-slot="verdict"></div>
    <section class="nt-grid" aria-label="Checks"></section>
    <p class="nt-foot">Checks use DNS-over-HTTPS from your browser. The MTA-STS policy file and real TLS support on your mail servers can't be read from a browser, so only their DNS records are checked.</p>`;

  const form = $(root, "form"), input = $(root, "#nt-em-q"), selInput = $(root, "#nt-em-sel"), common = $(root, "#nt-em-common");
  const grid = $(root, ".nt-grid"), hint = $(root, ".nt-hint"), btn = $(root, ".nt-btn");
  const HINT = hint.innerHTML;
  const C = {
    mx:    NT.card({ tag: "MX",      title: "Mail servers" }),
    spf:   NT.card({ tag: "SPF",     title: "Who may send mail" }),
    dmarc: NT.card({ tag: "DMARC",   title: "Policy for failing mail" }),
    dkim:  NT.card({ tag: "DKIM",    title: "Message signing keys" }),
    sts:   NT.card({ tag: "MTA-STS", title: "Enforced TLS for incoming mail" }),
    rpt:   NT.card({ tag: "TLS-RPT", title: "TLS failure reports" }),
    bimi:  NT.card({ tag: "BIMI",    title: "Brand logo in inboxes" }),
  };
  C.spf.classList.add("wide"); C.dkim.classList.add("wide");
  Object.values(C).forEach((c) => grid.appendChild(c));
  selInput.value = NT.store.get("email-selectors", "");
  common.checked = NT.store.get("email-common", true);

  /* ---------- DNS helpers ---------- */
  async function txt(name) {
    try {
      const r = await NT.doh(name, "TXT");
      if (r.status === 3) return { nx: true, list: [] };
      if (r.status !== 0) return { error: (NT.RCODES[r.status] || ["Lookup failed."])[0], list: [] };
      return { list: r.answers.map((a) => NT.txt(a.data)), chain: r.chain };
    } catch (e) {
      try { // one retry through a second resolver
        const r = await NT.doh(name, "TXT", "google");
        return { list: r.status === 0 ? r.answers.map((a) => NT.txt(a.data)) : [], nx: r.status === 3 };
      } catch (e2) { return { error: e.message, list: [] }; }
    }
  }
  const tags = (rec) => Object.fromEntries(rec.split(";").map((p) => p.trim()).filter(Boolean).map((p) => { const i = p.indexOf("="); return i < 0 ? [p.toLowerCase(), ""] : [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()]; }));

  /* ---------- MX ---------- */
  async function checkMX(d) {
    C.mx.set("loading", "Looking up");
    let r;
    try { r = await NT.doh(d, "MX"); } catch (e) { C.mx.set("error", "Lookup failed", NT.msg("err", esc(e.message), esc(e.hint))); return { error: true }; }
    if (r.status === 3) { C.mx.set("error", "Domain not found", NT.msg("err", `${esc(d)} does not exist (NXDOMAIN).`, "Check the spelling.")); return { nx: true }; }
    const mx = r.answers.map((a) => { const [p, ...h] = String(a.data).split(/\s+/); return { p: +p, host: h.join(" "), ttl: a.TTL }; }).sort((a, b) => a.p - b.p);
    if (!mx.length) {
      C.mx.set("warn", "No MX records", NT.msg("warn", "This domain has no MX records.", "Senders fall back to the domain's A record, which rarely runs a mail server. If the domain never receives mail, publish a null MX (0 .)."));
      return { none: true };
    }
    if (mx.length === 1 && (mx[0].host === "." || mx[0].host === "")) {
      C.mx.set("found", "Null MX: domain accepts no mail", NT.msg("info", "A null MX (RFC 7505) says this domain never receives email.", "That's correct for domains that only send, or don't use email at all."));
      return { nullMx: true };
    }
    const providers = [...new Set(mx.map((m) => (MX_PROVIDERS.find(([re]) => re.test(m.host)) || [])[1]).filter(Boolean))];
    C.mx.set("found", `${mx.length} mail server${mx.length > 1 ? "s" : ""}`,
      (providers.length ? `<div class="nt-chips" style="margin-bottom:.6rem">${providers.map((p) => `<span class="nt-chip ok">${esc(p)}</span>`).join("")}</div>` : "") +
      NT.recordList(mx.map((m) => ({ html: `<span class="nt-pri">${m.p}</span>${esc(m.host)}`, ttl: m.ttl, copy: m.host })), { one: true }));
    return { mx, providers };
  }

  /* ---------- SPF ---------- */
  const LOOKUP_MECHS = new Set(["include", "a", "mx", "ptr", "exists", "redirect"]);
  async function spfNode(domain, ctx, depth) {
    const node = { domain, terms: [], issues: [] };
    if (ctx.seen.has(domain)) { node.issues.push(["err", `Loop: ${domain} is included more than once in the chain.`]); return node; }
    ctx.seen.add(domain);
    if (depth > 10) { node.issues.push(["err", "Include chain is deeper than 10 levels."]); return node; }
    const r = await txt(domain);
    if (r.error) { node.issues.push(["err", `Could not look up ${domain}: ${r.error}`]); return node; }
    const recs = r.list.filter((t) => /^v=spf1(\s|$)/i.test(t));
    if (!recs.length) { node.missing = true; return node; }
    if (recs.length > 1) node.issues.push(["err", `${domain} publishes ${recs.length} SPF records. Receivers treat this as a permanent error (permerror).`]);
    node.record = recs[0];
    const parts = recs[0].split(/\s+/).slice(1).filter(Boolean);
    let hasAll = false;
    for (const raw of parts) {
      const m = /^([+\-~?]?)([a-z0-9]+)(?:[:=](.*))?$/i.exec(raw);
      if (!m) { node.terms.push({ raw, cost: 0, bad: "Not a valid SPF term." }); continue; }
      const [, q, mechRaw, arg] = m, mech = mechRaw.toLowerCase();
      const cost = LOOKUP_MECHS.has(mech) ? 1 : 0;
      ctx.count += cost;
      const term = { raw, q, mech, arg, cost };
      if (mech === "all") {
        hasAll = true;
        term.all = q || "+";
        if (depth === 0) ctx.all = term.all;
      } else if (mech === "ptr") term.warn = "ptr is deprecated (RFC 7208) and slow; most receivers ignore it.";
      else if ((mech === "include" || mech === "redirect") && arg) {
        if (/%\{/.test(arg)) term.warn = "Contains SPF macros, which can't be expanded here.";
        else if (mech === "redirect" && parts.some((p) => /^[+\-~?]?all$/i.test(p))) term.warn = "redirect is ignored because the record has an all mechanism.";
        else {
          term.child = await spfNode(arg.toLowerCase().replace(/\.$/, ""), ctx, depth + 1);
          if (term.child.missing) { term.bad = `${arg} has no SPF record, so this ${mech} fails (permerror).`; ctx.voids++; }
          if (mech === "redirect" && depth === 0 && term.child.all) ctx.all = term.child.all;
        }
      } else if (!["ip4", "ip6", "a", "mx", "exists", "exp"].includes(mech)) term.bad = `Unknown mechanism "${mech}".`;
      node.terms.push(term);
    }
    node.all = hasAll ? (node.terms.find((t) => t.all) || {}).all : null;
    return node;
  }
  function spfTreeHTML(node) {
    const li = node.terms.map((t) => {
      const cost = `<span class="cost${t.cost ? "" : " zero"}" title="${t.cost ? "Uses 1 DNS lookup" : "No DNS lookup"}">${t.cost}</span>`;
      const note = t.bad ? ` <span class="bad">— ${esc(t.bad)}</span>` : t.warn ? ` <span class="nt-note">— ${esc(t.warn)}</span>` : "";
      const sub = t.child && !t.child.missing ? `<ul>${spfTreeHTML(t.child)}</ul>` : "";
      return `<li>${cost}${esc(t.raw)}${note}${sub}</li>`;
    }).join("");
    return li + node.issues.map(([k, m]) => `<li class="${k === "err" ? "bad" : ""}">${esc(m)}</li>`).join("");
  }
  function collectIssues(node, out) {
    node.issues.forEach((i) => out.push(i));
    node.terms.forEach((t) => { if (t.bad) out.push(["err", t.bad]); if (t.child) collectIssues(t.child, out); });
    return out;
  }
  async function checkSPF(d) {
    C.spf.set("loading", "Reading SPF and following includes");
    const ctx = { count: 0, seen: new Set(), voids: 0, all: null };
    const tree = await spfNode(d, ctx, 0);
    if (tree.missing) {
      C.spf.set("error", "No SPF record", NT.msg("err", "No SPF record found.", "Anyone can send mail claiming to be from this domain. Publish a TXT record such as <code>v=spf1 include:_spf.google.com -all</code>, or <code>v=spf1 -all</code> if the domain sends no mail."));
      return { missing: true };
    }
    const issues = collectIssues(tree, []);
    const n = ctx.count;
    const meterCls = n > 10 ? "err" : n >= 8 ? "warn" : "";
    const allMsg = {
      "-": ["ok", "Ends in <code>-all</code>: mail from anywhere else fails SPF."],
      "~": ["ok", "Ends in <code>~all</code> (soft fail): unlisted senders are marked suspicious. Fine alongside an enforced DMARC policy."],
      "?": ["warn", "Ends in <code>?all</code> (neutral): SPF says nothing about unlisted senders."],
      "+": ["err", "Ends in <code>+all</code>: every server on the internet is allowed to send as this domain."],
    }[ctx.all] || ["warn", "No <code>all</code> mechanism at the end, so unlisted senders get a neutral result."];
    const msgs = [];
    if (n > 10) msgs.push(NT.msg("err", `Uses ${n} DNS lookups. The limit is 10, so receivers return a permanent error and SPF fails for all mail.`, "Remove unused includes, or replace includes with ip4:/ip6: ranges."));
    else if (n >= 8) msgs.push(NT.msg("warn", `Uses ${n} of 10 DNS lookups. One more include from a provider could break SPF.`));
    else msgs.push(NT.msg("ok", `Uses ${n} of 10 DNS lookups.`));
    if (ctx.voids > 2) msgs.push(NT.msg("err", `${ctx.voids} includes point to names without SPF (void lookups). More than 2 is a permanent error.`));
    msgs.push(NT.msg(allMsg[0], allMsg[1]));
    issues.filter(([k]) => k === "err").slice(0, 4).forEach(([, m]) => msgs.push(NT.msg("err", esc(m))));
    const state = n > 10 || ctx.all === "+" || issues.some(([k]) => k === "err") ? "error" : n >= 8 || !["-", "~"].includes(ctx.all) ? "warn" : "found";
    C.spf.set(state, `${n} of 10 DNS lookups`, `
      <div class="nt-rec" style="margin-bottom:.7rem"><span class="nt-val">${esc(tree.record)}</span>${NT.copyBtn(tree.record, "SPF record")}</div>
      <div class="nt-meter ${meterCls}" aria-label="${n} of 10 DNS lookups used">${Array.from({ length: Math.max(10, n) }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</div>
      <div class="nt-msgs" style="margin-bottom:.8rem">${msgs.join("")}</div>
      <p class="nt-section-title">Include tree <span class="nt-note" style="text-transform:none; letter-spacing:0; font-weight:500">number = DNS lookups used</span></p>
      <ul class="nt-tree">${spfTreeHTML(tree)}</ul>`);
    return { count: n, all: ctx.all, state };
  }

  /* ---------- DMARC ---------- */
  async function checkDMARC(d) {
    C.dmarc.set("loading", "Looking up");
    let at = d, r = await txt("_dmarc." + d), inherited = false;
    let recs = r.list.filter((t) => /^v=DMARC1\s*(;|$)/i.test(t));
    const labels = d.split(".");
    if (!recs.length && labels.length > 2) {
      at = labels.slice(-2).join(".");
      r = await txt("_dmarc." + at);
      recs = r.list.filter((t) => /^v=DMARC1\s*(;|$)/i.test(t));
      inherited = recs.length > 0;
    }
    if (!recs.length) {
      C.dmarc.set("error", "No DMARC record", NT.msg("err", "No DMARC record found.", `Receivers have no instruction for mail that fails SPF and DKIM, so spoofed mail is often delivered. Start with a TXT record at <code>_dmarc.${esc(d)}</code>: <code>v=DMARC1; p=none; rua=mailto:dmarc@${esc(d)}</code>, then move to quarantine or reject.`));
      return { missing: true };
    }
    if (recs.length > 1) { C.dmarc.set("error", "More than one DMARC record", NT.msg("err", `Found ${recs.length} DMARC records. Receivers ignore DMARC entirely when there is more than one.`)); return { error: true }; }
    const t = tags(recs[0]);
    const p = (t.p || "").toLowerCase(), sp = (t.sp || "").toLowerCase(), pct = t.pct != null ? +t.pct : 100;
    const policy = inherited && sp ? sp : p;
    const msgs = [];
    if (inherited) msgs.push(NT.msg("info", `No record at _dmarc.${esc(d)}, so the organisational domain's policy applies (${esc(at)}${sp ? ", subdomain policy sp=" + esc(sp) : ""}).`));
    if (!["none", "quarantine", "reject"].includes(p)) msgs.push(NT.msg("err", "The p= tag is missing or invalid, so the record is ignored."));
    else if (policy === "none") msgs.push(NT.msg("warn", "p=none only monitors. Spoofed mail is still delivered.", "Once reports show your real senders pass, move to p=quarantine and then p=reject."));
    else if (policy === "quarantine") msgs.push(NT.msg("ok", "p=quarantine: mail that fails is sent to spam."));
    else msgs.push(NT.msg("ok", "p=reject: mail that fails is refused. This is the strongest setting."));
    if (pct < 100 && policy !== "none") msgs.push(NT.msg("warn", `pct=${pct}: the policy applies to only ${pct}% of failing mail.`));
    if (!t.rua) msgs.push(NT.msg("warn", "No rua= address, so you get no aggregate reports about who sends as your domain."));
    const LABEL = { v: "Version", p: "Policy", sp: "Subdomain policy", pct: "Percentage", rua: "Aggregate reports to", ruf: "Forensic reports to", adkim: "DKIM alignment", aspf: "SPF alignment", fo: "Failure options", ri: "Report interval" };
    const nice = (k, v) => (k === "adkim" || k === "aspf") ? (v === "s" ? "strict" : "relaxed") : k === "ri" ? NT.ttl(+v) : v;
    const state = !["none", "quarantine", "reject"].includes(p) ? "error" : policy === "none" || pct < 100 ? "warn" : "found";
    C.dmarc.set(state, `Policy: ${policy || "missing"}${pct < 100 ? ` (${pct}%)` : ""}`,
      `<div class="nt-rec" style="margin-bottom:.7rem"><span class="nt-val">${esc(recs[0])}</span>${NT.copyBtn(recs[0], "DMARC record")}</div>
       <div class="nt-msgs" style="margin-bottom:.6rem">${msgs.join("")}</div>
       ${NT.kv(Object.entries(t).filter(([k]) => k !== "v").map(([k, v]) => [LABEL[k] || k, esc(nice(k, v))]))}`);
    return { policy, pct, state };
  }

  /* ---------- DKIM ---------- */
  function b64bytes(s) { try { const bin = atob(s.replace(/\s+/g, "")); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); } catch (e) { return null; } }
  function rsaBits(b) {
    // Minimal DER walk: SubjectPublicKeyInfo or bare RSAPublicKey -> modulus bit length.
    let pos = 0;
    const tlv = () => {
      const tag = b[pos++]; let len = b[pos++];
      if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = (len << 8) | b[pos++]; }
      return { tag, len, start: pos };
    };
    try {
      let t = tlv(); if (t.tag !== 0x30) return null;
      t = tlv();
      if (t.tag === 0x30) { pos = t.start + t.len; t = tlv(); if (t.tag !== 0x03) return null; pos++; t = tlv(); if (t.tag !== 0x30) return null; t = tlv(); }
      if (t.tag !== 0x02) return null;
      let s = t.start, len = t.len;
      while (len > 0 && b[s] === 0) { s++; len--; }
      return (len - 1) * 8 + (32 - Math.clz32(b[s]));
    } catch (e) { return null; }
  }
  async function checkDKIM(d) {
    const own = selInput.value.split(/[\s,;]+/).map((s) => s.trim().toLowerCase().replace(/\._domainkey.*$/, "")).filter(Boolean);
    const sels = [...new Set([...own, ...(common.checked ? COMMON_SELECTORS : [])])];
    if (!sels.length) { C.dkim.set("empty", "No selectors to try", NT.msg("info", "Enter a selector, or switch on common selectors.")); return { none: true }; }
    C.dkim.set("loading", `Trying ${sels.length} selector${sels.length > 1 ? "s" : ""}`);
    const results = await Promise.all(sels.map(async (s) => ({ s, r: await txt(`${s}._domainkey.${d}`) })));
    const keys = [];
    for (const { s, r } of results) {
      const rec = r.list.find((t) => /(^|;)\s*(v=DKIM1|k=|p=)/i.test(t));
      if (!rec) continue;
      const t = tags(rec), k = (t.k || "rsa").toLowerCase(), p = t.p || "";
      let bits = null, verdict, cls;
      if (!p) { verdict = "Key revoked (empty p=)"; cls = "warn"; }
      else if (k === "ed25519") { bits = 256; verdict = "Ed25519 key"; cls = "ok"; }
      else {
        const b = b64bytes(p); bits = b ? rsaBits(b) : null;
        if (!bits) { verdict = "Key could not be parsed"; cls = "err"; }
        else if (bits < 1024) { verdict = `${bits}-bit RSA: too weak, many receivers reject it`; cls = "err"; }
        else if (bits < 2048) { verdict = `${bits}-bit RSA: works, but 2048-bit is recommended`; cls = "warn"; }
        else { verdict = `${bits}-bit RSA`; cls = "ok"; }
      }
      keys.push({ s, rec, k, bits, verdict, cls, own: own.includes(s), via: r.chain && r.chain.length ? r.chain.map((c) => c.data).join(" → ") : "" });
    }
    const missingOwn = own.filter((s) => !keys.some((k) => k.s === s));
    if (!keys.length) {
      C.dkim.set("warn", "No DKIM key found", NT.msg("warn", `None of the ${sels.length} selectors tried has a DKIM key.`, "This doesn't prove DKIM is off: providers often use unique selectors. Find the s= value in a DKIM-Signature header of an email from this domain and enter it above."));
      return { none: true };
    }
    const worst = keys.some((k) => k.cls === "err") ? "error" : keys.every((k) => k.cls === "ok") ? "found" : keys.some((k) => k.cls === "ok") ? "found" : "warn";
    C.dkim.set(worst, `${keys.length} key${keys.length > 1 ? "s" : ""} found`,
      `<ul class="nt-records one">${keys.map((k) => `<li class="nt-rec"><span class="nt-val">
        <span class="nt-pri">${esc(k.s)}</span><span class="nt-chip ${k.cls}" style="vertical-align:1px">${esc(k.verdict)}</span>
        ${k.via ? `<br><span class="nt-note">via CNAME ${esc(k.via)}</span>` : ""}
        <br><span class="nt-note" style="font-size:.78rem">${esc(k.rec.length > 140 ? k.rec.slice(0, 140) + "…" : k.rec)}</span></span>${NT.copyBtn(k.rec, "DKIM record")}</li>`).join("")}</ul>
       ${missingOwn.length ? `<div style="margin-top:.6rem">${NT.msg("warn", `No key at: ${missingOwn.map((s) => `<code>${esc(s)}._domainkey</code>`).join(", ")}`)}</div>` : ""}
       <p class="nt-note" style="margin-top:.6rem">Tried ${sels.length} selector${sels.length > 1 ? "s" : ""}.</p>`);
    return { keys };
  }

  /* ---------- MTA-STS, TLS-RPT, BIMI ---------- */
  async function simple(card, name, re, what) {
    card.set("loading", "Looking up");
    const r = await txt(name);
    const recs = r.list.filter((t) => re.test(t));
    if (r.error) { card.set("error", "Lookup failed", NT.msg("err", esc(r.error))); return {}; }
    if (!recs.length) return { missing: true };
    if (recs.length > 1) { card.set("error", "More than one record", NT.msg("err", `Found ${recs.length} ${what} records; there must be exactly one.`)); return { error: true }; }
    return { rec: recs[0], t: tags(recs[0]) };
  }
  async function checkSTS(d) {
    const x = await simple(C.sts, `_mta-sts.${d}`, /^v=STSv1/i, "MTA-STS");
    const policyUrl = `https://mta-sts.${d}/.well-known/mta-sts.txt`;
    if (x.missing) { C.sts.set("empty", "Not set up", NT.msg("info", "Optional. MTA-STS makes other mail servers refuse to deliver to you without valid TLS, which blocks downgrade attacks.")); return x; }
    if (!x.rec) return x;
    C.sts.set(x.t.id ? "found" : "warn", x.t.id ? "Record found" : "Record has no id=",
      `<div class="nt-rec"><span class="nt-val">${esc(x.rec)}</span>${NT.copyBtn(x.rec)}</div>
       <p class="nt-note" style="margin-top:.6rem">The policy file (mode, allowed MX hosts) can't be read from a browser. Open it to check: <a href="${esc(policyUrl)}" target="_blank" rel="noopener">${esc(policyUrl)}</a></p>`);
    return x;
  }
  async function checkRPT(d) {
    const x = await simple(C.rpt, `_smtp._tls.${d}`, /^v=TLSRPTv1/i, "TLS-RPT");
    if (x.missing) { C.rpt.set("empty", "Not set up", NT.msg("info", "Optional. TLS-RPT sends you daily reports when other servers fail to deliver to you over TLS. Pairs with MTA-STS.")); return x; }
    if (!x.rec) return x;
    C.rpt.set(x.t.rua ? "found" : "warn", x.t.rua ? "Reports enabled" : "No rua= address",
      `<div class="nt-rec"><span class="nt-val">${esc(x.rec)}</span>${NT.copyBtn(x.rec)}</div>` + (x.t.rua ? `<p class="nt-note" style="margin-top:.5rem">Reports go to ${esc(x.t.rua)}</p>` : ""));
    return x;
  }
  async function checkBIMI(d, dmarc) {
    const x = await simple(C.bimi, `default._bimi.${d}`, /^v=BIMI1/i, "BIMI");
    if (x.missing) { C.bimi.set("empty", "Not set up", NT.msg("info", "Optional. BIMI shows your logo next to your mail in Gmail, Apple Mail and Yahoo. It needs DMARC at quarantine or reject.")); return x; }
    if (!x.rec) return x;
    const logo = x.t.l, enforced = dmarc && ["quarantine", "reject"].includes(dmarc.policy) && (dmarc.pct || 100) === 100;
    const msgs = [];
    if (!enforced) msgs.push(NT.msg("warn", "DMARC is not enforced (quarantine or reject at 100%), so inboxes won't show the logo."));
    if (!x.t.a) msgs.push(NT.msg("info", "No certificate (a=). Gmail and Apple Mail require a VMC or CMC certificate to show the logo."));
    C.bimi.set(enforced && logo ? "found" : "warn", logo ? "Logo published" : "No logo URL (l=)",
      `${logo && /^https:\/\//i.test(logo) ? `<div style="display:flex; gap:.9rem; align-items:center; margin-bottom:.7rem"><img src="${esc(logo)}" alt="BIMI logo" style="width:3.5rem; height:3.5rem; border-radius:50%; background:#fff; object-fit:contain; border:1px solid var(--nt-line)"><a href="${esc(logo)}" target="_blank" rel="noopener" class="nt-note" style="overflow-wrap:anywhere">${esc(logo)}</a></div>` : ""}
       <div class="nt-rec" style="margin-bottom:.6rem"><span class="nt-val">${esc(x.rec)}</span>${NT.copyBtn(x.rec)}</div><div class="nt-msgs">${msgs.join("")}</div>`);
    return x;
  }

  /* ---------- verdict ---------- */
  function verdict(d, r) {
    const el = $(root, "[data-slot=verdict]");
    const spfOk = r.spf && !r.spf.missing && r.spf.state !== "error";
    const pol = r.dmarc && r.dmarc.policy;
    const dkim = r.dkim && r.dkim.keys && r.dkim.keys.length;
    let grade, state, title, text;
    if (!r.dmarc || r.dmarc.missing || r.dmarc.error || (r.spf && r.spf.all === "+")) {
      grade = "F"; state = "error"; title = "Open to spoofing";
      text = "Without a working DMARC policy, receivers have no instruction to reject mail that fakes this domain.";
    } else if (pol === "none") {
      grade = spfOk ? "C" : "D"; state = "warn"; title = "Monitored, not protected";
      text = "DMARC is in monitoring mode (p=none), so spoofed mail still reaches inboxes. Move to quarantine or reject.";
    } else if (!spfOk && !dkim) {
      grade = "D"; state = "warn"; title = "Policy set, but nothing passes it";
      text = "DMARC is enforced, but SPF has problems and no DKIM key was found, so your own mail may be rejected.";
    } else if (pol === "quarantine" || r.dmarc.pct < 100) {
      grade = "B"; state = "found"; title = "Protected against spoofing";
      text = "Failing mail goes to spam. p=reject at 100% would refuse it outright.";
    } else {
      grade = "A"; state = "found"; title = "Strongly protected against spoofing";
      text = "DMARC rejects mail that fails authentication.";
    }
    const chip = (ok, warn, label) => `<span class="nt-chip ${ok ? "ok" : warn ? "warn" : "err"}">${label}</span>`;
    el.innerHTML = `<div class="nt-verdict" data-state="${state}">
      <div class="nt-grade" aria-label="Grade ${grade}">${grade}</div>
      <div class="nt-grow"><h2>${title}</h2><p>${text}</p></div>
      <div class="nt-chips">
        ${chip(r.spf && r.spf.state === "found", r.spf && r.spf.state === "warn", "SPF")}
        ${chip(r.dmarc && r.dmarc.state === "found", r.dmarc && r.dmarc.state === "warn", "DMARC")}
        ${chip(r.dkim && r.dkim.keys && r.dkim.keys.some((k) => k.cls === "ok"), !(r.dkim && r.dkim.keys), "DKIM")}
        ${chip(r.sts && r.sts.rec, true, "MTA-STS")}
      </div></div>`;
  }

  /* ---------- run ---------- */
  let runId = 0;
  async function run() {
    const d = NT.cleanDomain(input.value);
    if (!NT.isDomain(d)) { hint.textContent = input.value.trim() ? `"${input.value.trim()}" doesn't look like a domain. Use a form like example.com.` : "Enter a domain name."; hint.classList.add("bad"); return; }
    hint.classList.remove("bad"); hint.innerHTML = HINT;
    input.value = d; NT.setQuery(d);
    NT.store.set("email-selectors", selInput.value.trim()); NT.store.set("email-common", common.checked);
    const id = ++runId;
    btn.disabled = true; btn.textContent = "Checking…";
    $(root, "[data-slot=verdict]").innerHTML = "";
    const res = {};
    const mx = await checkMX(d);
    if (id !== runId) return;
    if (mx.nx) {
      Object.entries(C).forEach(([k, c]) => k !== "mx" && c.set("off", "Skipped", ""));
      btn.disabled = false; btn.textContent = "Check domain"; return;
    }
    [res.spf, res.dmarc, res.dkim, res.sts, res.rpt] = await Promise.all([checkSPF(d), checkDMARC(d), checkDKIM(d), checkSTS(d), checkRPT(d)]);
    if (id !== runId) return;
    res.bimi = await checkBIMI(d, res.dmarc);
    if (id !== runId) return;
    verdict(d, res);
    btn.disabled = false; btn.textContent = "Check domain";
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
  input.value = NT.query() || "google.com";
  run();
});
