---
layout: page
title: Network Tools
permalink: /tools/
description: Lookup tools and calculators for network engineers - DNS, subnetting, email authentication, WHOIS, BGP routing and EVPN - that run entirely in your browser.
---

<p>Six tools I use often enough to keep within reach. Each one runs entirely in your browser: there is no server behind them, nothing you type is stored, and no account is needed.</p>

<div class="download-grid">
  <article class="download-card">
    <p class="eyebrow">DNS</p>
    <h2>DNS Lens</h2>
    <p>Every record type for a name in one lookup, with a DNSSEC verdict and a switch per record type.</p>
    <a href="{{ '/tools/dns/' | relative_url }}">Open DNS Lens</a>
  </article>

  <article class="download-card">
    <p class="eyebrow">IP addressing</p>
    <h2>Subnet calculator</h2>
    <p>sipcalc-style IPv4 and IPv6 details, plus splitting a network, summarising a list and turning a range into CIDR blocks.</p>
    <a href="{{ '/tools/subnet/' | relative_url }}">Open the subnet calculator</a>
  </article>

  <article class="download-card">
    <p class="eyebrow">Email</p>
    <h2>Email security check</h2>
    <p>MX, SPF with its ten-lookup budget, DMARC, DKIM keys, BIMI, MTA-STS and TLS-RPT, with a grade for how well the domain resists spoofing.</p>
    <a href="{{ '/tools/email/' | relative_url }}">Open the email check</a>
  </article>

  <article class="download-card">
    <p class="eyebrow">Registration</p>
    <h2>WHOIS &amp; IP info</h2>
    <p>RDAP registration data for domains, IP addresses and AS numbers, with routing, RPKI validity and approximate location.</p>
    <a href="{{ '/tools/whois/' | relative_url }}">Open WHOIS &amp; IP info</a>
  </article>

  <article class="download-card">
    <p class="eyebrow">Routing</p>
    <h2>BGP looking glass</h2>
    <p>What RIPE RIS collectors see for a prefix: AS paths, origin and upstreams, RPKI validity, IRR route objects and visibility.</p>
    <a href="{{ '/tools/bgp/' | relative_url }}">Open the looking glass</a>
  </article>

  <article class="download-card">
    <p class="eyebrow">Data centre</p>
    <h2>EVPN calculator</h2>
    <p>VLAN and VRF to VNI allocation, route distinguishers and route targets, VXLAN MTU sizing, leaf configuration and route scaling.</p>
    <a href="{{ '/tools/evpn/' | relative_url }}">Open the EVPN calculator</a>
  </article>
</div>

<div class="page-content">
  <h2>How they work</h2>
  <p>Everything is calculated in your browser, or looked up directly from it. The DNS tools query Cloudflare, Google or AliDNS over DNS-over-HTTPS; registration data comes from the registry's own RDAP service; routing and RPKI data come from RIPEstat; approximate IP location comes from ipinfo.io. The subnet and EVPN calculators make no network requests at all.</p>
  <p>Because there is no backend, some things are impossible here: ping, traceroute, port scans, querying one specific nameserver, and reading another site's TLS certificate all need a server to run from.</p>
</div>
