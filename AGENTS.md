# AGENTS.md - Bamboo Ink Project Guide

## Project Overview
古籍现代化改造项目 - Convert classical Chinese texts to modern readable format with AI annotation and search.

## Essential Commands
```bash
bun run dev       # Start dev server (http://localhost:4321)
bun run build     # Build static site
bun run preview   # Preview production build
bun run convert   # Run HTML→Markdown conversion script
```

## Architecture
- **Framework**: Astro 4.16 (static output, `build.format: 'file'`)
- **Styling**: Tailwind CSS 3.x with custom traditional Chinese colors
- **Package Manager**: Bun 1.x (required - do not use npm/yarn)
- **Entry Points**: `src/pages/index.astro`, `src/pages/guji/[slug].astro`

## Key Directories
```
content/          # Markdown output from conversion (经/史/子/集)
src/layouts/      # BaseLayout.astro (3 templates: classic/simple/deluxe)
src/components/   # Reusable components
src/pages/        # Astro pages
src/styles/       # global.css (guji-text typography)
scripts/          # convert-htm-to-md.js (Cheerio + Turndown)
public/fonts/     # Font files
```

## Critical Constraints
1. **Use Bun exclusively** - Project configured with `bunfig.toml` (`exact = true`, `save = true`)
2. **Astro 4.x compatibility** - Do not upgrade to Astro 5.x (known incompatibilities)
3. **Tailwind v3 syntax** - Config uses v3 syntax, not v4
4. **Encoding handling** - Source HTML files may be GBK-encoded; conversion script auto-detects

## Traditional Color Palette (Tailwind config)
- `xuanzhi-*` - Rice paper colors (#F7F5F0 base)
- `mo-*` - Ink colors (#2C2C2C base)
- `zhusha-*` - Cinnabar red (#C43C3C base)
- `juanbo-*` - Silk border colors (#E0D8C8 base)

## Testing & Verification
- No test suite currently configured
- Manual verification: Run `bun run convert`, check `content/` directory output
- Build verification: `bun run build && bun run preview`

## Development Workflow
1. Make changes → `bun run dev` for hot reload
2. Convert古籍 → `bun run convert` (processes first 10 files by default)
3. Build check → `bun run build` (verify no Astro errors)

## Gotchas
- **Vite config**: `assetsInlineLimit: 0` prevents asset inlining (intentional for font loading)
- **Template system**: Reading page uses query param `?template=classic|simple|deluxe`
- **Content structure**: Four sections (经史子集) map to directories in `content/`

## References
- `README.md` - Full project documentation
- `IMPLEMENTATION_PLAN.md` - Phased rollout plan
- `TECH-STACK-REVIEW.md` - Architecture review and improvement suggestions
