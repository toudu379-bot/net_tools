# EVPN calculator — how to use it

Live: <https://toudu379-bot.github.io/net_tools/evpn/>

It does three jobs for a VXLAN EVPN fabric:

1. Turns your VLANs and VRFs into L2 and L3 VNIs.
2. Generates route distinguishers, route targets and per-leaf overlay config for NX-OS, EOS and Junos.
3. Projects how many EVPN routes the route reflectors and leaves will carry.

Everything runs in the browser and your inputs stay in that browser. Nothing is sent anywhere.

---

## Quick start

1. Set the **BGP AS number**, **leaf count** and **leaf 1 router ID** under *Fabric*.
2. List your tenants under *VRFs and VLANs*: one VRF per row, its VLANs as `10-12, 20`.
3. Check the VNI bases. `L2 VNI = base + VLAN` and `L3 VNI = base + VRF number`.
4. Pick a **route target format** under *Route distinguisher and route target*.
5. Fill in *Route scaling inputs* with the endpoint numbers you expect.

Results update as you type. Read any warnings above the results first: red ones mean the config isn't generated.

---

## Fabric

| Field | What it's for |
|---|---|
| **BGP AS number** | The overlay AS. Takes asplain (`65001`, `4200000001`) or asdot (`65000.100`). Used in route targets and the generated BGP config. |
| **Overlay design** | *iBGP with route reflectors* is one AS everywhere. *eBGP* means an AS per leaf, which changes how route targets must be written (see below). |
| **Leaf switches (VTEPs)** | How many leaves advertise into the fabric. Drives both the route counts and the router IDs. |
| **Overlay peers per leaf** | How many route reflectors (or eBGP spines) each leaf peers with. Each one sends its own copy of every route. |
| **Leaf 1 router ID** | The loopback of the first leaf. Later leaves count up from it, so `10.0.0.1` with 8 leaves gives `10.0.0.1`–`10.0.0.8`. This is what RDs are built from. |
| **BUM replication** | *Ingress replication* floods through EVPN Type-3 routes. *Underlay multicast* uses a group per VNI, which removes Type-3 routes on NX-OS. |
| **Multicast group base / groups in pool** | Only with a multicast underlay. VNIs take groups from the pool in turn, so a pool of 16 reuses groups after 16 VNIs. |

---

## VRFs and VLANs

One row per tenant VRF. VLANs accept single IDs and ranges: `10-12, 20, 100-101`.

**VNI scheme**

- `L2 VNI = L2 base + VLAN ID` — with base 10000, VLAN 10 becomes 10010. Keeping the VLAN ID visible in the VNI makes troubleshooting much easier.
- `L3 VNI = L3 base + VRF number` — with base 50000, the first VRF gets 50001.
- `L3 VNI VLAN base` — NX-OS needs a VLAN per L3 VNI. The first VRF gets 3901 with base 3900. EOS and Junos don't need this, so the field only appears for NX-OS.

**What gets checked**

- VNIs inside the 24-bit range (1–16,777,215), and inside NX-OS's narrower `vn-segment` range (4096–16,773,119).
- The same VNI used twice, including an L2 VNI colliding with an L3 VNI.
- A VLAN placed in two VRFs.
- VLANs that platforms reserve: VLAN 1, 1002–1005 on Cisco, and 3968–4094 which NX-OS keeps for internal use.
- An L3 VNI VLAN that clashes with a tenant VLAN.

---

## Route distinguishers and route targets

### RDs

The tool generates **Type 1** RDs, `router-ID:number`:

- **L2:** `router-ID:(32767 + VLAN)` — this is exactly what NX-OS `rd auto` produces, so explicit and auto config match.
- **L3:** `router-ID:L3 VNI`, or `router-ID:(100 + VRF number)` if the L3 VNI is above 65,535.
- **Junos** in `default-switch` uses one RD per VTEP (`router-ID:1`) for every VNI. Per-VNI RDs need MAC-VRF instances.

Two things worth knowing:

- An RD is **not** a route target. It only makes a route unique; it doesn't decide who imports it.
- The RD should differ per leaf. That's why it's built from the router ID. If every leaf used the same RD, a route reflector would see one leaf's route as a replacement for another's and only pass on the best path — which breaks multihoming and slows convergence.

**RD types**, since the naming trips people up:

| Type | Format | Fits a VNI? |
|---|---|---|
| 0 | 2-byte ASN : 4-byte value | Yes, any VNI |
| 1 | IPv4 address : 2-byte value | Only up to 65,535 |
| 2 | 4-byte ASN : 2-byte value | Only up to 65,535 |

So `ASN:VNI` is a **Type 0** RD, not Type 1, and it only works with a 2-byte ASN.

### RTs

Three formats:

