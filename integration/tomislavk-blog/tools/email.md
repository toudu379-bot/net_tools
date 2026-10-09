---
layout: tool
title: Email security check
permalink: /tools/email/
description: Check MX, SPF and its ten-lookup limit, DMARC, DKIM keys, BIMI, MTA-STS and TLS-RPT for any domain.
nt_tool: email
nt_script: email-check
---

## About this tool

This answers one question: can someone send email pretending to be this domain? The grade at the top summarises it, and each card below shows the record behind that verdict.

SPF gets the most attention, because it fails quietly. The meter counts the DNS lookups the record needs against the limit of ten, and the include tree shows where they come from - usually a provider that added one more include since you last looked. DMARC is reported with the policy that actually applies, found by walking up from the subdomain, so `mail.example.co.uk` resolves correctly without a public-suffix list.

DKIM can only be checked by name: the tool tries the selectors you enter plus a list of common ones, and reports each key's size and whether it is in test mode. Not finding a key does not prove there is none.

If a domain has no MX and no SPF record, it is not used for email at all, and the tool says so and gives you the three short records that stop anyone from spoofing it.
