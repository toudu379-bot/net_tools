/* Subnet calculator — sipcalc-style IPv4/IPv6 details, split, summarise, range to CIDR. */
NT.register("subnet", function (root) {
  const { esc, $ } = NT;
  const ONE = 1n;

  /* ---------- address math (BigInt, works for both families) ---------- */
  const W = (v) => (v === 4 ? 32 : 128);
  const maskOf = (p, v) => (p === 0 ? 0n : ((ONE << BigInt(p)) - ONE) << BigInt(W(v) - p));
  const full = (v) => (ONE << BigInt(W(v))) - ONE;

  function parseAddr(s) {
    s = String(s).trim();
    if (NT.isIPv4(s)) return { v: 4, n: s.split(".").reduce((a, o) => (a << 8n) | BigInt(o), 0n) };
    const e = s.includes(":") && NT.expandV6(s);
    if (e) return { v: 6, n: BigInt("0x" + e.replace(/:/g, "")) };
    return null;
  }
  const fmt4 = (n) => [24n, 16n, 8n, 0n].map((s) => String((n >> s) & 255n)).join(".");
  function groups6(n) { const g = []; for (let i = 7; i >= 0; i--) g.push(Number((n >> BigInt(i * 16)) & 0xffffn)); return g; }
  const expand6 = (n) => groups6(n).map((x) => x.toString(16).padStart(4, "0")).join(":");
  function compress6(n) {
    const g = groups6(n);
    let best = -1, bestLen = 0;
    for (let i = 0; i < 8; ) {
      if (g[i] !== 0) { i++; continue; }
      let j = i; while (j < 8 && g[j] === 0) j++;
      if (j - i > bestLen && j - i > 1) { best = i; bestLen = j - i; }
      i = j;
    }
    const h = g.map((x) => x.toString(16));
    if (best < 0) return h.join(":");
    return h.slice(0, best).join(":") + "::" + h.slice(best + bestLen).join(":");
  }
  const fmt = (n, v) => (v === 4 ? fmt4(n) : compress6(n));
  const hex = (n, v) => "0x" + n.toString(16).padStart(v === 4 ? 8 : 32, "0").toUpperCase();
  function prefixFromMask(m) {
    const bits = m.toString(2).padStart(32, "0");
    return /^1*0*$/.test(bits) ? bits.indexOf("0") === -1 ? 32 : bits.indexOf("0") : null;
  }
  const pow2 = (b) => ONE << BigInt(b);
  const pow2Label = (b) => `${NT.num(pow2(b))} (2^${b})`;

  /** "10.1.2.3/24", "10.1.2.3 255.255.255.0", "10.1.2.3/0.0.0.255", "2001:db8::1/48", bare address. */
  function parseNet(raw) {
    const s = String(raw).trim().replace(/\s+/g, " ");
    if (!s) return { error: "Enter an address, for example 192.168.10.77/26 or 2001:db8::1/48." };
    let addrPart = s, maskPart = null;
    const m = s.match(/^(\S+?)\s*[\/ ]\s*(\S+)$/);
    if (m) { addrPart = m[1]; maskPart = m[2]; }
    const a = parseAddr(addrPart);
    if (!a) return { error: `"${addrPart}" is not a valid IPv4 or IPv6 address.` };
    let p = W(a.v), maskNote = "";
    if (maskPart != null) {
      if (/^\d{1,3}$/.test(maskPart)) {
        p = +maskPart;
        if (p > W(a.v)) return { error: `/${p} is too long for IPv${a.v}. The maximum is /${W(a.v)}.` };
      } else if (a.v === 4 && NT.isIPv4(maskPart)) {
        const mn = parseAddr(maskPart).n;
        let q = prefixFromMask(mn);
        if (q == null) { q = prefixFromMask(~mn & 0xffffffffn); if (q != null) maskNote = "Read as a wildcard (inverse) mask."; }
        if (q == null) return { error: `${maskPart} is not a valid netmask. Mask bits must be contiguous.` };
        p = q;
      } else return { error: `"${maskPart}" is not a prefix length or netmask.` };
    }
    return { v: a.v, n: a.n, p, maskNote, bare: maskPart == null };
  }

  function info(v, n, p) {
    const w = W(v), mask = maskOf(p, v), net = n & mask, last = net | (~mask & full(v));
    const size = pow2(w - p);
    // IPv4 loses network and broadcast, except /31 (RFC 3021) and /32. IPv6 has no broadcast:
    // every address is assignable (the all-zeros subnet-router anycast is a convention, not a reservation).
    let first = net, lastUse = last, usable = size;
    if (v === 4 && p <= 30) { first = net + ONE; lastUse = last - ONE; usable = size - 2n; }
    return { v, n, p, w, mask, net, last, size, first, lastUse, usable };
  }

  const V4_TYPES = [
    ["0.0.0.0/8", "“This network” (RFC 1122)"], ["10.0.0.0/8", "Private (RFC 1918)"], ["100.64.0.0/10", "Shared address space, CGNAT (RFC 6598)"],
    ["127.0.0.0/8", "Loopback"], ["169.254.0.0/16", "Link-local (RFC 3927)"], ["172.16.0.0/12", "Private (RFC 1918)"],
    ["192.0.0.0/24", "IETF protocol assignments"], ["192.0.2.0/24", "Documentation, TEST-NET-1"], ["192.31.196.0/24", "AS112-v4"],
    ["192.52.193.0/24", "AMT (RFC 7450)"], ["192.88.99.0/24", "6to4 relay anycast (deprecated)"], ["192.175.48.0/24", "AS112 direct delegation"],
    ["192.168.0.0/16", "Private (RFC 1918)"], ["198.18.0.0/15", "Benchmarking (RFC 2544)"], ["198.51.100.0/24", "Documentation, TEST-NET-2"],
    ["203.0.113.0/24", "Documentation, TEST-NET-3"], ["224.0.0.0/4", "Multicast"], ["255.255.255.255/32", "Limited broadcast"], ["240.0.0.0/4", "Reserved (class E)"],
  ];
  const V6_TYPES = [
    ["::/128", "Unspecified"], ["::1/128", "Loopback"], ["::ffff:0:0/96", "IPv4-mapped"], ["64:ff9b::/96", "NAT64 well-known prefix"],
    ["64:ff9b:1::/48", "Local-use NAT64 (RFC 8215)"], ["100::/64", "Discard-only (RFC 6666)"], ["2001::/23", "IETF protocol assignments"],
    ["2001::/32", "Teredo"], ["2001:db8::/32", "Documentation (RFC 3849)"], ["3fff::/20", "Documentation (RFC 9637)"], ["2002::/16", "6to4"],
    ["5f00::/16", "SRv6 SIDs (RFC 9602)"], ["fc00::/7", "Unique local (ULA, RFC 4193)"], ["fe80::/10", "Link-local unicast"],
    ["fec0::/10", "Site-local (deprecated)"], ["ff00::/8", "Multicast"], ["2000::/3", "Global unicast"],
  ];
  const typeTables = { 4: V4_TYPES.map(toRange), 6: V6_TYPES.map(toRange) };
  function toRange([cidr, label]) { const [a, p] = cidr.split("/"), x = parseAddr(a); return { v: x.v, net: x.n, p: +p, label }; }
  function addrType(v, n) {
    const hit = typeTables[v].filter((t) => (n & maskOf(t.p, v)) === t.net).sort((a, b) => b.p - a.p)[0];
    return hit ? hit.label : v === 4 ? "Public (global unicast)" : "Reserved by IETF";
  }
  function v4Class(n) {
    const o = Number(n >> 24n);
    return o < 128 ? "A" : o < 192 ? "B" : o < 224 ? "C" : o < 240 ? "D (multicast)" : "E (reserved)";
  }
  /** Reverse zone. Off-boundary prefixes live inside the enclosing octet (IPv4) or nibble (IPv6) zone. */
  function reverseZone(v, net, p) {
    if (v === 4) {
      const o = fmt4(net).split("."), k = Math.floor(p / 8);
      const zone = (k ? o.slice(0, k).reverse().join(".") + "." : "") + "in-addr.arpa";
      // RFC 2317 classless delegation label for prefixes longer than /24
      return p % 8 === 0 ? zone : p > 24 ? `${zone} (RFC 2317 delegation: ${o[3]}/${p}.${zone})` : `${zone} (enclosing zone for /${k * 8})`;
    }
    const nib = expand6(net).replace(/:/g, "").slice(0, Math.floor(p / 4));
    const zone = (nib ? nib.split("").reverse().join(".") + "." : "") + "ip6.arpa";
    return p % 4 === 0 ? zone : `${zone} (enclosing zone for /${Math.floor(p / 4) * 4})`;
  }

  /** Split an inclusive range into the fewest CIDR blocks. */
  function rangeToCidrs(v, start, end) {
    const w = W(v), out = [];
    while (start <= end) {
      let tz = 0;
      if (start === 0n) tz = w; else while (tz < w && ((start >> BigInt(tz)) & ONE) === 0n) tz++;
      while (tz > 0 && start + pow2(tz) - ONE > end) tz--;
      out.push({ v, net: start, p: w - tz });
      start += pow2(tz);
      if (start > full(v)) break;
    }
    return out;
  }

  /* ---------- layout ---------- */
  root.innerHTML = NT.hero("IP subnetting", "Subnet calculator",
    "sipcalc-style details for IPv4 and IPv6, plus splitting a network, summarising a list of networks and turning an address range into CIDR blocks.") + `
    <form class="nt-panel" autocomplete="off" data-form="main">
      <label class="nt-label" for="nt-sub-q">Address with prefix or netmask</label>
      <div class="nt-row">
        <input class="nt-input nt-grow" id="nt-sub-q" type="text" spellcheck="false" autocapitalize="off" placeholder="192.168.10.77/26">
        <button class="nt-btn" type="submit">Calculate</button>
      </div>
      <div class="nt-range" style="margin-top:.9rem">
        <label class="nt-label" for="nt-sub-p" style="margin:0">Prefix length</label>
        <input id="nt-sub-p" type="range" min="0" max="32" step="1" value="26">
        <output for="nt-sub-p">/26</output>
      </div>
      <p class="nt-hint">Accepts 10.0.0.1/24, 10.0.0.1 255.255.255.0, a wildcard mask such as 10.0.0.1 0.0.0.255, or any IPv6 address with a prefix.</p>
    </form>
    <div class="nt-bar">
      <div class="nt-tabs" role="tablist" aria-label="Calculator mode">
        <button class="nt-tab" role="tab" aria-selected="true" data-tab="details">Details</button>
        <button class="nt-tab" role="tab" aria-selected="false" data-tab="split">Split</button>
        <button class="nt-tab" role="tab" aria-selected="false" data-tab="merge">Summarise</button>
        <button class="nt-tab" role="tab" aria-selected="false" data-tab="range">Range to CIDR</button>
      </div>
      <div class="nt-chips" data-slot="chips"></div>
    </div>
    <section data-pane="details"></section>
    <section data-pane="split" hidden></section>
    <section data-pane="merge" hidden>
      <div class="nt-split">
        <div class="nt-panel">
          <p class="nt-section-title"><label for="nt-sub-list">Networks to summarise</label></p>
          <textarea class="nt-textarea" id="nt-sub-list" spellcheck="false" rows="9" placeholder="One network per line">10.0.0.0/24
10.0.1.0/24
10.0.2.0/23
10.0.4.0/22
192.168.1.0/25
192.168.1.128/25
2001:db8:0:0::/64
2001:db8:0:1::/64</textarea>
          <div class="nt-row" style="margin-top:.7rem"><button class="nt-btn" type="button" data-act="merge">Summarise</button></div>
        </div>
        <div class="nt-panel" data-slot="merge-out"></div>
      </div>
    </section>
    <section data-pane="range" hidden>
      <div class="nt-split">
        <form class="nt-panel" data-form="range" autocomplete="off">
          <label class="nt-label" for="nt-sub-from">First address</label>
          <input class="nt-input nt-sm" id="nt-sub-from" type="text" spellcheck="false" value="192.168.0.10">
          <label class="nt-label" for="nt-sub-to" style="margin-top:.8rem">Last address</label>
          <input class="nt-input nt-sm" id="nt-sub-to" type="text" spellcheck="false" value="192.168.1.77">
          <div class="nt-row" style="margin-top:.8rem"><button class="nt-btn" type="submit">Convert to CIDR</button></div>
        </form>
        <div class="nt-panel" data-slot="range-out"></div>
      </div>
    </section>
    <p class="nt-foot">Everything is calculated in your browser. For IPv4, /31 and /32 networks follow RFC 3021 (every address is usable).</p>`;

  const input = $(root, "#nt-sub-q"), slider = $(root, "#nt-sub-p"), out = $(root, "output"), hint = $(root, ".nt-hint");
  const panes = { details: $(root, "[data-pane=details]"), split: $(root, "[data-pane=split]"), merge: $(root, "[data-pane=merge]"), range: $(root, "[data-pane=range]") };
  let cur = null, splitPrefix = null;
  const HINT = hint.textContent;

  /* ---------- details ---------- */
  function bitRuler(x) {
    const bits = x.n.toString(2).padStart(x.w, "0");
    const size = x.v === 4 ? 8 : 16;
    let html = "";
    for (let g = 0; g < x.w / size; g++) {
      const chunk = bits.slice(g * size, g * size + size);
      html += `<div class="nt-octet" title="${x.v === 4 ? "Octet " + (g + 1) + ": " + parseInt(chunk, 2) : "Group " + (g + 1) + ": " + parseInt(chunk, 2).toString(16)}">` +
        chunk.split("").map((b, i) => `<span class="nt-bit${g * size + i < x.p ? " net" : ""}">${b}</span>`).join("") + `</div>`;
    }
    return `<div class="nt-bits${x.v === 6 ? " v6" : ""}"><div class="nt-bits-row">${html}</div>
      <div class="nt-bits-legend"><span><i class="net"></i>Network bits (${x.p})</span><span><i></i>Host bits (${x.w - x.p})</span></div></div>`;
  }

  function details(x) {
    const F = (n) => fmt(n, x.v);
    let rows;
    if (x.v === 4) {
      const wild = ~x.mask & full(4);
      rows = [
        ["Host address", F(x.n), F(x.n)],
        ["Host address (decimal)", x.n.toString(), x.n.toString()],
        ["Host address (hex)", hex(x.n, 4), hex(x.n, 4)],
        ["Network address", F(x.net), F(x.net)],
        ["Network mask", F(x.mask), F(x.mask)],
        ["Network mask (bits)", String(x.p), String(x.p)],
        ["Network mask (hex)", hex(x.mask, 4), hex(x.mask, 4)],
        ["Broadcast address", x.p >= 31 ? `${F(x.last)} <span class="nt-sub">(none in a /${x.p})</span>` : F(x.last), F(x.last)],
        ["Cisco wildcard", F(wild), F(wild)],
        ["Addresses in network", NT.num(x.size)],
        ["Usable hosts", NT.num(x.usable)],
        ["Network range", `${F(x.net)} – ${F(x.last)}`, `${F(x.net)} - ${F(x.last)}`],
        ["Usable range", `${F(x.first)} – ${F(x.lastUse)}`, `${F(x.first)} - ${F(x.lastUse)}`],
        ["Address class", v4Class(x.n)],
        ["Address type", addrType(4, x.n)],
        ["Reverse DNS zone", reverseZone(4, x.net, x.p), reverseZone(4, x.net, x.p).split(" ")[0]],
        ["IPv4-mapped IPv6", "::ffff:" + F(x.n), "::ffff:" + F(x.n)],
        ["6to4 prefix", `2002:${(x.n >> 16n).toString(16)}:${(x.n & 0xffffn).toString(16)}::/48`],
      ];
    } else {
      const id = x.n & ~x.mask & full(6);
      const v4 = (x.n >> 32n) === 0xffffn ? fmt4(x.n & 0xffffffffn) : (x.n & maskOf(96, 6)) === parseAddr("64:ff9b::").n ? fmt4(x.n & 0xffffffffn) : null;
      rows = [
        ["Expanded address", expand6(x.n), expand6(x.n)],
        ["Compressed address", compress6(x.n), compress6(x.n)],
        ["Subnet prefix (masked)", `${compress6(x.net)}/${x.p}`, `${compress6(x.net)}/${x.p}`],
        ["Address ID (masked)", `${compress6(id)}/${x.p}`, `${compress6(id)}/${x.p}`],
        ["Prefix address", compress6(x.mask), compress6(x.mask)],
        ["Prefix length", String(x.p), String(x.p)],
        ["Address type", addrType(6, x.n)],
        ["Network range", `${expand6(x.net)} –<br>${expand6(x.last)}`, `${expand6(x.net)} - ${expand6(x.last)}`],
        ["Addresses in network", pow2Label(128 - x.p)],
        x.p <= 64 && ["/64 subnets", pow2Label(64 - x.p)],
        x.p <= 48 && ["/56 subnets", pow2Label(56 - x.p)],
        ["Reverse DNS zone", reverseZone(6, x.net, x.p), reverseZone(6, x.net, x.p).split(" ")[0]],
        v4 && ["Embedded IPv4", v4, v4],
      ];
    }
    const chips = [
      `<span class="nt-chip mono">IPv${x.v}</span>`,
      `<span class="nt-chip mono">${esc(F(x.net))}/${x.p}</span>`,
      `<span class="nt-chip">${esc(addrType(x.v, x.n))}</span>`,
      x.v === 4 ? `<span class="nt-chip">Class ${esc(v4Class(x.n))}</span>` : "",
    ].join("");
    $(root, "[data-slot=chips]").innerHTML = chips;
    panes.details.innerHTML = `<div class="nt-split">
      <div class="nt-panel"><p class="nt-section-title">${x.v === 4 ? "IPv4" : "IPv6"} address details
        <button class="nt-ghost" type="button" data-act="copy-all">Copy all</button></p>${NT.kv(rows.filter(Boolean).map(([k, v, c]) => [k, v.includes("<") ? v : esc(v), c]))}</div>
      <div class="nt-stack">
        <div class="nt-panel"><p class="nt-section-title">Address in binary</p>${bitRuler(x)}</div>
        <div class="nt-panel"><p class="nt-section-title">Neighbouring networks</p>${neighbours(x)}</div>
      </div></div>`;
    panes.details.querySelector("[data-act=copy-all]").addEventListener("click", () => {
      NT.copy(rows.filter(Boolean).map(([k, v, c]) => `${k.padEnd(24)}- ${c != null ? c : v.replace(/<[^>]+>/g, "")}`).join("\n"), "Copied details");
    });
  }

  function neighbours(x) {
    const step = x.size, items = [];
    const prev = x.net - step, next = x.net + step;
    if (prev >= 0n) items.push(["Previous", prev]);
    items.push(["This network", x.net]);
    if (next + step - ONE <= full(x.v)) items.push(["Next", next]);
    const parent = x.p > 0 ? x.net & maskOf(x.p - 1, x.v) : null;
    const rows = items.map(([k, n]) => [k, `<span class="mono">${esc(fmt(n, x.v))}/${x.p}</span>`, `${fmt(n, x.v)}/${x.p}`]);
    if (parent != null) rows.push(["Parent (supernet)", `<span class="mono">${esc(fmt(parent, x.v))}/${x.p - 1}</span>`, `${fmt(parent, x.v)}/${x.p - 1}`]);
    return NT.kv(rows);
  }

  /* ---------- split ---------- */
  const SPLIT_ROWS = 1024;
  function split(x) {
    const max = x.v === 4 ? 32 : 128;
    if (x.p >= max) { panes.split.innerHTML = `<div class="nt-empty">A /${x.p} can't be split any further. Lower the prefix length first.</div>`; return; }
    const choices = [];
    for (let q = x.p + 1; q <= Math.min(max, x.p + (x.v === 4 ? 32 : 64)); q++) choices.push(q);
    if (splitPrefix == null || splitPrefix <= x.p || splitPrefix > max) splitPrefix = Math.min(max, x.p + (x.v === 4 ? 2 : 8));
    const q = splitPrefix, count = pow2(q - x.p), step = pow2(x.w - q);
    const shown = count > BigInt(SPLIT_ROWS) ? SPLIT_ROWS : Number(count);
    const lines = [];
    let rows = "";
    for (let i = 0; i < shown; i++) {
      const s = info(x.v, x.net + BigInt(i) * step, q);
      const F = (n) => esc(fmt(n, x.v));
      lines.push(`${fmt(s.net, x.v)}/${q}`);
      rows += x.v === 4
        ? `<tr><td class="num">${i + 1}</td><td>${F(s.net)}/${q}</td><td>${F(s.first)}</td><td>${F(s.lastUse)}</td><td>${q >= 31 ? "–" : F(s.last)}</td><td>${NT.num(s.usable)}</td></tr>`
        : `<tr><td class="num">${i + 1}</td><td>${F(s.net)}/${q}</td><td>${F(s.net)}</td><td>${F(s.last)}</td><td>${NT.num(s.size)}</td></tr>`;
    }
    panes.split.innerHTML = `<div class="nt-panel">
      <div class="nt-row" style="align-items:center; justify-content:space-between; margin-bottom:.9rem">
        <div class="nt-row" style="align-items:center">
          <label class="nt-label" for="nt-sub-split" style="margin:0">Split ${esc(fmt(x.net, x.v))}/${x.p} into</label>
          <select class="nt-select" id="nt-sub-split" style="min-height:2.4rem">${choices.map((c) => `<option value="${c}"${c === q ? " selected" : ""}>/${c} — ${NT.num(pow2(c - x.p))} subnets</option>`).join("")}</select>
        </div>
        <button class="nt-ghost" type="button" data-act="copy-split">Copy list</button>
      </div>
      <p class="nt-note" style="margin-bottom:.7rem">${NT.num(count)} subnets of ${NT.num(pow2(x.w - q))} addresses each${count > BigInt(SPLIT_ROWS) ? `. Showing the first ${NT.num(SPLIT_ROWS)}.` : "."}</p>
      <div class="nt-table-wrap" style="max-height:34rem"><table class="nt-table"><thead><tr><th>#</th><th>Network</th>${x.v === 4 ? "<th>First usable</th><th>Last usable</th><th>Broadcast</th><th>Usable</th>" : "<th>First address</th><th>Last address</th><th>Addresses</th>"}</tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
    $(panes.split, "#nt-sub-split").addEventListener("change", (e) => { splitPrefix = +e.target.value; split(x); });
    $(panes.split, "[data-act=copy-split]").addEventListener("click", () => NT.copy(lines.join("\n"), `Copied ${lines.length} subnets`));
  }

  /* ---------- summarise ---------- */
  function merge() {
    const outEl = $(root, "[data-slot=merge-out]");
    const tokens = $(root, "#nt-sub-list").value.split(/[\s,;]+/).filter(Boolean);
    const bad = [], fixed = [], ranges = { 4: [], 6: [] };
    for (const t of tokens) {
      const x = parseNet(t);
      if (x.error) { bad.push(t); continue; }
      const i = info(x.v, x.n, x.p);
      if (i.net !== x.n) fixed.push(`${t} → ${fmt(i.net, x.v)}/${x.p}`);
      ranges[x.v].push([i.net, i.last]);
    }
    const result = [];
    let before = 0;
    for (const v of [4, 6]) {
      const rs = ranges[v].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      before += rs.length;
      const merged = [];
      for (const r of rs) {
        const last = merged[merged.length - 1];
        if (last && r[0] <= last[1] + ONE) { if (r[1] > last[1]) last[1] = r[1]; }
        else merged.push([r[0], r[1]]);
      }
      for (const [s, e] of merged) result.push(...rangeToCidrs(v, s, e));
    }
    if (!tokens.length) { outEl.innerHTML = `<div class="nt-empty">Paste networks on the left, one per line.</div>`; return; }
    const list = result.map((c) => `${fmt(c.net, c.v)}/${c.p}`);
    outEl.innerHTML = `<p class="nt-section-title">Summarised networks <button class="nt-ghost" type="button" data-act="copy-merge">Copy list</button></p>
      <div class="nt-chips" style="margin-bottom:.8rem"><span class="nt-chip ok">${before} in → ${result.length} out</span></div>
      ${NT.recordList(list.map((l) => ({ html: esc(l), copy: l })), { one: true, clampAt: 40 })}
      <div class="nt-msgs" style="margin-top:.8rem">
        ${fixed.length ? NT.msg("warn", `${fixed.length} entr${fixed.length > 1 ? "ies had" : "y had"} host bits set and ${fixed.length > 1 ? "were" : "was"} aligned to the network address.`, esc(fixed.join(" · "))) : ""}
        ${bad.length ? NT.msg("err", `${bad.length} entr${bad.length > 1 ? "ies were" : "y was"} skipped because ${bad.length > 1 ? "they aren't" : "it isn't"} a valid network.`, esc(bad.join(", "))) : ""}
      </div>`;
    $(outEl, "[data-act=copy-merge]").addEventListener("click", () => NT.copy(list.join("\n"), `Copied ${list.length} networks`));
  }

  /* ---------- range to CIDR ---------- */
  function range() {
    const outEl = $(root, "[data-slot=range-out]");
    const a = parseAddr($(root, "#nt-sub-from").value), b = parseAddr($(root, "#nt-sub-to").value);
    if (!a || !b) { outEl.innerHTML = NT.msg("err", "Enter two valid addresses.", "Both must be IPv4, or both IPv6."); return; }
    if (a.v !== b.v) { outEl.innerHTML = NT.msg("err", "The two addresses are from different families.", "Use two IPv4 or two IPv6 addresses."); return; }
    let [s, e] = [a.n, b.n];
    const swapped = s > e; if (swapped) [s, e] = [e, s];
    const list = rangeToCidrs(a.v, s, e).map((c) => `${fmt(c.net, c.v)}/${c.p}`);
    outEl.innerHTML = `<p class="nt-section-title">CIDR blocks <button class="nt-ghost" type="button" data-act="copy-range">Copy list</button></p>
      <div class="nt-chips" style="margin-bottom:.8rem"><span class="nt-chip ok">${list.length} block${list.length > 1 ? "s" : ""}</span><span class="nt-chip">${NT.num(e - s + ONE)} addresses</span></div>
      ${swapped ? NT.msg("info", "The first address was higher than the last, so the range was reversed.") + "<div style='height:.6rem'></div>" : ""}
      ${NT.recordList(list.map((l) => ({ html: esc(l), copy: l })), { one: true, clampAt: 40 })}`;
    $(outEl, "[data-act=copy-range]").addEventListener("click", () => NT.copy(list.join("\n"), `Copied ${list.length} blocks`));
  }

  /* ---------- wiring ---------- */
  function calc(fromSlider) {
    const x = parseNet(input.value);
    if (x.error) { hint.textContent = x.error; hint.classList.add("bad"); return; }
    hint.classList.remove("bad");
    hint.textContent = x.maskNote || (x.bare ? `No prefix given, so this is a single host (/${x.p}). Add /24 or a netmask for a network.` : HINT);
    slider.max = String(W(x.v));
    slider.value = String(x.p);
    out.textContent = "/" + x.p;
    cur = info(x.v, x.n, x.p);
    details(cur);
    split(cur);
    if (!fromSlider) NT.setQuery(input.value.trim());
  }
  slider.addEventListener("input", () => {
    const x = parseNet(input.value);
    const addr = x.error ? input.value.split(/[\/ ]/)[0] : fmt(x.n, x.v);
    input.value = `${addr}/${slider.value}`;
    out.textContent = "/" + slider.value;
    calc(true);
  });
  slider.addEventListener("change", () => NT.setQuery(input.value.trim()));
  $(root, "[data-form=main]").addEventListener("submit", (e) => { e.preventDefault(); calc(); });
  $(root, "[data-form=range]").addEventListener("submit", (e) => { e.preventDefault(); range(); });
  $(root, "[data-act=merge]").addEventListener("click", merge);
  root.querySelectorAll("[data-tab]").forEach((t) => t.addEventListener("click", () => {
    root.querySelectorAll("[data-tab]").forEach((o) => o.setAttribute("aria-selected", String(o === t)));
    for (const k in panes) panes[k].hidden = k !== t.dataset.tab;
    NT.store.set("subnet-tab", t.dataset.tab);
  }));

  input.value = NT.query() || "192.168.10.77/26";
  calc();
  merge();
  range();
  const tab = NT.store.get("subnet-tab", "details");
  const tb = root.querySelector(`[data-tab="${tab}"]`); if (tb) tb.click();
});