| Format | Value | Use it when |
|---|---|---|
| **ASN:VNI** | `65001:10010` | The usual choice. Matches what NX-OS `route-target auto` derives. |
| **VNI:VNI** | `10010:10010` | The fabric has no single ASN (eBGP per leaf), or you want RTs independent of the AS number. Needs VNIs ≤ 65,535. |
| **RFC 8365 auto-derived** | `65001:268445466` | Matches Junos `vrf-target auto`. The second field is `268435456 + VNI`. |

**Auto keywords.** With the toggle on, the config uses `rd auto` and `route-target auto` where the platform derives the same value you picked:

- **NX-OS** auto RTs are `ASN:VNI`, so they're used only with the ASN:VNI format, a 2-byte ASN and an iBGP overlay.
- **Junos** `vrf-target auto` follows RFC 8365, so it's used only with that format.
- **EOS** config always uses explicit values.

When auto doesn't apply, explicit RTs are written instead and a warning says why.

**Two traps the tool warns about**

- **4-byte ASNs.** `ASN:VNI` then needs a Type 2 RT (4-byte ASN : 2-byte value), so VNIs above 65,535 don't fit. Use lower VNIs, the RFC 8365 format, or a 2-byte ASN for RTs.
- **eBGP overlays.** Auto RTs come from each leaf's *own* ASN, so leaves never import each other's routes. The tool writes one common RT value on every leaf instead. On NX-OS you can keep auto RTs and add `rewrite-evpn-rt-asn` on the overlay neighbors.

**Mixed-vendor fabrics:** don't use auto RTs at all. NX-OS derives `ASN:VNI` while Junos derives the RFC 8365 form, so the two never match.

---

## Route scaling

### Inputs

| Field | Meaning |
|---|---|
| **Endpoints per leaf** | Count each endpoint once, on its main leaf. Don't count a dual-homed server twice; the dual-homing slider handles that. |
| **IPv4 / IPv6 addresses per endpoint** | How many addresses each endpoint advertises. Link-local addresses aren't advertised, so a dual-stack server is usually 1 and 1. |
| **Dual-homing** | *vPC/MLAG* and *ESI* both mean two leaves advertise the same endpoint. *ESI* adds Type-1 and Type-4 routes. |
| **Dual-homed endpoints** | The share of endpoints attached to two leaves. |
| **Ethernet segments per leaf pair** | ESI only. Roughly one per dual-homed device or port channel. |
| **Leaves each VNI is on** | 100% means every VLAN is stretched to every leaf: the worst case. Lower it for a realistic fabric. |
| **External prefixes per VRF / border leaves** | Type-5 routes injected from outside, such as a default route or a WAN table. |
| **SVI subnets** | Whether every leaf advertises its own SVI subnets as Type-5 routes. |

### How each number is worked out

With `E` endpoints per leaf, `L` leaves, `d` the dual-homed share, `s` the VNI spread, and `m = 1 + d`:

| Route type | Count |
|---|---|
| Type-2 MAC | `E × L × m` |
| Type-2 MAC/IP | `E × L × (IPv4 + IPv6) × m` |
| Type-3 IMET | `L2 VNIs × ceil(L × s)`, and zero on NX-OS with a multicast underlay |
| Type-5 IP prefix | `VRFs × external prefixes × border leaves` plus, with SVI subnets on, `L2 VNIs × ceil(L × s) × address families` |
| Type-1 per-ES | `Ethernet segments × 2` |
| Type-1 per-EVI | `Ethernet segments × 2 × L2 VNIs` |
| Type-4 | `Ethernet segments × 2` |

where `Ethernet segments = segments per leaf pair × floor(L / 2)`.

The four tiles above the table are:

- **Routes per route reflector** — the sum of the table. One path per originating leaf.
- **Paths per leaf** — that total × overlay peers, because every RR sends its own copy. This is what arrives *before* RT filtering, so it's the Adj-RIB-In size, not what the leaf installs. It's a slight over-estimate: a reflector doesn't send a leaf its own routes back.
- **MAC entries per leaf** — `E × L × s`, local and remote, for the VNIs that leaf carries.
- **Host routes per leaf** — `E × L × s × (IPv4 + IPv6)`, the /32 and /128 routes symmetric IRB installs.

### Reading it

Type-2 MAC/IP routes almost always dominate. If the total is uncomfortable, the levers are, in order: fewer stretched VLANs (lower the spread), fewer IPs per endpoint, ARP suppression to cut churn rather than count, and smaller failure domains rather than one large fabric.

---

## VXLAN MTU

VXLAN wraps the whole original Ethernet frame inside UDP, so the underlay has to carry more than the tenants send.

