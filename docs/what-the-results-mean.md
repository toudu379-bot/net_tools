# What the results mean

A plain-language guide to every output in the tools. No background needed.

**Colours are the same everywhere:** green = found and healthy · grey = nothing there, and that's fine · amber = works, but worth fixing · red = broken or missing something important.

Live: <https://toudu379-bot.github.io/net_tools/>

---

## DNS Lens

DNS is the internet's address book: it turns a name like `cloudflare.com` into the numbers computers use. This tool asks for every kind of entry at once.

**Each card is one kind of entry:**

| Card | What it tells you |
|---|---|
| **A** | The IPv4 address the name points to. |
| **AAAA** | The same, but a newer-style (IPv6) address. |
| **CNAME** | This name is a nickname for another name. |
| **MX** | Which servers receive email for the domain. The small number is the order they're tried. |
| **NS** | The servers that hold the official answers for this domain. |
| **TXT** | Free text. Mostly used to prove ownership and to list who may send email. |
| **SOA** | Admin details for the domain: who runs it and how often other servers refresh their copy. |
| **CAA** | Which certificate companies are allowed to issue HTTPS certificates for the domain. |
| **SRV** | Where a specific service lives, such as a chat or phone system. |
| **PTR** | The name behind an IP address — the reverse of an A record. |
| **HTTPS / SVCB** | Hints that let browsers connect faster and more securely. |
| **DS / DNSKEY** | The keys used to prove answers haven't been tampered with. |
| **TLSA** | Pins which certificate a service should present. |
| **NAPTR** | Old-style rules, mainly for phone number lookups. |

**Other things on the page:**

- **The switch on each card** turns that lookup on or off.
- **TTL** (e.g. `5m`) is how long other computers may remember the answer before asking again. Changes take about this long to spread.
- **"No records"** in grey means the domain simply doesn't use that kind of entry. Normal.
- **The counter** at the top: how many kinds were found, were empty, or failed.
- **The `dig` line** is the equivalent command for people who prefer the command line.

**The DNSSEC banner** answers: can these answers be trusted?

| Verdict | Meaning |
|---|---|
| **Signed and validated** | Answers are digitally signed and the signature checks out. Best case. |
| **Signed, but not validated** | Signatures exist, but this particular server didn't verify them. |
| **Signed, but not delegated** | Keys exist, but the parent domain doesn't point at them, so nobody actually checks them. |
| **Bogus** | Signatures are broken. Many people won't be able to reach the site at all. Fix urgently. |
| **Not signed** | No protection. Common, but a faked answer can't be detected. |

---

## Subnet calculator

Splits a block of IP addresses into networks, the way you'd divide a street into house numbers.

**Details tab:**

| Field | Meaning |
|---|---|
| **Host address** | The address you typed. |
| **Network address** | The first address of the block — its "street name". Not usable by a device. |
| **Broadcast address** | The last address, used to talk to everyone on the block at once. Also not usable by a device. |
| **Network mask** and **/26** | How big the block is. A bigger number after the slash means a smaller block. |
| **Cisco wildcard** | The same mask written upside down, as some equipment expects. |
| **Addresses in network** | Total addresses in the block. |
| **Usable hosts** | How many devices you can actually connect. |
| **Network range** | First and last address, including the two unusable ones. |
| **Usable range** | The addresses you can hand out to devices. |
| **Address class / type** | Whether the block is private (internal use), public (on the internet), or reserved for a special purpose. |
| **Reverse DNS zone** | Where the "IP address to name" entries for this block live. |
| **Address in binary** | The address in ones and zeros. Blue digits are fixed by the network; grey digits identify individual devices. |
| **Neighbouring networks** | The blocks immediately before and after, and the larger block containing this one. |

For IPv6 you also get the **expanded** (full) and **compressed** (short) forms of the address, and how many smaller networks fit inside.

**Other tabs:**

- **Split** — cut the block into equal smaller blocks, listing each one.
- **Summarise** — paste a list of blocks and get the shortest equivalent list.
- **Range to CIDR** — give a first and last address, get the blocks that cover exactly that range.

---

## Email security check

Answers one question: **can someone send email pretending to be this domain?**

**The grade (A to F)** is the summary. A means spoofed mail gets rejected; F means anyone can fake it.

| Card | Meaning |
|---|---|
| **MX** | The servers that receive the domain's email, and which provider runs them. |
| **SPF** | The list of servers allowed to send email as this domain. The meter shows how much of a fixed budget of 10 lookups it uses — over 10 and it stops working everywhere. The tree shows where the entries come from. |
| **DMARC** | What receivers should do with fake mail: nothing (`none`), send to spam (`quarantine`), or refuse it (`reject`). Only the last two actually protect you. |
| **DKIM** | The keys used to sign outgoing mail so receivers can tell it's genuine. "No key found" doesn't prove there is none — providers use their own names for keys, which you can enter in the box. |
| **MTA-STS** | Forces other mail servers to use encryption when delivering to you. Optional. |
| **TLS-RPT** | Sends you reports when that encryption fails. Optional. |
| **BIMI** | Shows your logo next to your mail in some inboxes. Needs DMARC set to quarantine or reject first. |

