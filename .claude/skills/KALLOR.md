# Källor för skillsen

Kopior av tre paket. Ändra dem inte för hand. De uppdateras genom att hämtas på
nytt från källan, och då ska commit och datum nedan bytas.

| Paket | Källa | Version | Commit | Licens |
|---|---|---|---|---|
| superpowers | github.com/obra/superpowers, mappen `skills/` | 7.0.1 | `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b` (2026-10-21) | MIT, Jesse Vincent |
| UI UX Pro Max | github.com/nextlevelbuilder/ui-ux-pro-max-skill, mappen `.claude/skills/` | 2.15.0 | `d14efff8ed1faa4187f004f79926f428c8074ec7` (2026-10-23) | MIT, Next Level Builder |
| frontend-design | github.com/anthropics/claude-plugins-official, mappen `plugins/frontend-design/skills/` | ingen angiven | `58267944f92187b7d6a1c822165c96c81c864806` (2026-10-23) | Apache 2.0, Anthropic |

Skills per paket:

- **superpowers:** brainstorming, diagnosing-superpowers, dispatching-parallel-agents,
  executing-plans, finishing-a-development-branch, receiving-code-review,
  requesting-code-review, subagent-driven-development, systematic-debugging,
  test-driven-development, using-git-worktrees, using-superpowers,
  verification-before-completion, writing-plans, writing-skills
- **UI UX Pro Max:** banner-design, brand, design, design-system, slides,
  ui-styling, ui-ux-pro-max
- **frontend-design:** frontend-design

Varje skill har paketets licens i sin egen mapp (`LICENSE`, för frontend-design
`LICENSE.txt`), eftersom Claude Code bara hittar skills som ligger direkt under
`.claude/skills/`. `ui-styling` har dessutom en egen Apache 2.0-licens
(`LICENSE.txt`), och typsnitten i `ui-styling/canvas-fonts/` har var sin SIL
Open Font License bredvid sig.

Utelämnat: paketens tester (`tests/`, `test-*.md`), `.coverage`,
`systematic-debugging/CREATION-LOG.md`, README-bilder, CI-filer och
pluginfilerna för andra verktyg. Inget i skillsen hänvisar till dem.
