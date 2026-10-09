/* Where each tool lives on this site.
   The tools link to each other (an IP address in DNS Lens opens in WHOIS, an AS
   number in WHOIS opens in the BGP tool), and this is how they find those URLs.
   Loaded before nt-core.js, which reads it once at startup. */
window.NT_CONFIG = {
  links: {
    dns:    "/tools/dns/",
    subnet: "/tools/subnet/",
    email:  "/tools/email/",
    whois:  "/tools/whois/",
    bgp:    "/tools/bgp/",
    evpn:   "/tools/evpn/"
  }
};
