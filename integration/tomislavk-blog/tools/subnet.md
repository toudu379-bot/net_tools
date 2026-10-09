---
layout: tool
title: Subnet calculator
permalink: /tools/subnet/
description: sipcalc-style IPv4 and IPv6 subnet calculator with network splitting, summarising and range-to-CIDR conversion.
nt_tool: subnet
nt_script: subnet
---

## About this tool

The Details tab gives the same fields as sipcalc: network and broadcast address, mask in every notation, the Cisco wildcard, usable range, address type and reverse DNS zone. A slider changes the prefix length live, and the binary view shows which bits the network fixes and which identify a device.

Three more tabs handle the jobs that usually mean a spreadsheet: splitting a block into equal subnets, summarising a list of networks into the shortest equivalent list, and turning a first and last address into the CIDR blocks that cover exactly that range.

IPv4 follows RFC 3021, so a /31 has two usable addresses rather than none. For IPv6 the tool lists the reserved addresses rather than pretending every address is assignable: the all-zeros address is the Subnet-Router anycast address, and in a /64 the top 128 are reserved for subnet anycast.

Nothing leaves your browser - this tool makes no network requests at all.
