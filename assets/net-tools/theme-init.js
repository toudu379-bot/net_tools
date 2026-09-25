/* Applies the saved theme before first paint, so the page never flashes the wrong one.
   Same storage key as tomislavk.blog. Loaded as a file (not inline) so the page CSP can forbid inline scripts. */
try { var t = localStorage.getItem("site-theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
