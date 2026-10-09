---
layout: tool
title: EVPN calculator
permalink: /tools/evpn/
description: VLAN and VRF to VNI allocation, route distinguishers and route targets, VXLAN MTU sizing, leaf configuration and EVPN route scaling.
nt_tool: evpn
nt_script: evpn
---

## About this tool

A planning tool for a VXLAN EVPN fabric. Describe the fabric once - AS number, leaf count, tenants and their VLANs - and it produces the numbering, the configuration and a size estimate.

It allocates an L2 VNI per VLAN and an L3 VNI per VRF, checks them against each platform's limits, and generates Type 1 route distinguishers built from each leaf's router ID so a route reflector never hides one leaf's paths behind another's. Route targets can follow ASN:VNI, VNI:VNI or the RFC 8365 auto-derived form, with warnings for the three cases where automatic derivation quietly breaks: an eBGP overlay, a 4-byte ASN, and a fabric mixing vendors.

The MTU panel sizes the underlay. VXLAN adds 50 bytes over IPv4 and 70 over IPv6, and the number you configure differs per platform: Juniper counts the Ethernet header in its MTU while Cisco, Arista and NVIDIA do not.

Configuration is generated per leaf for Cisco NX-OS, Arista EOS, Juniper Junos and NVIDIA Cumulus Linux. It covers the overlay only, and is worth checking against your own software release.

There is a longer write-up of every control in the [EVPN calculator notes](https://github.com/toudu379-bot/net_tools/blob/main/docs/evpn-calculator.md).
