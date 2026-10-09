---
layout: tool
title: WHOIS & IP info
permalink: /tools/whois/
description: RDAP registration data, BGP routing, RPKI validity and approximate location for domains, IP addresses, prefixes and AS numbers.
nt_tool: whois
nt_script: whois
---

## About this tool

Type a domain, an IP address, a prefix or an AS number and the tool works out which kind of lookup you meant.

Registration data comes from RDAP, the protocol that replaced port-43 WHOIS, read straight from the registry that holds the record. Domains show the registrar, the dates with days remaining, the lock status and the nameservers. IP addresses show the network registration, the AS announcing them, whether that announcement is authorised by RPKI, how widely it is visible, and approximate location. AS numbers show the holder, the PeeringDB profile and every prefix announced.

Two limits worth knowing. Location is city-level at best and often points at the provider rather than the device. And some country-code registries - .hr, .de and .io among them - publish no RDAP service at all, so the tool tells you and links to the registry instead of guessing.
