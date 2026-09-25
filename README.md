# net_tools

Network tools that run entirely in the browser: no backend, nothing stored. Styled to match [tomislavk.blog](https://tomislavk.blog/) and built to drop into any Jekyll site on GitHub Pages.

Live: https://toudu379-bot.github.io/net_tools/

| Tool | Path | What it does |
|---|---|---|
| DNS Lens | `dns-lens/` | Every DNS record type for a name (A, AAAA, CNAME, MX, NS, TXT, SOA, CAA, SRV, PTR, HTTPS, SVCB, DS, DNSKEY, TLSA, NAPTR), with a slider per type. |
| Subnet calculator | `subnet/` | sipcalc-style IPv4/IPv6 details, a prefix slider and bit view, splitting a network, summarising a list of networks, and range to CIDR. |
| Email security | `email-check/` | MX, SPF with the 10-lookup count and include tree, DMARC, DKIM key size per selector, BIMI, MTA-STS and TLS-RPT, with an overall grade. |
| WHOIS & IP info | `whois/` | RDAP registration data for domains, IPs and ASNs; BGP routing and announced prefixes from RIPEstat; location and reverse DNS for IPs. |
| EVPN calculator | `evpn/` | VLAN → L2 VNI and VRF → L3 VNI allocation, Type 1 RDs and RTs (ASN:VNI, VNI:VNI or RFC 8365), NX-OS / EOS / Junos overlay config per leaf, and EVPN route scaling at the route reflectors by route type. |
| Location badge | any header | Visitor's IP with country flag. Click for ISP, city and time zone. |

Every tool reads `?q=` from the URL, so links such as `whois/?q=AS13335` or `subnet/?q=10.0.0.0/22` open straight to a result.

Notes: [How to use the EVPN calculator](docs/evpn-calculator.md).

## Files

```
assets/net-tools/
  net-tools.css     shared styles, all scoped to .nt / .nt-shell / .nt-geo
  nt-core.js        helpers, DNS-over-HTTPS, geolocation, badge, theme
  dns-lens.js       one script per tool
  subnet.js
  email-check.js
  whois.js
_includes/net-tools/
  tool.html         Jekyll include for one tool
  geo-badge.html    Jekyll include for the header badge
dns-lens/ subnet/ email-check/ whois/ index.html   standalone pages
```

## Add to a Jekyll site

1. Copy `assets/net-tools/` and `_includes/net-tools/` into the site.
2. Create a page per tool. The page needs a layout wide enough for the tool (up to 1240px):

   ```liquid
   ---
   layout: page
   title: Subnet calculator
   permalink: /tools/subnet/
   ---
   {% include net-tools/tool.html tool="subnet" %}
   ```

   `tool` is `dns`, `subnet`, `email`, `whois` or `evpn`.
3. Put the location badge in the header, for example just before the theme toggle in `_includes/header.html`:

   ```liquid
   {% include net-tools/geo-badge.html %}
   ```
4. Tell the tools where their pages live, so cross-links (IP → WHOIS, badge → WHOIS) point to your URLs. In `_config.yml`:

   ```yaml
   net_tools:
     links:
       dns: /tools/dns/
       subnet: /tools/subnet/
       email: /tools/email/
       whois: /tools/whois/
       evpn: /tools/evpn/
   ```

**Theme and colours:** the tools read the site's own CSS variables (`--bg`, `--surface`, `--surface-2`, `--line`, `--ink`, `--muted`, `--accent` …) and follow `data-theme="light"` on `<html>`, the same switch and `site-theme` storage key the blog uses. On a site without those variables they fall back to the same palette.

## Data sources

All are called directly from the browser (they allow cross-origin requests):

- DNS: Cloudflare, Google and AliDNS DNS-over-HTTPS JSON APIs
- Registration: RDAP via [rdap.org](https://rdap.org) and the IANA bootstrap file. Some country-code registries (.hr, .de, .io …) don't publish RDAP; the tool says so and links to the registry.
- Routing: [RIPEstat](https://stat.ripe.net) data API
- Location: [ipinfo.io](https://ipinfo.io), with [ipapi.co](https://ipapi.co) as fallback. Both have free-tier rate limits; results are cached per browser session.
- Flags: [flagcdn.com](https://flagcdn.com) (Windows doesn't render flag emoji)

Not possible from a browser: ping, traceroute, port scans, querying a specific nameserver over port 53, port-43 WHOIS, reading another site's TLS certificate, and the MTA-STS policy file.

## Security

- Every page sends a Content-Security-Policy meta tag: `script-src 'self'` (no inline scripts, no third-party JS), `default-src 'none'`, `base-uri 'none'`, `object-src` blocked by default. `connect-src https:` stays open because RDAP redirects to whichever registry runs the domain.
- All remote data (DNS records, RDAP JSON, geolocation) is HTML-escaped before it reaches the DOM, and any URL taken from a remote response must be `https:` before it becomes an `href` or `src`.
- No backend, no cookies, no analytics, no secrets in the repo. The only stored state is the theme and tool settings in `localStorage`, plus a per-session geolocation cache.
- Embedding in another site: that site's own CSP applies. Allow `img-src https://flagcdn.com` for flags and `connect-src` for the APIs listed below.

## Run locally

```bash
python -m http.server 5180
```

Then open http://localhost:5180.
