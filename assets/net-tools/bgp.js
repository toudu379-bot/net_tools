/* BGP & routing — RIS looking glass, origin and upstream analysis, RPKI validity, IRR objects, update churn. */
NT.register("bgp", function (root) {
  const { esc, $ } = NT;

  root.innerHTML = NT.hero("Global routing", "BGP looking glass",
    "How a prefix looks from RIPE RIS route collectors: who announces it, which paths reach it, whether RPKI and the IRR agree, and how many peers see it.") + `
    <form class="nt-panel" autocomplete="off">
      <label class="nt-label" for="nt-bgp-q">IP address or prefix</label>
      <div class="nt-row">
        <input class="nt-input nt-grow" id="nt-bgp-q" type="text" spellcheck="false" autocapitalize="off" placeholder="1.1.1.0/24 or 8.8.8.8">
        <button class="nt-btn" type="submit">Look up</button>
      </div>
      <div class="nt-row" style="margin-top:.7rem; gap:.4rem" data-slot="examples"></div>
      <p class="nt-hint"></p>
    </form>
    <div data-slot="stats" class="nt-stats" style="margin-top:1.4rem"></div>
    <section class="nt-grid" aria-label="Routing data" style="margin-top:.9rem"></section>
    <p class="nt-foot">Data from RIPE RIS collectors through the RIPEstat API, updated every few minutes. This is what route collectors see, not a live view from any one router, and RIS peers are mostly large transit and IX networks.</p>`;

  const form = $(root, "form"), input = $(root, "#nt-bgp-q"), hint = $(root, ".nt-hint"), grid = $(root, ".nt-grid"), btn = $(root, ".nt-btn"), statsEl = $(root, "[data-slot=stats]");
  $(root, "[data-slot=examples]").innerHTML = ["1.1.1.0/24", "8.8.8.0/24", "193.0.0.0/21", "2a00:1450:4001::/48"]
    .map((x) => `<button class="nt-ghost" type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join("");
  root.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.ex; run(); }));

  const C = {};
  function cards() {
    grid.innerHTML = "";
    [["origin", "RPKI", "Origin and RPKI"], ["vis", "RIS", "Visibility"], ["up", "PATH", "Upstream networks"],
     ["irr", "IRR", "Route objects"], ["churn", "UPD", "Recent activity"], ["paths", "LG", "AS paths per peer", true]]
      .forEach(([k, tag, title, wide]) => { C[k] = NT.card({ tag, title }); if (wide) C[k].classList.add("wide"); grid.appendChild(C[k]); C[k].set("loading", "Loading"); });
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const asLink = (n) => `<a href="${esc(NT.link("whois", "AS" + n))}" target="_blank" rel="noopener">AS${n}</a>`;

  async function run() {
    const raw = input.value.trim().replace(/^\[|\]$/g, "");
    const m = /^([^/\s]+)(?:\/(\d{1,3}))?$/.exec(raw);
    const addr = m && m[1];
    if (!addr || !(NT.isIPv4(addr) || NT.expandV6(addr))) {
      hint.textContent = raw ? `"${raw}" isn't an IP address or prefix. Try 1.1.1.0/24 or 8.8.8.8.` : "Enter an IP address or prefix.";
      hint.classList.add("bad"); return;
    }
    hint.classList.remove("bad"); hint.textContent = "";
    NT.setQuery(raw);
    btn.disabled = true; btn.textContent = "Looking up…";
    cards();
    statsEl.innerHTML = "";

    let ov;
    try { ov = (await NT.fetchJSON(NT.ripe("prefix-overview", raw), { timeout: 20000 })).data || {}; }
    catch (e) {
      Object.values(C).forEach((c) => c.set("error", "Lookup failed", NT.msg("err", esc(e.message))));
      btn.disabled = false; btn.textContent = "Look up"; return;
    }
    const prefix = ov.resource || raw, asns = ov.asns || [], origin = asns[0] ? +asns[0].asn : 0;
    if (!ov.announced) {
      Object.values(C).forEach((c) => c.set("off", "Not applicable", ""));
      C.origin.set("empty", "Not announced", NT.msg("info", `No route covering ${esc(prefix)} is visible at any RIS collector, so there is nothing to look at.`,
        "Either the space isn't routed, or it is announced only inside a network RIS doesn't peer with."));
      btn.disabled = false; btn.textContent = "Look up"; return;
    }

    // everything else hangs off the announced prefix
    const jobs = {
      rpki: origin ? NT.rpki(origin, prefix) : Promise.resolve(null),
      vis: NT.visibility(prefix),
      lg: NT.fetchJSON(NT.ripe("looking-glass", prefix), { timeout: 30000 }),
      irr: NT.fetchJSON(NT.ripe("whois", prefix), { timeout: 20000 }),
      upd: NT.fetchJSON(NT.ripe("bgp-updates", prefix, "&starttime=" + new Date(Date.now() - 864e5).toISOString().slice(0, 16)), { timeout: 30000 }),
    };
    const R = {};
    await Promise.all(Object.entries(jobs).map(([k, p]) => p.then((v) => (R[k] = v)).catch((e) => (R[k] = { __err: e }))));

    /* origin + RPKI */
    const rpki = R.rpki && !R.rpki.__err ? R.rpki : null;
    C.origin.set(rpki ? (rpki.cls === "ok" ? "found" : rpki.cls === "err" ? "error" : "warn") : "found",
      rpki ? `RPKI: ${rpki.label}` : `${asns.length} origin AS${asns.length > 1 ? "es" : ""}`,
      NT.kv([
        ["Announced prefix", `<span class="mono">${esc(prefix)}</span>`, prefix],
        ...asns.map((a) => ["Origin AS", `${asLink(+a.asn)} <span class="nt-sub">${esc(a.holder || "")}</span>`, "AS" + +a.asn]),
        rpki && ["RPKI", `<span class="nt-chip ${rpki.cls}">${esc(rpki.label)}</span>`],
        rpki && rpki.roa && ["Covering ROA", `AS${+rpki.roa.origin} · ${esc(rpki.roa.prefix)} · max length /${+rpki.roa.max_length}`],
        ov.block && ov.block.desc && ["Allocation", esc(`${ov.block.resource} · ${ov.block.desc}`)],
      ]) + (rpki && rpki.note ? `<div style="margin-top:.6rem">${NT.msg(rpki.cls === "err" ? "err" : rpki.cls === "warn" ? "warn" : "ok", rpki.note)}</div>` : ""));

    /* visibility */
    if (R.vis.__err) C.vis.set("error", "Lookup failed", NT.msg("err", esc(R.vis.__err.message)));
    else {
      const v = R.vis, share = pct(v.seen, v.total);
      C.vis.set(share >= 95 ? "found" : share >= 60 ? "warn" : "error", `${share}% of full-table peers`,
        `<div class="nt-meter ${share >= 95 ? "" : share >= 60 ? "warn" : "err"}" aria-hidden="true">${Array.from({ length: 20 }, (_, i) => `<i class="${i < Math.round(share / 5) ? "on" : ""}"></i>`).join("")}</div>
         ${NT.kv([
           ["Peers seeing it", `${v.seen} of ${v.total}`],
           ["Collectors", String(v.collectors)],
         ])}
         ${v.missing.length ? `<p class="nt-section-title" style="margin-top:.8rem">Collectors with peers not seeing it</p>` +
            NT.recordList(v.missing.map((x) => ({ html: `${esc(x.rrc)} <span class="nt-note">${esc([x.city, x.cc].filter(Boolean).join(", "))} — ${x.missed} of ${x.of}</span>` })), { one: true, clampAt: 6 }) : ""}
         <p class="nt-note" style="margin-top:.6rem">${share >= 95 ? "Global visibility." : share >= 60 ? "Partial visibility: some peers don't have this route, which points to a limited announcement, filtering, or a more specific route elsewhere." : "Low visibility: most peers don't see this route at all."}</p>`);
    }

    /* looking glass: paths, origins, upstreams */
    if (R.lg.__err) {
      [C.up, C.paths].forEach((c) => c.set("error", "Lookup failed", NT.msg("err", esc(R.lg.__err.message))));
    } else {
      const rrcs = (R.lg.data || {}).rrcs || [];
      const rows = [];
      for (const rrc of rrcs) for (const p of rrc.peers || []) {
        const path = String(p.as_path || "").trim().split(/\s+/).filter(Boolean);
        rows.push({ rrc: rrc.rrc || "", loc: rrc.location || "", peer: p.peer, path, origin: path[path.length - 1], up: path.length > 1 ? path[path.length - 2] : "", comm: p.community || "" });
      }
      const count = (key) => { const m = new Map(); rows.forEach((r) => r[key] && m.set(r[key], (m.get(r[key]) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
      const origins = count("origin"), ups = count("up");
      const lens = rows.map((r) => r.path.length).sort((a, b) => a - b);

      // more than one origin AS for the same prefix (MOAS) is either an anycast/multi-origin design or a hijack
      const moas = origins.length > 1;
      C.origin.querySelector(".nt-card-body").insertAdjacentHTML("beforeend",
        `<div style="margin-top:.6rem">${moas
          ? NT.msg("warn", `RIS peers see ${origins.length} different origin AS numbers for this prefix (MOAS): ${origins.map(([a, n]) => `AS${esc(a)} (${n} peers)`).join(", ")}.`,
              "Normal for some anycast and multi-homed setups, but it is also what a hijack looks like.")
          : NT.msg("ok", `All ${rows.length} RIS peers agree the origin is AS${esc(origins[0] ? origins[0][0] : origin)}.`)}</div>`);

      C.up.set(ups.length ? "found" : "empty", `${ups.length} upstream${ups.length === 1 ? "" : "s"} seen`,
        NT.recordList(ups.slice(0, 12).map(([a, n]) => ({
          html: `${asLink(+a)} <span class="nt-note">${n} peer${n > 1 ? "s" : ""} (${pct(n, rows.length)}%)</span>`,
        })), { one: true, clampAt: 8 }) +
        NT.kv([
          ["Paths seen", String(rows.length)],
          ["Path length", lens.length ? `${lens[0]} shortest · ${lens[Math.floor(lens.length / 2)]} median · ${lens[lens.length - 1]} longest` : "—"],
        ]));

      const show = rows.slice(0, 200);
      C.paths.set("found", `${rows.length} peer${rows.length > 1 ? "s" : ""} across ${rrcs.length} collectors`,
        `<div class="nt-table-wrap" style="max-height:26rem"><table class="nt-table"><thead><tr><th>Collector</th><th>Peer</th><th>AS path</th><th>Communities</th></tr></thead><tbody>${
          show.map((r) => `<tr><td>${esc(r.rrc)} <span class="nt-note">${esc(r.loc)}</span></td><td>${esc(r.peer)}</td>
            <td>${r.path.map((a, i) => (i === r.path.length - 1 ? `<b>${esc(a)}</b>` : esc(a))).join(" ")}</td>
            <td class="wrap">${esc(r.comm)}</td></tr>`).join("")
        }</tbody></table></div>${rows.length > show.length ? `<p class="nt-note" style="margin-top:.5rem">Showing the first ${show.length} of ${rows.length} peers.</p>` : ""}`);
    }

    /* IRR route objects */
    if (R.irr.__err) C.irr.set("error", "Lookup failed", NT.msg("err", esc(R.irr.__err.message)));
    else {
      const objs = ((R.irr.data || {}).irr_records || []).map((rec) => {
        const o = {};
        (rec || []).forEach((f) => { if (f && f.key) o[String(f.key).toLowerCase()] = f.value; });
        return o;
      }).filter((o) => o.route || o.route6);
      const originsIrr = [...new Set(objs.map((o) => String(o.origin || "").replace(/^AS/i, "")).filter(Boolean))];
      const mismatch = originsIrr.length && origin && !originsIrr.includes(String(origin));
      C.irr.set(!objs.length ? "warn" : mismatch ? "error" : "found",
        objs.length ? `${objs.length} route object${objs.length > 1 ? "s" : ""}` : "No route object",
        objs.length
          ? NT.recordList(objs.map((o) => ({ html: `${esc(o.route || o.route6)} <span class="nt-pri">AS${esc(String(o.origin || "").replace(/^AS/i, ""))}</span> <span class="nt-note">${esc(o.source || "")}${o.descr ? " · " + esc(o.descr) : ""}</span>` })), { one: true, clampAt: 8 }) +
            (mismatch ? `<div style="margin-top:.6rem">${NT.msg("err", `The IRR says AS${originsIrr.join(", AS")} may originate this prefix, but BGP shows AS${origin}.`, "Networks that build prefix filters from the IRR will drop this announcement. Register a matching route object.")}</div>` : "")
          : NT.msg("warn", "No route object found in any IRR database.", "Networks that build filters from the IRR may not accept this prefix. Register a route (or route6) object with your RIR or an IRR."));
    }

    /* update churn */
    if (R.upd.__err) C.churn.set("empty", "Not available", NT.msg("info", "The update history didn't load in time. It is the heaviest query here; try again."));
    else {
      const d = R.upd.data || {}, u = d.updates || [];
      const ann = u.filter((x) => x.type === "A").length, wdr = u.filter((x) => x.type === "W").length;
      C.churn.set(u.length > 500 ? "warn" : "found", `${NT.num(u.length)} updates in 24h`,
        NT.kv([
          ["Announcements", NT.num(ann)],
          ["Withdrawals", NT.num(wdr)],
          ["Window", "Last 24 hours"],
        ]) + `<p class="nt-note" style="margin-top:.5rem">${u.length > 500
          ? "High churn: the route is flapping or being re-announced often, which upstream networks may damp."
          : "Normal churn for a stable route."}</p>`);
    }

    btn.disabled = false; btn.textContent = "Look up";

    /* headline tiles */
    const v = R.vis.__err ? null : R.vis;
    statsEl.innerHTML = [
      rpki ? `<div class="nt-stat ${rpki.cls === "err" ? "" : "lead"}"><b style="color:var(--nt-${rpki.cls === "ok" ? "ok" : rpki.cls === "err" ? "err" : "warn"})">${esc(rpki.label.split(" ")[0])}</b><span>RPKI route origin validation for AS${origin}</span></div>` : "",
      v ? `<div class="nt-stat"><b>${pct(v.seen, v.total)}%</b><span>of ${v.total} RIS full-table peers see this prefix</span></div>` : "",
      `<div class="nt-stat"><b>${esc(prefix)}</b><span>Most specific announced prefix covering your query</span></div>`,
    ].filter(Boolean).join("");
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
  input.value = NT.query() || "1.1.1.0/24";
  run();
});
