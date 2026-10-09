# Adding the tools to tomislavk.blog

Step-by-step, for manual application on the production clone. Nothing here changes how any existing page behaves: all additions are new files, plus three small edits to theme files.

Every file mentioned is ready to copy from `integration/tomislavk-blog/` in this repository, laid out at the exact paths it needs in the blog.

**What you end up with**

- Six tool pages under `/tools/`, inside your normal header and footer, using your colours, fonts and theme switch.
- A `/tools/` landing page using your existing card styling.
- A "Tools" dropdown in the main navigation, and a "Tools" link in the footer.
- The visitor IP and flag badge in the header **on tool pages only**.

---

## Before you start

On the production machine, get a copy of this repository to copy files from:

```bash
git clone https://github.com/toudu379-bot/net_tools.git
```

Work on a branch in the blog repo, so a rollback is one command:

```bash
git checkout -b tools-integration
```

---

## Step 1 — Copy the tool assets

Create `assets/net-tools/` in the blog and copy **nine** files into it from `net_tools/assets/net-tools/`:

| File | Purpose |
|---|---|
| `net-tools.css` | all tool styling, scoped so it can't touch the rest of the site |
| `nt-core.js` | shared helpers: DNS, RPKI, geolocation, card layout, theme |
| `dns-lens.js` | DNS Lens |
| `subnet.js` | subnet calculator |
| `email-check.js` | email security check |
| `whois.js` | WHOIS & IP info |
| `bgp.js` | BGP looking glass |
| `evpn.js` | EVPN calculator |
| `nt-config.js` | **from `integration/tomislavk-blog/assets/net-tools/`** — tells the tools your URLs |

Do **not** copy `hub.js` or `theme-init.js`. They belong to the standalone site: your Jekyll pages replace the first, and `search.js` already applies your theme.

## Step 2 — Copy the site stylesheet

Copy `integration/tomislavk-blog/assets/css/net-tools-site.css` to `assets/css/net-tools-site.css`.

It does four things: stops the tool adding a second set of page padding, re-enables the dropdown your theme already ships, flattens that dropdown inside the mobile menu, and hides the location badge at widths where the header has no spare column.

## Step 3 — Copy the layout and the include

| From | To |
|---|---|
| `integration/tomislavk-blog/_layouts/tool.html` | `_layouts/tool.html` |
| `integration/tomislavk-blog/_includes/net-tools/geo-badge.html` | `_includes/net-tools/geo-badge.html` |

The layout deliberately renders no page header: each tool draws its own eyebrow, H1 and introduction, so a second H1 would duplicate it.

## Step 4 — Copy the pages

Create a `tools/` folder in the blog root and copy all seven files from `integration/tomislavk-blog/tools/`:

`index.md`, `dns.md`, `subnet.md`, `email.md`, `whois.md`, `bgp.md`, `evpn.md`

Each page carries its own `permalink`, so the folder name doesn't affect the URLs. Each also has a short "About this tool" section below the tool — real text for search engines, since the tool itself is drawn by JavaScript.

---

## Step 5 — Edit `_layouts/default.html`

Find this line:

```liquid
    <link rel="stylesheet" href="{{ '/assets/css/main.css' | relative_url }}">
```

Add three lines directly after it:

```liquid
    <link rel="stylesheet" href="{{ '/assets/css/net-tools-site.css' | relative_url }}">
    {%- if page.nt_tool %}
    <link rel="stylesheet" href="{{ '/assets/net-tools/net-tools.css' | relative_url }}">
    {%- endif %}
```

The tool stylesheet only loads on tool pages. The small site stylesheet loads everywhere, because the navigation dropdown appears in the header on every page.

## Step 6 — Edit `_includes/header.html`

**6a. The dropdown.** Inside `<nav class="site-nav">`, replace this line:

```liquid
      <a href="{{ '/downloads/' | relative_url }}">Downloads</a>
```

with:

