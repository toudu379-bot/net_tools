# net_tools

Small browser-based network tools.

## DNS Lens

[`dns-lens/`](dns-lens/) looks up every DNS record type for a domain in one go: A, AAAA, CNAME, MX, NS, TXT, SOA, CAA, SRV, PTR, HTTPS, SVCB, DS, DNSKEY, TLSA and NAPTR.

- A slider per record type turns it on or off.
- Found records show in green; failed lookups show in red with the reason.
- Enter an IP address to get its reverse (PTR) record.
- Choose Cloudflare (1.1.1.1) or Google (8.8.8.8) as the resolver.

Queries go straight from the browser to the resolver over DNS-over-HTTPS, so there is no backend.

### Run locally

Serve the folder over HTTP (opening the file directly may be blocked by the browser):

```bash
python -m http.server 5178 --directory dns-lens
```

Then open http://localhost:5178.
