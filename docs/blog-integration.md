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

Two repositories are involved. Keep them apart:

| Repository | Role | What you do in it |
|---|---|---|
| **net_tools** (this one) | where the files come from | clone it, copy files out of it, commit nothing to it |
| **your blog repository** — the production clone you publish tomislavk.blog from | where the integration lands | branch, copy files in, commit, push |

On the production machine:

```bash
# 1. Get the source files. Anywhere outside the blog is fine.
cd ~/src
git clone https://github.com/toudu379-bot/net_tools.git

# 2. Move to the blog repository and start a branch there.
cd /path/to/your/blog
git status                            # should be clean before you start
git checkout -b tools-integration
```

**What `git checkout -b tools-integration` does.** It creates a branch with that name from wherever you are now (your `main`) and switches you onto it — two steps in one command, which is what `-b` adds.

It changes no file: your working folder looks identical the moment after you run it. It touches nothing on GitHub, because the branch stays local until you push. And it leaves the live site alone, since GitHub Pages builds from `main`, so tomislavk.blog keeps serving what it serves today while you work.

The point is that every file you add from here on is recorded on that branch instead of `main`. If you decide against the whole thing, you delete the branch and `main` never knew it happened — see [Rollback](#rollback). When you are happy, merging into `main` is the moment the site changes.

Two things worth knowing: run it on a clean tree, because uncommitted changes follow you onto the new branch, which is why `git status` comes first; and `git branch --show-current` tells you where you are at any time. On Git 2.23 and later, `git switch -c tools-integration` is the same command in newer spelling.

You can also skip the branch and work straight on `main`. The undo is then `git revert <commit>` after the fact rather than deleting a branch — both work, the branch is simply cheaper.

Every Git command this guide uses is listed, with what it does, under [Git commands used here](#git-commands-used-here).

**Every step from here on happens inside the blog repository.** Paths such as `assets/net-tools/` are relative to the blog's root — the folder that holds `_config.yml`. Paths that begin with `net_tools/` or `integration/` refer to the clone you made in step 1.

Steps 1 to 4 are all file copies. If you would rather run them than click through them, set two variables first and use the commands at the end of Step 4.

```bash
NT=~/src/net_tools          # the clone from step 1
BLOG=/path/to/your/blog     # the repository you publish from
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

**Steps 1 to 4 as commands**, using the two variables from above:

```bash
mkdir -p "$BLOG/assets/net-tools" "$BLOG/_includes/net-tools" "$BLOG/tools"

# Step 1 - the eight tool files, then your own config file
cp "$NT"/assets/net-tools/{net-tools.css,nt-core.js,dns-lens.js,subnet.js,email-check.js,whois.js,bgp.js,evpn.js} "$BLOG/assets/net-tools/"
cp "$NT"/integration/tomislavk-blog/assets/net-tools/nt-config.js "$BLOG/assets/net-tools/"

# Step 2 - the stylesheet that fits the tools to your theme
cp "$NT"/integration/tomislavk-blog/assets/css/net-tools-site.css "$BLOG/assets/css/"

# Step 3 - the layout and the badge include
cp "$NT"/integration/tomislavk-blog/_layouts/tool.html "$BLOG/_layouts/"
cp "$NT"/integration/tomislavk-blog/_includes/net-tools/geo-badge.html "$BLOG/_includes/net-tools/"

# Step 4 - the seven pages
cp "$NT"/integration/tomislavk-blog/tools/*.md "$BLOG/tools/"
```

On Windows PowerShell, `cp` is `Copy-Item` and the brace list becomes a comma-separated one; the paths are otherwise identical.

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

**6b. The badge.** This goes in the same file, a few lines further down: after the `</nav>` that closes the navigation, and before the search button. In your current file that is around line 27.

Find these lines:

```liquid
    </nav>

    <button class="icon-button search-open" type="button" aria-label="Open search" data-search-open>
```

and make them:

```liquid
    </nav>

    {%- if page.nt_tool %}
    {% include net-tools/geo-badge.html %}
    {%- endif %}

    <button class="icon-button search-open" type="button" aria-label="Open search" data-search-open>
```

Two things make that the right spot. `.header-inner` is a CSS grid, so children appear left to right in source order: putting the badge after the nav and before the search button places it between them, which is where there is a spare column. And the `{%- if page.nt_tool %}` wrapper means the element is only written out on the six tool pages - every other page renders the header exactly as it does today, with no third-party request.

If you prefer not to edit the header at all, `integration/tomislavk-blog/_includes/header.html` is your file with both changes already applied — diff it against yours before copying.

## Step 7 — Edit `_includes/footer.html`

In the **Navigation** column, add one line after "Start Here":

```liquid
        <a href="{{ '/tools/' | relative_url }}">Tools</a>
```

---

## Step 8 — Preview locally

Being on a branch changes nothing here: Jekyll builds whatever is checked out right now, so the preview *is* the branch. Confirm it first:

```bash
git branch --show-current        # expect: tools-integration
bundle install                   # only needed the first time, or after a Gemfile change
```

**While you work — the fast loop:**

```bash
bundle exec jekyll serve --livereload
```

Open <http://127.0.0.1:4000/tools/>. Every save rebuilds in a second or two. Site search won't work in this mode, because the Pagefind index is built after a full build and each rebuild wipes it — nothing to do with the tools.

**Before you commit — the same way the site is actually built**, which is what your `dev.sh` does:

```bash
bundle exec jekyll build && npx pagefind --site _site && npx serve _site -p 4000
```

That builds, indexes for search, and serves the finished output on <http://localhost:4000>. Use it for the final look, since it is what GitHub Pages will serve. (`dev.sh` calls `serve` directly, which needs it installed globally; `npx serve` works either way.)

Two notes:

- `_site/` is in `.gitignore`, so nothing you build ends up in the commit.
- With `jekyll serve` running, `git checkout main` in another terminal makes Jekyll rebuild the old site, and switching back brings the tools back. Useful for comparing the two.
- The tools call HTTPS APIs from an HTTP page on localhost. Browsers allow that direction, so all six work locally exactly as they will in production.

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

In the blog repository:

```bash
git add assets/net-tools assets/css/net-tools-site.css _layouts/tool.html _includes/net-tools tools
git add _layouts/default.html _includes/header.html _includes/footer.html
git status                            # 19 new files, 3 modified
git commit -m "Add network tools under /tools/"
git push -u origin tools-integration
```

Merge the branch into `main` once the preview looks right, or push straight to `main` if you prefer — the branch exists only to make the next section cheap.

Nothing you did touches the net_tools clone, so there is nothing to commit there.

## Rollback

Before merging, in the blog repository:

```bash
git checkout main
git branch -D tools-integration
```

After merging, `git revert <commit>` removes it cleanly: the tools share no files with the rest of the site, and the three edited files only gained lines.

---

## Git commands used here

Only the ones this guide needs, in the order you are likely to want them. All of them run inside the blog repository.

**Where am I, and what have I changed?**

| Command | What it tells you |
|---|---|
| `git branch` | every local branch; `*` marks the one you are on |
| `git branch -a` | the same, plus the branches on GitHub (as of your last `git fetch`) |
| `git branch --show-current` | just the current branch name |
| `git status` | which files are new, changed or staged |
| `git diff` | the actual line changes you have not staged yet |
| `git diff _includes/header.html` | the same, for one file |

A branch you created but have not pushed appears in `git branch` and **not** under `remotes/origin/` in `git branch -a`. That is normal until you push it.

**Making the change**

| Command | What it does |
|---|---|
| `git checkout -b tools-integration` | create the branch and switch to it |
| `git checkout main` | switch back; your branch and its work stay where they are |
| `git add <paths>` | mark files to go into the next commit |
| `git commit -m "message"` | record the staged files as one change |
| `git push -u origin tools-integration` | send the branch to GitHub for the first time (`git push` afterwards) |

**Undoing**

| Command | What it does |
|---|---|
| `git checkout -- <file>` | throw away your edits to one file, before committing |
| `git branch -D tools-integration` | delete the branch and everything on it, after switching to `main` |
| `git revert <commit>` | add a new commit that undoes an earlier one, after it is merged |

`git log --oneline -5` shows the last five commits with their IDs, which is where you get the `<commit>` for `revert`.

**Two habits that prevent most trouble:** run `git status` before you start and before you commit, and keep `git branch --show-current` in mind whenever a command surprises you — most confusing results come from being on a different branch than you thought.

## Notes

**Privacy.** The badge is the only part that sends anything about your visitors anywhere: it asks ipinfo.io for the IP's location. It appears on tool pages only, so no article or the home page makes that call. The tools themselves send what the visitor types — a domain, an address — to the public API that answers it (Cloudflare or Google DNS, the registry's RDAP service, RIPEstat). If you keep a privacy page, those are worth a sentence.

**Security.** The tools add no third-party JavaScript: everything runs from your own origin. Remote data is HTML-escaped before display, and any URL that arrives in an API response must be `https:` before it becomes a link. Your site currently sends no security headers at all, which GitHub Pages can't do — unrelated to this change, but worth knowing if you ever put Cloudflare in front of it.

**Search.** The tool mount carries `data-pagefind-ignore`, so Pagefind indexes your "About this tool" text and the `/tools/` page, not the empty shell.

**Updating later.** When I change a tool, copy the changed file from `net_tools/assets/net-tools/` again. `nt-config.js` is yours and never needs replacing. The scripts carry no version markers, so a plain file copy is always enough.