**If the domain isn't used for email at all,** the tool says so and gives you the three short records that stop anyone from faking it.

---

## WHOIS & IP info

Who owns a domain, an IP address or a network, and where it is.

**For a domain:**

| Card | Meaning |
|---|---|
| **Registration** | Who the domain is registered through, when it was registered and when it expires. Red means expired, amber means expiring within a month. |
| **Domain status** | Locks on the domain. Transfer and delete locks are good: they stop it being moved or deleted without permission. "On hold" is bad: the domain won't work. |
| **Nameservers** | The servers answering for the domain. |
| **Contacts** | The owner, if published, plus the address for reporting abuse. Most owners are hidden for privacy — that's normal and legal. |
| **Points to** | The IP addresses the domain currently resolves to. |

**For an IP address:**

| Card | Meaning |
|---|---|
| **Location** | Roughly where the address is, and which company runs it. City-level accuracy at best; it often shows the provider's office, not the real device. |
| **Network registration** | The official record: which block it belongs to, which company holds it, and where to report abuse. |
| **Routing** | Which network announces this address to the internet, whether that announcement is cryptographically authorised (**RPKI**), and how many of the internet's observation points can see it. |
| **Reverse DNS** | The name attached to the address, if any. |

**For an AS number** (an AS is one network operator's slice of the internet): its name, whether it's currently visible on the internet, its self-published profile on PeeringDB, and the list of address blocks it announces.

---

## BGP looking glass

BGP is how networks tell each other which addresses they can reach. This tool shows what the world sees for one block of addresses, using public observation points.

**The three tiles** at the top: whether the announcement is authorised (RPKI), how widely it's visible, and the exact block being examined.

| Card | Meaning |
|---|---|
| **Origin and RPKI** | Which network announces this block, and whether the real owner has signed a statement allowing it. **Valid** = authorised. **Invalid** = not authorised, and many networks will refuse to carry it — this is what a hijack looks like, and also what a forgotten update looks like. **Not found** = no statement exists, so nobody can tell. |
| **Visibility** | How many observation points see this block. Near 100% is normal. Low means the announcement isn't reaching most of the internet — or that it's being filtered, which is exactly what happens to RPKI-invalid routes. |
| **Upstream networks** | The networks that pass this traffic along, and how many observation points reach it through each one. Effectively who provides connectivity. |
| **Route objects** | Entries in a public registry saying who may announce this block. If they disagree with reality, some networks will drop the traffic. |
| **Recent activity** | How often the route was announced or withdrawn in the last day. A lot of churn means something is unstable. |
| **AS paths per peer** | The raw detail: for each observation point, the chain of networks the traffic passes through. The bold number at the end is the network that owns the block. |

---

## EVPN calculator

A planning tool for data-centre networks. You describe the fabric, it produces the numbering, the configuration and a size estimate. Unlike the other tools, it doesn't look anything up — it calculates.

**What you type in:** your AS number, how many switches, your tenants (VRFs) and their VLANs, and how many devices you expect.

| Output | Meaning |
|---|---|
| **Control-plane scale tiles** | How many routes the central route reflectors will hold, how many each switch receives, and how many MAC addresses and host routes each switch must store. These are the numbers that decide whether your hardware copes. |
| **Route breakdown table** | The same total split by route type, with the sum shown for each. Usually device addresses (Type-2) dominate. |
| **Allocation table** | The generated numbering: each VLAN and tenant gets a unique network ID (VNI), a route distinguisher (RD) that keeps each switch's entries distinct, and route targets (RT) that decide which switches import which entries. |
| **VXLAN MTU** | Wrapping traffic adds 50 bytes (70 over IPv6), so the network underneath must carry bigger packets than the servers send. This shows the number to configure, how much spare room you have, and warns when it's too small — which causes large transfers to hang while ping still works. The number differs per platform: Juniper counts the Ethernet header, the others don't. |
| **Configuration** | Ready-to-paste config for Cisco NX-OS, Arista EOS, Juniper Junos or NVIDIA Cumulus Linux, for the switch you pick with the slider. It covers the overlay only — you still add the underlying network, and you should check it against your software version. |
| **Warnings** | Red must be fixed before the config is generated (for example a VLAN in two tenants). Amber and blue are advice, such as a number that won't fit a platform's limits. |

There's a longer, more technical guide in [evpn-calculator.md](evpn-calculator.md).

---

## Things none of these tools can do

They run entirely inside your browser, which rules out: ping, traceroute, port scans, connecting to a specific server to test it, and reading another website's certificate. Those need a server to run from.
