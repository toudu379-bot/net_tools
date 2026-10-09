# Integration files for tomislavk.blog

Everything here is laid out at the exact path it needs inside the blog repository, so each file can be copied straight across.

| Path here | Path in the blog | New or edited |
|---|---|---|
| `assets/net-tools/nt-config.js` | same | new — your tool URLs |
| `assets/css/net-tools-site.css` | same | new — fits the tools to the theme |
| `_layouts/tool.html` | same | new |
| `_includes/net-tools/geo-badge.html` | same | new |
| `tools/*.md` | same | new — seven pages |
| `_layouts/default.html` | same | **edited** — three lines added |
| `_includes/header.html` | same | **edited** — Tools dropdown and badge |
| `_includes/footer.html` | same | **edited** — one link |

The three edited files are complete copies of your current ones with the changes applied, taken from the production clone on 9 October 2026. Diff them against yours before copying, in case the originals have moved on.

The tool scripts themselves are not duplicated here. Copy them from `assets/net-tools/` at the root of this repository, which is where they are maintained.

Step-by-step instructions: [`docs/blog-integration.md`](../../docs/blog-integration.md).