```liquid
      <a href="{{ '/downloads/' | relative_url }}">Downloads</a>
      <div class="nav-dropdown">
        <a href="{{ '/tools/' | relative_url }}">Tools</a>
        <div class="nav-dropdown-panel">
          <a href="{{ '/tools/dns/' | relative_url }}">DNS Lens</a>
          <a href="{{ '/tools/subnet/' | relative_url }}">Subnet calculator</a>
          <a href="{{ '/tools/email/' | relative_url }}">Email security</a>
          <a href="{{ '/tools/whois/' | relative_url }}">WHOIS &amp; IP info</a>
          <a href="{{ '/tools/bgp/' | relative_url }}">BGP looking glass</a>
          <a href="{{ '/tools/evpn/' | relative_url }}">EVPN calculator</a>
        </div>
      </div>
```

**6b. The badge.** Between the closing `</nav>` and the search button, add:

```liquid
    {%- if page.nt_tool %}
    {% include net-tools/geo-badge.html %}
    {%- endif %}
```

If you prefer not to edit the header at all, `integration/tomislavk-blog/_includes/header.html` is your file with both changes already applied — diff it against yours before copying.

## Step 7 — Edit `_includes/footer.html`

In the **Navigation** column, add one line after "Start Here":

```liquid
        <a href="{{ '/tools/' | relative_url }}">Tools</a>
```

---

## Step 8 — Preview locally

```bash
bundle exec jekyll serve
```

Then check:

| Check | Expected |
|---|---|
| `/tools/` | Six cards in your normal card styling, your header and footer |
| `/tools/dns/` | The tool loads and a lookup of `cloudflare.com` returns records |
| Page heading | Exactly one H1 per page — the tool's own |
| Header | "Tools" in the nav; hovering shows the six entries |
| Keyboard | Tab to "Tools": the panel opens on focus |
| Mobile width | Menu button opens the nav, with the six tools indented under "Tools" |
| Badge | Shows on tool pages, not on articles or the home page |
| Theme switch | Flip it: the tool follows, light and dark |
| Existing pages | Home, Downloads, an article: unchanged |

I verified the first eight of these against a mock built from your compiled `_site` output plus these exact edits: the tool mounted inside `.page-shell` with 16 record cards, one H1, padding and width correct, the dropdown enabled, the tool's accent resolving to your `#38bdf8`, and cross-tool links pointing at `/tools/whois/?q=…`. What I could not test without Ruby is Jekyll's own build, so Step 8 is the one that matters.

## Step 9 — Commit and push

```bash
git add assets/net-tools assets/css/net-tools-site.css _layouts/tool.html _includes/net-tools tools
git add _layouts/default.html _includes/header.html _includes/footer.html
git commit -m "Add network tools under /tools/"
git push
```

## Rollback

```bash
git checkout main
git branch -D tools-integration
```

If it is already on `main`, `git revert <commit>` removes it cleanly: the tools touch nothing else.

---

## Notes

**Privacy.** The badge is the only part that sends anything about your visitors anywhere: it asks ipinfo.io for the IP's location. It appears on tool pages only, so no article or the home page makes that call. The tools themselves send what the visitor types — a domain, an address — to the public API that answers it (Cloudflare or Google DNS, the registry's RDAP service, RIPEstat). If you keep a privacy page, those are worth a sentence.

**Security.** The tools add no third-party JavaScript: everything runs from your own origin. Remote data is HTML-escaped before display, and any URL that arrives in an API response must be `https:` before it becomes a link. Your site currently sends no security headers at all, which GitHub Pages can't do — unrelated to this change, but worth knowing if you ever put Cloudflare in front of it.

**Search.** The tool mount carries `data-pagefind-ignore`, so Pagefind indexes your "About this tool" text and the `/tools/` page, not the empty shell.

**Updating later.** When I change a tool, copy the changed file from `net_tools/assets/net-tools/` again. `nt-config.js` is yours and never needs replacing. The scripts carry no version markers, so a plain file copy is always enough.
