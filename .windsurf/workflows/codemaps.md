---
description: Generate codebase export and dependency map artifacts
---
1. Install dependencies if needed:
   - `pnpm install`

2. Generate both codemap artifacts from the workspace root:
   - `pnpm run codemaps`

3. Generated outputs:
   - `codebase-export.md` (Repomix export)
   - `codebase-map.html` (Dependency Cruiser HTML graph)

4. If you only need one output, run either:
   - `pnpm run codemaps:export`
   - `pnpm run codemaps:deps`
