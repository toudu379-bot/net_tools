---
layout: tool
title: DNS Lens
permalink: /tools/dns/
description: Look up every DNS record type for a domain in one go, with a DNSSEC verdict, over DNS-over-HTTPS.
nt_tool: dns
nt_script: dns-lens
---

## About this tool

DNS Lens asks for every record type at once - A, AAAA, CNAME, MX, NS, TXT, SOA, CAA, SRV, PTR, HTTPS, SVCB, DS, DNSKEY, TLSA and NAPTR - so you can see a domain's whole DNS setup on one screen instead of running sixteen queries. A switch on each card turns that record type on or off.

The DNSSEC banner answers a separate question: can these answers be trusted? It checks the DS record at the parent zone, the zone's own keys, and whether the resolver validated the answer. Because DS and DNSKEY records only exist at a zone apex, the tool first finds the apex, so looking up `www.example.com` reports on `example.com`.

Queries go straight from your browser to the resolver you pick, over DNS-over-HTTPS. The equivalent `dig` command is shown underneath, ready to copy.
