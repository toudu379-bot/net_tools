---
layout: tool
title: BGP looking glass
permalink: /tools/bgp/
description: What RIPE RIS collectors see for a prefix - AS paths, origin and upstreams, RPKI validity, IRR route objects and visibility.
nt_tool: bgp
nt_script: bgp
---

## About this tool

Enter a prefix or an address and the tool shows how the internet sees it, using the public RIPE RIS route collectors.

The useful parts are the checks you would otherwise run separately: whether every collector agrees on the origin AS, whether the real holder has authorised that announcement with RPKI, whether the IRR route objects match reality, how many collectors see the prefix at all, and how much the route has been announced and withdrawn in the last day. Below that is the raw view - the AS path each peer sees, with its communities.

Path lengths are counted on distinct networks: a repeated AS number is prepending, used to make a route look less attractive, not an extra hop.

This is collector data, a few minutes behind, not a live view from any single router. RIS peers are mostly large transit and exchange networks, so a route can be perfectly healthy and still be missing from a few of them.