| Underlay | Added to the IP MTU |
|---|---|
| IPv4 | **50 bytes** — outer IP 20 + UDP 8 + VXLAN 8 + inner Ethernet 14 |
| IPv6 | **70 bytes** |
| Transport VLAN tag | nothing — it sits outside the IP packet, so it only grows the frame on the wire (+4) |
| MACsec | nothing — it sits below IP too, and needs 32 bytes of spare port budget instead (+32 on the wire) |

So a 1500-byte tenant MTU needs an underlay IP MTU of 1550, and 9000 needs 9050.

**The number you type differs per platform**, which is the part that bites in mixed fabrics:

| Platform | `mtu` means | For a 1500-byte tenant MTU | Maximum |
|---|---|---|---|
| Cisco NX-OS | IP MTU, header excluded | 1550 | 9216 |
| Arista EOS | IP MTU, header excluded | 1550 | 9214 |
| NVIDIA Cumulus Linux | IP MTU, header excluded (Linux) | 1550 | 9216 (also the default) |
| Juniper Junos | **includes** the 14-byte Ethernet header, and the VLAN tag when tagged | **1564** | 9216 |

Set 9216 on a Nexus and 9216 on a Junos box and they do **not** match: the Junos interface carries 14 bytes less.

The panel also shows the largest tenant MTU your underlay allows, the resulting TCP MSS, and turns red when the underlay is too small or the result exceeds the platform's maximum. MTU lines are added to the generated config.

**Why it matters:** VTEPs don't fragment. If the underlay is too small, full-size frames are dropped without any message — ping succeeds, large transfers hang. Clamping TCP MSS hides it for TCP only.

## The five controls, in detail

### "RDs for leaf" slider

**What it does:** nothing to the fabric — it only picks which leaf's numbers you're looking at. Leaf 1 uses the router ID you entered, leaf 2 the next address, and so on. Move it and the RD column and the configuration below switch to that leaf.

**Why RDs differ per leaf at all:** the RD makes a route unique, it doesn't decide who imports it (that's the RT). Every leaf advertises the same MAC and IP addresses for a stretched VLAN, so if two leaves used the same RD, a route reflector would see their routes as the same NLRI, run best-path and pass on only one. The result: lost redundancy, slower convergence, and all-active multihoming that doesn't work. Building the RD from each leaf's router ID keeps every leaf's copy distinct.

**Effect on scale:** none directly — but it's why the route counts multiply by the number of leaves. With per-leaf RDs, a dual-homed host produces two routes at the reflector rather than one.

**Use it to:** copy the config for each leaf in turn, and to check that no two leaves end up with the same RD.

### "Transport VLAN tag (+4)" switch

**Turn it on when** the fabric links between leaf and spine are tagged — a trunk carrying a tagged subinterface for the underlay, rather than a plain routed port. Typical with `interface Ethernet1/1.100` on NX-OS, `et-0/0/1.100` on Junos, or where the underlay shares a link with other VLANs. Leave it off for untagged routed ports, which is the usual data-centre build.

**What it changes, per platform:**

| Platform | Effect |
|---|---|
| **Juniper Junos** | The configured number grows by 4, because Junos MTU includes the Ethernet header *and* the VLAN tag. 1564 becomes 1568. |
| **NX-OS, EOS, Cumulus** | The configured number doesn't change — their `mtu` is the IP MTU, which sits inside the tag. The port still has to carry 4 bytes more, which it does by default on any jumbo-capable switch. |

So the switch matters most if Junos is in the fabric. Everywhere else it only changes the "frame on the wire" figure.

### "MACsec on fabric links (+32)" switch

**Turn it on when** the leaf–spine links encrypt with MACsec (802.1AE) — common between buildings, over leased fibre, or to meet a compliance requirement. Off for ordinary links inside one data hall.

**What it actually costs:** 32 bytes on the wire (the SecTAG with SCI, plus the 16-byte ICV). MACsec works below IP, so it does **not** raise the MTU you configure. What it does is eat the port's frame budget — so the tool keeps the configured number the same and takes 32 bytes off your headroom. On a 9216-byte port that leaves a tenant MTU of 9134 rather than 9166.

**Platform support:** Cisco Nexus (specific line cards and fixed platforms), Arista 7280/7500 series, Juniper QFX with MACsec-capable PICs, and NVIDIA Spectrum-2 and later. Support is per-port and per-licence on most of them, so check the model, not just the OS.

**The failure mode:** MACsec is usually turned on after the fabric is built. If the ports were already at their maximum MTU, the extra 32 bytes don't fit and full-size frames start dropping the moment encryption is enabled.

### "Use auto where the platform supports it" switch

**What it does:** emits `rd auto` and `route-target auto` instead of explicit values, where the chosen platform derives the same value the tool would write.

**What each platform derives:**

