/* EVPN calculator — VLAN/VRF to VNI allocation, RD/RT generation (NX-OS, EOS, Junos) and control-plane route scaling. */
NT.register("evpn", function (root) {
  const { esc, $ } = NT;
  const MAX_VNI = 16777215;

  const DEF = {
    asn: "65001", design: "ibgp", leaves: 8, peers: 2, rid: "10.0.0.1",
    repl: "ingress", mcBase: "239.1.1.0", mcPool: 16,
    l2base: 10000, l3base: 50000, l3vlan: 3900, rt: "asn-vni", auto: true,
    tenants: [{ name: "TENANT-A", vlans: "10-12, 20" }, { name: "TENANT-B", vlans: "100-101" }],
    hosts: 400, v4: 1, v6: 1, dual: 50, mh: "vpc", esPair: 24, spread: 100, ext: 50, border: 2, svi: true,
    vendor: "nxos", leaf: 1,
  };
  const S = Object.assign({}, DEF, NT.store.get("evpn", {}));
  if (!Array.isArray(S.tenants) || !S.tenants.length) S.tenants = DEF.tenants;

  /* ---------- parsing ---------- */
  function parseASN(s) {
    s = String(s).trim();
    let n = null, m;
    if ((m = /^(\d{1,5})\.(\d{1,5})$/.exec(s)) && +m[1] <= 65535 && +m[2] <= 65535) n = +m[1] * 65536 + +m[2]; // asdot
    else if (/^\d{1,10}$/.test(s)) n = +s;
    if (n == null || n < 1 || n > 4294967295) return null;
    return n;
  }
  const ip2int = (s) => s.split(".").reduce((a, o) => a * 256 + +o, 0);
  const int2ip = (n) => [24, 16, 8, 0].map((b) => Math.floor(n / 2 ** b) % 256).join(".");
  function parseVlans(s) {
    const out = [], bad = [];
    for (const part of String(s).split(/[\s,;]+/).filter(Boolean)) {
      const m = /^(\d{1,4})(?:-(\d{1,4}))?$/.exec(part);
      if (!m) { bad.push(part); continue; }
      const a = +m[1], b = m[2] ? +m[2] : a;
      if (a > b || a < 1 || b > 4094) { bad.push(part); continue; }
      if (b - a > 4093) { bad.push(part); continue; }
      for (let v = a; v <= b; v++) out.push(v);
    }
    return { list: [...new Set(out)].sort((x, y) => x - y), bad };
  }

  /* ---------- model ---------- */
  function model() {
    const warn = [];
    const W = (kind, text) => warn.push([kind, text]);
    const asn = parseASN(S.asn);
    if (asn == null) W("err", "Enter a valid BGP AS number (1–4294967295, or asdot like 65000.100).");
    else {
      if (asn === 23456) W("err", "AS 23456 is AS_TRANS and can't be used as a real AS number.");
      else if (!((asn >= 64512 && asn <= 65534) || (asn >= 4200000000 && asn <= 4294967294))) W("info", `AS${asn} is a public AS number. Private ranges are 64512–65534 and 4200000000–4294967294.`);
    }
    const asn4 = asn != null && asn > 65535;
    const ridOk = NT.isIPv4(String(S.rid).trim());
    if (!ridOk) W("err", "Enter leaf 1's router ID as an IPv4 address, for example 10.0.0.1.");
    const ridBase = ridOk ? ip2int(S.rid.trim()) : 0;
    if (ridOk && ridBase + S.leaves - 1 > 4294967295) W("err", "Router IDs run past 255.255.255.255 for this many leaves.");

    // VRFs and VLANs
    const vrfs = [], seenVlan = new Map(), seenVrf = new Set();
    S.tenants.forEach((t, i) => {
      const name = String(t.name || "").trim() || `VRF-${i + 1}`;
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) W("err", `VRF name "${name}" should be 1–32 letters, digits, "-" or "_".`);
      if (seenVrf.has(name)) W("err", `VRF ${name} is listed twice.`);
      seenVrf.add(name);
      const p = parseVlans(t.vlans);
      if (p.bad.length) W("err", `${name}: "${p.bad.join(", ")}" isn't a VLAN ID or range between 1 and 4094.`);
      const vlans = [];
      for (const v of p.list) {
        if (seenVlan.has(v)) { W("err", `VLAN ${v} is in both ${seenVlan.get(v)} and ${name}. A VLAN can belong to one VRF only.`); continue; }
        seenVlan.set(v, name); vlans.push(v);
      }
      const idx = i + 1;
      vrfs.push({ name, idx, vlans, l3vni: S.l3base + idx, l3vlan: S.l3vlan + idx });
    });
    const l2 = [];
    vrfs.forEach((f) => f.vlans.forEach((v) => l2.push({ vrf: f.name, vlan: v, vni: S.l2base + v })));

    // VNI checks
    const vniOwner = new Map();
    const checkVni = (vni, what) => {
      if (vni < 1 || vni > MAX_VNI) W("err", `${what}: VNI ${NT.num(vni)} is outside the 24-bit range 1–16,777,215.`);
      if (vniOwner.has(vni)) W("err", `VNI ${vni} is used by both ${vniOwner.get(vni)} and ${what}.`);
      vniOwner.set(vni, what);
    };
    l2.forEach((x) => checkVni(x.vni, `VLAN ${x.vlan}`));
    vrfs.forEach((f) => checkVni(f.l3vni, `VRF ${f.name}`));
    const allVni = [...vniOwner.keys()];
    if (S.vendor === "nxos" && allVni.some((v) => v < 4096 || v > 16773119)) W("warn", "NX-OS accepts vn-segment values 4096–16,773,119. Adjust the VNI bases for NX-OS.");
    if (S.vendor === "junos" && allVni.some((v) => v > 16777214)) W("warn", "Junos accepts VNIs up to 16,777,214.");

    // VLAN checks
    const vlanIds = l2.map((x) => x.vlan);
    if (vlanIds.includes(1)) W("warn", "VLAN 1 is the default VLAN on most switches. Avoid extending it over VXLAN.");
    if (vlanIds.some((v) => v >= 1002 && v <= 1005)) W("warn", "VLANs 1002–1005 are reserved on Cisco platforms.");
    if (S.vendor === "nxos") {
      if (vlanIds.some((v) => v >= 3968)) W("warn", "NX-OS reserves VLANs 3968–4094 for internal use by default.");
      vrfs.forEach((f) => {
        if (f.l3vlan < 2 || f.l3vlan > 3967) W("err", `L3 VNI VLAN ${f.l3vlan} for ${f.name} is outside 2–3967 (NX-OS usable range).`);
        if (seenVlan.has(f.l3vlan)) W("err", `L3 VNI VLAN ${f.l3vlan} for ${f.name} is already a tenant VLAN. Change the L3 VNI VLAN base.`);
      });
    }

    // RD / RT
    const rtOf = (vni) => {
      if (S.rt === "vni-vni") return { g: vni, l: vni, fits: vni <= 65535, t2: false };
      if (S.rt === "rfc8365") return { g: (asn || 0) % 65536, l: 0x10000000 + vni, fits: true, t2: false };
      return { g: asn || 0, l: vni, fits: !asn4 || vni <= 65535, t2: asn4 };
    };
    const rtTxt = (r) => `${r.g}:${r.l}`;
    const rtJunos = (r) => `target:${r.g}${r.t2 ? "L" : ""}:${r.l}`;
    const badRt = [...l2.map((x) => x.vni), ...vrfs.map((f) => f.l3vni)].filter((v) => !rtOf(v).fits);
    if (badRt.length) {
      W("err", S.rt === "vni-vni"
        ? `VNI:VNI route targets need VNIs up to 65,535 (the first field is 2 bytes). ${badRt.length} VNI${badRt.length > 1 ? "s don't" : " doesn't"} fit, e.g. ${badRt[0]}.`
        : `With a 4-byte ASN the RT is Type 2 (4-byte ASN : 2-byte value), so VNIs above 65,535 don't fit, e.g. ${badRt[0]}. Use lower VNIs, the RFC 8365 format or a 2-byte ASN for RTs.`);
    }
    if (asn4 && S.rt === "rfc8365") W("info", `RFC 8365 auto-derived RTs carry a 2-byte ASN, so only the low 16 bits of AS${asn} are used (${asn % 65536}).`);
    // Auto RTs are derived from the local ASN, so they only line up across leaves in a single-AS (iBGP) overlay.
    const autoRtNx = S.auto && S.design === "ibgp" && S.rt === "asn-vni" && !asn4; // NX-OS "route-target auto" = ASN:VNI
    const autoRtJunos = S.auto && S.design === "ibgp" && S.rt === "rfc8365";        // Junos "vrf-target auto" = RFC 8365 format
    if (S.auto && asn4 && S.rt === "asn-vni") W("warn", "With a 4-byte ASN, auto-derived RTs can't hold both the ASN and the VNI, so the generated config uses explicit RTs.");
    if (S.design === "ebgp" && S.auto && S.rt !== "vni-vni")
      W("warn", "eBGP overlay: auto-derived RTs come from each leaf's own ASN, so leaves won't import each other's routes. The generated RTs use one common value (the ASN entered above) on every leaf. On NX-OS you can instead keep auto RTs and add rewrite-evpn-rt-asn on the overlay neighbors.");
    if (S.rt !== "asn-vni" && S.rt !== "rfc8365" && S.auto) W("info", "VNI:VNI isn't what any platform auto-derives, so RTs are written explicitly. RDs still use auto where supported.");

    const rd2 = (rid, vlan) => `${rid}:${32767 + vlan}`;
    const rd3 = (rid, f) => `${rid}:${f.l3vni <= 65535 ? f.l3vni : 100 + f.idx}`;
    const ridOfLeaf = (n) => (ridOk ? int2ip(ridBase + n - 1) : "0.0.0.0");

    // Multicast groups
    let mc = null;
    if (S.repl === "multicast") {
      const b = String(S.mcBase).trim();
      if (!NT.isIPv4(b) || ip2int(b) < ip2int("224.0.0.0") || ip2int(b) > ip2int("239.255.255.255")) W("err", "The multicast group base must be an IPv4 multicast address (224.0.0.0–239.255.255.255).");
      else {
        if (ip2int(b) < ip2int("224.0.1.0")) W("warn", "224.0.0.0/24 is link-local multicast and isn't routed. Use a 239.x.x.x (administratively scoped) group.");
        else if (ip2int(b) < ip2int("239.0.0.0")) W("info", "239.0.0.0/8 (administratively scoped) is the usual choice for underlay BUM groups.");
        const pool = Math.max(1, Math.min(4096, S.mcPool | 0));
        mc = (i) => int2ip(ip2int(b) + (i % pool));
      }
      if (S.vendor !== "nxos") W("info", "The EOS and Junos configs below use ingress replication (EVPN Type-3 routes); multicast underlay config isn't generated for them.");
    }
    if (S.leaves % 2 && S.mh !== "none" && S.dual > 0) W("info", "Dual-homing pairs leaves, but the leaf count is odd. The route count assumes the extra leaf still has dual-homed hosts.");

    return { warn, asn, asn4, vrfs, l2, rtOf, rtTxt, rtJunos, rd2, rd3, ridOfLeaf, mc, autoRtNx, autoRtJunos };
  }

  /* ---------- route scaling ---------- */
  function scale(M) {
    const L = Math.max(1, S.leaves | 0), E = Math.max(0, +S.hosts || 0), a = Math.max(0, S.v4 | 0), b = Math.max(0, S.v6 | 0);
    const dh = S.mh === "none" ? 0 : Math.min(100, Math.max(0, +S.dual || 0)) / 100;
    const s = Math.min(100, Math.max(1, +S.spread || 100)) / 100;
    const nL2 = M.l2.length, nVrf = M.vrfs.length, perVni = Math.ceil(L * s);
    const mult = 1 + dh;
    const rows = [];
    const add = (type, name, count, formula) => rows.push({ type, name, count: Math.round(count), formula });
    add("2", "MAC (MAC-only)", E * L * mult, `${NT.num(E)} endpoints × ${L} leaves${dh ? ` × ${mult.toFixed(2)} (${Math.round(dh * 100)}% dual-homed, advertised by both leaves)` : ""}`);
    add("2", "MAC/IP", E * L * (a + b) * mult, `${NT.num(E)} endpoints × ${L} leaves × ${a + b} IP${a + b === 1 ? "" : "s"} per endpoint (${a} IPv4 + ${b} IPv6)${dh ? ` × ${mult.toFixed(2)}` : ""}`);
    const imet = S.repl === "ingress" || S.vendor !== "nxos"; // NX-OS sends no Type-3 routes for VNIs mapped to a multicast group
    add("3", "Inclusive multicast (IMET)", imet ? nL2 * perVni : 0,
      imet ? `${nL2} L2 VNIs × ${perVni} leaves per VNI (one per VTEP per VNI)` : "None: NX-OS doesn't advertise Type-3 routes for VNIs using a multicast group");
    const sviAfs = (a > 0 ? 1 : 0) + (b > 0 ? 1 : 0);
    add("5", "IP prefix", nVrf * S.ext * S.border + (S.svi ? nL2 * perVni * sviAfs : 0),
      `${nVrf} VRFs × ${S.ext} external prefixes × ${S.border} border leaves` + (S.svi ? ` + ${nL2} subnets × ${perVni} leaves × ${sviAfs} address famil${sviAfs === 1 ? "y" : "ies"} (SVI subnets)` : ""));
    if (S.mh === "esi") {
      const es = (S.esPair | 0) * Math.floor(L / 2);
      add("1", "Ethernet A-D per ES", es * 2, `${NT.num(es)} Ethernet segments × 2 leaves`);
      add("1", "Ethernet A-D per EVI", es * 2 * nL2, `${NT.num(es)} ESs × 2 leaves × ${nL2} EVIs (assumes every L2 VNI on every ES)`);
      add("4", "Ethernet segment", es * 2, `${NT.num(es)} Ethernet segments × 2 leaves`);
    }
    const total = rows.reduce((t, r) => t + r.count, 0);
    const peers = Math.max(1, S.peers | 0);
    return {
      rows, total, peers,
      perLeaf: total * peers,
      mac: Math.round(E * L * s),
      hostRoutes: Math.round(E * L * s * (a + b)),
      nL2, nVrf,
    };
  }

  /* ---------- config generators ---------- */
  // Comment marker. Generators return plain text only; render() escapes every line before it reaches the DOM.
  const MARK = "\u0001";
  const C = (t) => MARK + t;
  function cfgNxos(M, n) {
    const rid = M.ridOfLeaf(n), o = [];
    const rt = (vni) => (M.autoRtNx ? "auto" : M.rtTxt(M.rtOf(vni)));
    o.push(C(`! NX-OS · leaf ${n} · router ID ${rid} · BGP AS ${M.asn}`), "feature bgp", "feature interface-vlan", "feature vn-segment-vlan-based", "feature nv overlay", "nv overlay evpn",
      "fabric forwarding anycast-gateway-mac 2020.0000.00aa", "!");
    M.l2.forEach((x) => o.push(`vlan ${x.vlan}`, `  vn-segment ${x.vni}`));
    M.vrfs.forEach((f) => o.push(`vlan ${f.l3vlan}`, `  name L3VNI-${f.name}`, `  vn-segment ${f.l3vni}`));
    o.push("!");
    M.vrfs.forEach((f) => {
      o.push(`vrf context ${f.name}`, `  vni ${f.l3vni}`, `  rd ${S.auto ? "auto" : M.rd3(rid, f)}`, "  address-family ipv4 unicast",
        `    route-target both ${rt(f.l3vni)}`, `    route-target both ${rt(f.l3vni)} evpn`);
      if (S.v6 > 0) o.push("  address-family ipv6 unicast", `    route-target both ${rt(f.l3vni)}`, `    route-target both ${rt(f.l3vni)} evpn`);
      o.push("!");
    });
    M.vrfs.forEach((f) => {
      o.push(`interface Vlan${f.l3vlan}`, "  no shutdown", `  vrf member ${f.name}`, "  ip forward");
      if (S.v6 > 0) o.push("  ipv6 forward", "  ipv6 address use-link-local-only");
      o.push("!");
    });
    M.l2.forEach((x) => o.push(`interface Vlan${x.vlan}`, "  no shutdown", `  vrf member ${x.vrf}`, "  fabric forwarding mode anycast-gateway", C("  ! ip address <gateway>/<length>"), "!"));
    o.push("interface nve1", "  no shutdown", "  host-reachability protocol bgp", "  source-interface loopback1");
    M.l2.forEach((x, i) => {
      o.push(`  member vni ${x.vni}`, "    suppress-arp");
      o.push(M.mc ? `    mcast-group ${M.mc(i)}` : "    ingress-replication protocol bgp");
    });
    M.vrfs.forEach((f) => o.push(`  member vni ${f.l3vni} associate-vrf`));
    o.push("!", "evpn");
    M.l2.forEach((x) => o.push(`  vni ${x.vni} l2`, `    rd ${S.auto ? "auto" : M.rd2(rid, x.vlan)}`, `    route-target import ${rt(x.vni)}`, `    route-target export ${rt(x.vni)}`));
    o.push("!");
    if (S.svi) o.push("route-map RM-SVI-SUBNETS permit 10", "!");
    o.push(`router bgp ${M.asn}`, `  router-id ${rid}`);
    M.vrfs.forEach((f) => {
      o.push(`  vrf ${f.name}`, "    address-family ipv4 unicast");
      if (S.svi) o.push("      redistribute direct route-map RM-SVI-SUBNETS");
      if (S.v6 > 0) { o.push("    address-family ipv6 unicast"); if (S.svi) o.push("      redistribute direct route-map RM-SVI-SUBNETS"); }
    });
    o.push(C("! suppress-arp needs a TCAM region on some Nexus 9000 models (hardware access-list tcam region arp-ether)."));
    return o.join("\n");
  }
  function cfgEos(M, n) {
    const rid = M.ridOfLeaf(n), o = [];
    const rt = (vni) => M.rtTxt(M.rtOf(vni));
    o.push(C(`! Arista EOS · leaf ${n} · router ID ${rid} · BGP AS ${M.asn}`), "service routing protocols model multi-agent", "!");
    M.l2.forEach((x) => o.push(`vlan ${x.vlan}`));
    o.push("!");
    M.vrfs.forEach((f) => { o.push(`vrf instance ${f.name}`, "!", `ip routing vrf ${f.name}`); if (S.v6 > 0) o.push(`ipv6 unicast-routing vrf ${f.name}`); o.push("!"); });
    o.push("ip virtual-router mac-address 00:1c:73:00:00:99", "!");
    M.l2.forEach((x) => o.push(`interface Vlan${x.vlan}`, `   vrf ${x.vrf}`, C("   ! ip address virtual <gateway>/<length>"), "!"));
    o.push("interface Vxlan1", "   vxlan source-interface Loopback1", "   vxlan udp-port 4789");
    M.l2.forEach((x) => o.push(`   vxlan vlan ${x.vlan} vni ${x.vni}`));
    M.vrfs.forEach((f) => o.push(`   vxlan vrf ${f.name} vni ${f.l3vni}`));
    o.push("!", `router bgp ${M.asn}`, `   router-id ${rid}`);
    M.l2.forEach((x) => o.push("   !", `   vlan ${x.vlan}`, `      rd ${M.rd2(rid, x.vlan)}`, `      route-target both ${rt(x.vni)}`, "      redistribute learned"));
    M.vrfs.forEach((f) => {
      o.push("   !", `   vrf ${f.name}`, `      rd ${M.rd3(rid, f)}`, `      route-target import evpn ${rt(f.l3vni)}`, `      route-target export evpn ${rt(f.l3vni)}`);
      if (S.svi) o.push("      redistribute connected");
    });
    o.push(C("! BUM traffic uses ingress replication built from EVPN Type-3 routes."));
    return o.join("\n");
  }
  function cfgJunos(M, n) {
    const rid = M.ridOfLeaf(n), o = [];
    const asnT = `${M.asn}${M.asn4 ? "L" : ""}`;
    o.push(C(`# Junos (QFX, default-switch) · leaf ${n} · router ID ${rid} · BGP AS ${M.asn}`),
      "set switch-options vtep-source-interface lo0.0",
      `set switch-options route-distinguisher ${rid}:1`,
      `set switch-options vrf-target target:${asnT}:1`);
    if (M.autoRtJunos) o.push("set switch-options vrf-target auto");
    o.push("set protocols evpn encapsulation vxlan", "set protocols evpn extended-vni-list all");
    if (!M.autoRtJunos) M.l2.forEach((x) => o.push(`set protocols evpn vni-options vni ${x.vni} vrf-target ${M.rtJunos(M.rtOf(x.vni))}`));
    M.l2.forEach((x) => o.push(`set vlans V${x.vlan} vlan-id ${x.vlan}`, `set vlans V${x.vlan} vxlan vni ${x.vni}`, `set vlans V${x.vlan} l3-interface irb.${x.vlan}`,
      C(`# set interfaces irb unit ${x.vlan} family inet address <gateway>/<length>`)));
    M.vrfs.forEach((f) => {
      const p = `set routing-instances ${f.name}`;
      o.push(`${p} instance-type vrf`);
      M.l2.filter((x) => x.vrf === f.name).forEach((x) => o.push(`${p} interface irb.${x.vlan}`));
      o.push(`${p} route-distinguisher ${M.rd3(rid, f)}`, `${p} vrf-target ${M.rtJunos(M.rtOf(f.l3vni))}`,
        `${p} protocols evpn ip-prefix-routes advertise direct-nexthop`, `${p} protocols evpn ip-prefix-routes encapsulation vxlan`, `${p} protocols evpn ip-prefix-routes vni ${f.l3vni}`);
    });
    o.push(C("# default-switch uses one RD per VTEP for all VNIs; use mac-vrf instances for per-VNI RDs."));
    return o.join("\n");
  }

  /* ---------- layout ---------- */
  const field = (id, label, input, help) => `<div class="nt-field"><label class="nt-label" for="ev-${id}">${label}</label>${input}${help ? `<small>${help}</small>` : ""}</div>`;
  const num = (id, min, max, step) => `<input class="nt-input" id="ev-${id}" data-k="${id}" type="number" min="${min}" max="${max}" step="${step || 1}" inputmode="numeric">`;
  const txtIn = (id, ph) => `<input class="nt-input" id="ev-${id}" data-k="${id}" type="text" spellcheck="false" autocapitalize="off" placeholder="${ph || ""}">`;
  const sel = (id, opts) => `<select class="nt-select" id="ev-${id}" data-k="${id}">${opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>`;
  const range = (id, min, max, unit) => `<div class="nt-range"><input id="ev-${id}" data-k="${id}" type="range" min="${min}" max="${max}"><output data-for="${id}"></output></div>`;

  root.innerHTML = NT.hero("EVPN VXLAN", "EVPN calculator",
    "Allocate L2 and L3 VNIs from your VLANs and VRFs, generate route distinguishers, route targets and leaf config, and project how many EVPN routes the route reflectors carry.") + `
    <div class="nt-split">
      <section class="nt-panel">
        <p class="nt-section-title">Fabric</p>
        <div class="nt-fields">
          ${field("asn", "BGP AS number", txtIn("asn", "65001"), "Overlay AS. asplain or asdot.")}
          ${field("design", "Overlay design", sel("design", [["ibgp", "iBGP with route reflectors"], ["ebgp", "eBGP (AS per leaf)"]]))}
          ${field("leaves", "Leaf switches (VTEPs)", num("leaves", 1, 1024))}
          ${field("peers", "Overlay peers per leaf", num("peers", 1, 16), "Route reflectors, or eBGP spines.")}
          ${field("rid", "Leaf 1 router ID", txtIn("rid", "10.0.0.1"), "Next leaves count up from this.")}
          ${field("repl", "BUM replication", sel("repl", [["ingress", "Ingress replication (Type-3)"], ["multicast", "Underlay multicast"]]))}
          ${field("mcBase", "Multicast group base", txtIn("mcBase", "239.1.1.0"))}
          ${field("mcPool", "Groups in pool", num("mcPool", 1, 4096), "VNIs share groups round-robin.")}
        </div>
      </section>
      <section class="nt-panel">
        <p class="nt-section-title">VRFs and VLANs <button class="nt-ghost" type="button" data-act="add">Add VRF</button></p>
        <div class="nt-tenants" data-slot="tenants"></div>
        <div class="nt-fields" style="margin-top:1rem">
          ${field("l2base", "L2 VNI = base + VLAN", num("l2base", 0, MAX_VNI))}
          ${field("l3base", "L3 VNI = base + VRF #", num("l3base", 0, MAX_VNI))}
          ${field("l3vlan", "L3 VNI VLAN base", num("l3vlan", 1, 4000), "NX-OS needs a VLAN per L3 VNI.")}
        </div>
      </section>
      <section class="nt-panel">
        <p class="nt-section-title">Route distinguisher and route target</p>
        <div class="nt-fields">
          ${field("rt", "Route target format", sel("rt", [["asn-vni", "ASN:VNI"], ["vni-vni", "VNI:VNI"], ["rfc8365", "RFC 8365 auto-derived"]]))}
          <div class="nt-field full"><span class="nt-label">Keywords</span>
            <label class="nt-check"><span class="nt-switch"><input type="checkbox" role="switch" id="ev-auto" data-k="auto"><span class="nt-track"></span></span><span>Use <code>auto</code> where the platform supports it</span></label></div>
        </div>
        <p class="nt-note" style="margin-top:.8rem">RDs are Type 1, <code>router-ID:number</code>, unique per leaf so route reflectors keep every leaf's path. L2 RDs use 32767 + VLAN (what NX-OS <code>rd auto</code> produces); L3 RDs use the L3 VNI.</p>
      </section>
      <section class="nt-panel">
        <p class="nt-section-title">Route scaling inputs</p>
        <div class="nt-fields">
          ${field("hosts", "Endpoints per leaf", num("hosts", 0, 1000000), "Count each endpoint once, on its main leaf.")}
          ${field("v4", "IPv4 addresses per endpoint", num("v4", 0, 8))}
          ${field("v6", "IPv6 addresses per endpoint", num("v6", 0, 8), "Link-local addresses aren't advertised.")}
          ${field("mh", "Dual-homing", sel("mh", [["vpc", "vPC / MLAG"], ["esi", "EVPN multihoming (ESI)"], ["none", "None"]]))}
          ${field("dual", "Dual-homed endpoints", range("dual", 0, 100))}
          ${field("esPair", "Ethernet segments per leaf pair", num("esPair", 0, 4096), "Used with ESI multihoming.")}
          ${field("spread", "Leaves each VNI is on", range("spread", 1, 100), "100% for the maximum.")}
          ${field("ext", "External prefixes per VRF", num("ext", 0, 1000000), "Type-5 routes from border leaves.")}
          ${field("border", "Border leaves", num("border", 0, 64))}
          <div class="nt-field full"><span class="nt-label">SVI subnets</span>
            <label class="nt-check"><span class="nt-switch"><input type="checkbox" role="switch" id="ev-svi" data-k="svi"><span class="nt-track"></span></span><span>Every leaf advertises its subnets as Type-5</span></label></div>
        </div>
      </section>
    </div>
    <div class="nt-msgs" data-slot="warn" style="margin-top:1rem"></div>
    <div class="nt-bar"><h2 class="nt-section-title" style="margin:0">Control-plane scale</h2><span class="nt-note">Maximum, with the inputs above</span></div>
    <div class="nt-stats" data-slot="stats"></div>
    <div class="nt-table-wrap" style="margin-top:.9rem"><table class="nt-table" aria-label="EVPN routes by route type">
      <thead><tr><th>Type</th><th>Route</th><th>How it's counted</th><th class="r">Routes</th><th>Share</th></tr></thead>
      <tbody data-slot="rows"></tbody><tfoot data-slot="foot"></tfoot></table></div>
    <div class="nt-bar"><h2 class="nt-section-title" style="margin:0">VNI, RD and RT allocation</h2>
      <div class="nt-range" style="min-width:16rem"><label class="nt-label" for="ev-leaf" style="margin:0">RDs for leaf</label><input id="ev-leaf" data-k="leaf" type="range" min="1" max="8"><output data-for="leaf"></output></div></div>
    <div class="nt-table-wrap"><table class="nt-table" aria-label="VNI allocation">
      <thead><tr><th>Kind</th><th>VRF</th><th>VLAN</th><th>VNI</th><th>RD</th><th>RT import / export</th><th>BUM</th></tr></thead>
      <tbody data-slot="alloc"></tbody></table></div>
    <div class="nt-bar"><div class="nt-tabs" role="tablist" aria-label="Platform">
        <button class="nt-tab" role="tab" data-vendor="nxos">Cisco NX-OS</button>
        <button class="nt-tab" role="tab" data-vendor="eos">Arista EOS</button>
        <button class="nt-tab" role="tab" data-vendor="junos">Juniper Junos</button></div>
      <button class="nt-ghost" type="button" data-act="copy-cfg">Copy config</button></div>
    <pre class="nt-code" data-slot="cfg" aria-label="Generated configuration"></pre>
    <p class="nt-foot">Config covers the overlay only (VLAN/VNI, VRF, NVE or VXLAN interface, EVPN RD/RT and BGP VRFs). Add underlay routing, loopbacks and BGP EVPN neighbors yourself, and check syntax against your software release.</p>`;

  /* ---------- form binding ---------- */
  function renderTenants() {
    $(root, "[data-slot=tenants]").innerHTML = S.tenants.map((t, i) => `<div class="nt-tenant">
        <input class="nt-input" data-t="${i}" data-f="name" type="text" spellcheck="false" aria-label="VRF ${i + 1} name" value="${esc(t.name)}" placeholder="VRF name">
        <input class="nt-input" data-t="${i}" data-f="vlans" type="text" spellcheck="false" aria-label="VRF ${i + 1} VLANs" value="${esc(t.vlans)}" placeholder="VLANs, e.g. 10-19, 30">
        <button class="nt-ghost" type="button" data-del="${i}" aria-label="Remove VRF ${i + 1}" ${S.tenants.length < 2 ? "disabled" : ""}>Remove</button></div>`).join("");
  }
  function fill() {
    root.querySelectorAll("[data-k]").forEach((el) => {
      const k = el.dataset.k;
      if (el.type === "checkbox") el.checked = !!S[k]; else el.value = S[k];
    });
    renderTenants();
  }
  function read(el) {
    const k = el.dataset.k;
    if (el.type === "checkbox") S[k] = el.checked;
    else if (el.type === "number" || el.type === "range") S[k] = el.value === "" ? 0 : +el.value;
    else S[k] = el.value;
  }

  /* ---------- render ---------- */
  let lastCfg = "";
  function render() {
    S.leaf = Math.min(Math.max(1, S.leaf | 0), Math.max(1, S.leaves | 0));
    const leafIn = $(root, "#ev-leaf"); leafIn.max = String(Math.max(1, S.leaves | 0)); leafIn.value = S.leaf;
    root.querySelectorAll("output[data-for]").forEach((o) => { const k = o.dataset.for; o.textContent = k === "leaf" ? `#${S.leaf}` : `${S[k]}%`; });
    $(root, "#ev-mcBase").closest(".nt-field").hidden = S.repl !== "multicast";
    $(root, "#ev-mcPool").closest(".nt-field").hidden = S.repl !== "multicast";
    $(root, "#ev-esPair").closest(".nt-field").hidden = S.mh !== "esi";
    $(root, "#ev-dual").closest(".nt-field").hidden = S.mh === "none";
    $(root, "#ev-l3vlan").closest(".nt-field").hidden = S.vendor !== "nxos";
    root.querySelectorAll("[data-vendor]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.vendor === S.vendor)));

    const M = model();
    const order = { err: 0, warn: 1, info: 2 };
    $(root, "[data-slot=warn]").innerHTML = M.warn.sort((a, b) => order[a[0]] - order[b[0]]).map(([k, t]) => NT.msg(k, esc(t))).join("");
    const hasErr = M.warn.some(([k]) => k === "err");

    // scale
    const R = scale(M);
    $(root, "[data-slot=stats]").innerHTML = `
      <div class="nt-stat lead"><b>${NT.num(R.total)}</b><span>EVPN routes held by each ${S.design === "ibgp" ? "route reflector" : "spine"} (one path per originating leaf)</span></div>
      <div class="nt-stat"><b>${NT.num(R.perLeaf)}</b><span>Paths each leaf receives from ${R.peers} overlay peer${R.peers > 1 ? "s" : ""}, before RT import filtering</span></div>
      <div class="nt-stat"><b>${NT.num(R.mac)}</b><span>MAC entries per leaf, local and remote, in the VNIs it carries</span></div>
      <div class="nt-stat"><b>${NT.num(R.hostRoutes)}</b><span>Host routes (/32 and /128) per leaf with symmetric IRB</span></div>`;
    const max = Math.max(1, ...R.rows.map((r) => r.count));
    $(root, "[data-slot=rows]").innerHTML = R.rows.map((r) => {
      const share = R.total ? (r.count / R.total) * 100 : 0;
      return `<tr title="Type-${r.type} ${esc(r.name)}: ${NT.num(r.count)} routes (${share.toFixed(1)}%)">
        <td><span class="nt-chip mono">Type-${r.type}</span></td><td style="font-family:var(--nt-font); font-weight:600">${esc(r.name)}</td>
        <td class="wrap">${esc(r.formula)}</td><td class="r">${NT.num(r.count)}</td>
        <td><div style="display:flex; align-items:center; gap:.6rem"><div class="nt-hbar" style="flex:1"><i style="width:${(r.count / max) * 100}%"></i></div><span class="nt-note" style="min-width:3.2rem; text-align:right">${share.toFixed(1)}%</span></div></td></tr>`;
    }).join("");
    $(root, "[data-slot=foot]").innerHTML = `<tr><td colspan="3" style="font-family:var(--nt-font)">Total at each ${S.design === "ibgp" ? "route reflector" : "spine"}</td><td class="r">${NT.num(R.total)}</td><td></td></tr>`;

    // allocation
    const rid = M.ridOfLeaf(S.leaf);
    // "(auto)" only where the selected platform's config really uses the auto keyword for that RT
    const isAuto = (l3) => (S.vendor === "nxos" && M.autoRtNx) || (S.vendor === "junos" && M.autoRtJunos && !l3);
    const rtCell = (vni, l3) => { const r = M.rtOf(vni); return r.fits ? esc(M.rtTxt(r)) + (isAuto(l3) ? ' <span class="nt-note">(auto)</span>' : "") : '<span style="color:var(--nt-err-ink)">doesn\'t fit</span>'; };
    let i2 = 0, rows = "";
    M.vrfs.forEach((f) => {
      rows += `<tr><td><span class="nt-chip ok">L3</span></td><td>${esc(f.name)}</td><td>${S.vendor === "nxos" ? f.l3vlan : "–"}</td><td>${NT.num(f.l3vni)}</td><td>${esc(M.rd3(rid, f))}</td><td>${rtCell(f.l3vni, true)}</td><td>–</td></tr>`;
      M.l2.filter((x) => x.vrf === f.name).forEach((x) => {
        rows += `<tr><td><span class="nt-chip">L2</span></td><td>${esc(x.vrf)}</td><td>${x.vlan}</td><td>${NT.num(x.vni)}</td><td>${esc(S.vendor === "junos" ? `${rid}:1` : M.rd2(rid, x.vlan))}</td><td>${rtCell(x.vni, false)}</td><td>${M.mc && S.vendor === "nxos" ? esc(M.mc(i2)) : "Ingress replication"}</td></tr>`;
        i2++;
      });
    });
    $(root, "[data-slot=alloc]").innerHTML = rows || `<tr><td colspan="7" style="font-family:var(--nt-font)">Add a VRF with at least one VLAN.</td></tr>`;

    // config
    const cfgEl = $(root, "[data-slot=cfg]");
    if (hasErr || M.asn == null) { cfgEl.innerHTML = `<span class="c">! Fix the errors above to generate configuration.</span>`; lastCfg = ""; }
    else {
      const text = S.vendor === "nxos" ? cfgNxos(M, S.leaf) : S.vendor === "eos" ? cfgEos(M, S.leaf) : cfgJunos(M, S.leaf);
      cfgEl.innerHTML = text.split("\n")
        .map((l) => (l[0] === MARK ? `<span class="c">${esc(l.slice(1))}</span>` : esc(l)))
        .join("\n");
      lastCfg = cfgEl.textContent;
    }
    NT.store.set("evpn", S);
  }

  /* ---------- events ---------- */
  root.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.k) { read(el); render(); }
    else if (el.dataset.t != null) { S.tenants[+el.dataset.t][el.dataset.f] = el.value; render(); }
  });
  root.addEventListener("change", (e) => { if (e.target.tagName === "SELECT" && e.target.dataset.k) { read(e.target); render(); } });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.act === "add") { S.tenants.push({ name: `TENANT-${String.fromCharCode(65 + (S.tenants.length % 26))}`, vlans: "" }); renderTenants(); render(); root.querySelector(`[data-t="${S.tenants.length - 1}"][data-f="vlans"]`).focus(); }
    else if (b.dataset.del != null) { S.tenants.splice(+b.dataset.del, 1); renderTenants(); render(); }
    else if (b.dataset.vendor) { S.vendor = b.dataset.vendor; render(); }
    else if (b.dataset.act === "copy-cfg" && lastCfg) NT.copy(lastCfg, "Copied config");
  });

  fill();
  render();
  NT.masonry($(root, ".nt-split")); // pack the four input panels, they differ a lot in height
});
