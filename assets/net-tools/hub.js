/* Landing page: one card per tool, built from the list in nt-core. */
NT.register("hub", function (root) {
  root.innerHTML = NT.hero("Network engineering", "Network tools",
    "Everyday lookups and calculators for network engineers. Everything runs in your browser: there is no server, and nothing you type is stored.") +
    '<div class="nt-hub">' + NT.TOOLS.map(function (t) {
      return '<a href="' + NT.esc(NT.link(t.id)) + '"><span class="k">/' + NT.esc(t.path.replace(/\/$/, "")) + '</span><h2>' +
        NT.esc(t.name) + '</h2><p>' + NT.esc(t.blurb) + '</p></a>';
    }).join("") + '</div>';
});