| Platform | Auto RD | Auto RT |
|---|---|---|
| Cisco NX-OS | router-id:(32767 + VLAN) | ASN:VNI |
| Juniper Junos | router-id:n per VTEP | RFC 8365 form: ASN:(268435456 + VNI) |
| NVIDIA Cumulus (FRR) | router-id:index | AS:VNI, using only the low 2 bytes of a 4-byte AS |
| Arista EOS | written explicitly by this tool | written explicitly |

**Effect on the fabric:** auto RTs only line up when every leaf derives the same value. They break in three cases, and the tool warns about each:

- **eBGP overlay** — each leaf derives the RT from its own ASN, so leaves never import each other's routes. The tool writes one common RT instead. NX-OS can keep auto RTs if you add `rewrite-evpn-rt-asn` on the overlay neighbours.
- **4-byte ASN** — the RT has no room for both a 4-byte ASN and a large VNI, so platforms substitute something: the tool writes explicit RTs.
- **Mixed vendors** — NX-OS derives `ASN:VNI` while Junos derives the RFC 8365 form. They never match, so a mixed fabric must use explicit RTs everywhere.

**Effect on scale:** none. RDs and RTs don't change how many routes exist or how many a leaf receives; the RT only decides which of those a leaf imports into a VRF. Auto is about shorter config and fewer typos, not performance.

### "Every leaf advertises its subnets as Type-5" switch

**What it does:** adds `redistribute direct`/`connected` so each leaf announces the subnets of its own SVIs as EVPN Type-5 prefix routes, on top of the per-host Type-2 routes it already sends.

**Use it when:**
- You have **silent hosts** — devices that never send traffic unprompted, so no leaf has learned their MAC or ARP entry. Without a subnet route, traffic towards them has nowhere to go.
- You need the tenant's subnets visible to a **border leaf or WAN router** that doesn't hold host routes.

**Leave it off when** every host talks regularly, which is the common case. Host routes are enough, and they're more specific.

**What it costs:** one route per subnet per advertising leaf, per address family. In the default example that's 6 subnets × 8 leaves × 2 families = 96 extra routes — small next to the Type-2 count, but it grows with every stretched VLAN.

**Important:** NVIDIA's own guidance is to enable this on **one VTEP per subnet, or two for redundancy** — not on every leaf. The tool's switch models the maximum, so if you follow that advice, divide the SVI part of the Type-5 figure by the number of leaves and multiply by 2.

**Per platform:**

| Platform | What the tool generates |
|---|---|
| Cisco NX-OS | `redistribute direct route-map RM-SVI-SUBNETS` under the VRF address family |
| Arista EOS | `redistribute connected` under `router bgp … vrf` |
| Juniper Junos | `ip-prefix-routes advertise direct-nexthop` in the routing instance |
| NVIDIA Cumulus | `redistribute connected` plus `route-export to-evpn` for the VRF |

## The allocation table and config

The table lists every L2 and L3 VNI with its RD, RT and BUM handling. The **RDs for leaf** slider changes which leaf's RDs are shown; the RT stays the same because RTs are fabric-wide.

Below it, pick **Cisco NX-OS**, **Arista EOS**, **Juniper Junos** or **NVIDIA Cumulus Linux** (NVUE) and copy the config for that leaf. It covers the overlay only:

- VLAN to VNI mapping, and the L3 VNI VLAN on NX-OS
- VRF definitions with RD and RT
- Anycast gateway SVIs, with the IP address left as a placeholder for you to fill in
- The NVE / Vxlan1 interface, including the multicast group per VNI on NX-OS
- EVPN RD/RT blocks and the BGP VRF address families

**Not included:** underlay routing, loopbacks, BGP neighbors, interface configs and anything platform-specific such as TCAM carving for ARP suppression on some Nexus 9000 models, or `nv config apply` prerequisites on Cumulus. Check the syntax against your software release before pasting it into a switch.

---

## Assumptions and limits

- Route counts are a **maximum**: every VNI on every leaf at 100% spread, and every L2 VNI present on every Ethernet segment.
- A dual-homed endpoint is counted as two advertisements. With vPC and a shared anycast VTEP IP, both peers still advertise with their own RD, so the reflector holds two paths.
- Endpoints are assumed to spread evenly across VNIs and leaves.
- The tool doesn't model platform table limits, BGP convergence, or ARP/ND suppression cache sizes.
- Type-3 behaviour with a multicast underlay follows NX-OS. EOS and Junos configs here use ingress replication.

## Background

- RFC 7432 — BGP MPLS-Based Ethernet VPN (route types, RDs, RTs)
- RFC 8365 — A Network Virtualization Overlay Solution Using EVPN (VXLAN, auto-derived RTs)
- RFC 7348 — VXLAN (the 24-bit VNI)
- RFC 4364 §4.2 — route distinguisher types 0, 1 and 2
