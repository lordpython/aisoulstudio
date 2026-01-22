# How to Check for Package Updates

This guide shows you multiple ways to check if there are new versions available for your packages.

## Method 1: npm outdated (Built-in)

The simplest way - no installation needed:

```bash
npm outdated
```

This shows:
- **Current**: Version currently in your `package.json`
- **Wanted**: Latest version that matches your semver range (e.g., `^1.0.0`)
- **Latest**: The absolute latest version available

**Example output:**
```
Package          Current   Wanted   Latest
@google/genai   1.34.0    1.34.0   1.38.0  ← Update available!
framer-motion   12.23.26  12.23.26 12.29.0  ← Update available!
```

## Method 2: npm-check-updates (ncu) - Recommended

A more powerful tool that shows all available updates:

### Install globally:
```bash
npm install -g npm-check-updates
```

### Check for updates:
```bash
# Check what updates are available
ncu

# Check only production dependencies
ncu --dep prod

# Check only dev dependencies
ncu --dep dev

# Show only major version updates
ncu --target major

# Show only minor/patch updates
ncu --target minor
```

### Update package.json (dry run first):
```bash
# See what would change (doesn't modify files)
ncu

# Actually update package.json (recommended: review first!)
ncu -u

# Then install the updates
npm install
```

## Method 3: npm-check (Interactive)

An interactive tool with a nice UI:

```bash
# Install globally
npm install -g npm-check

# Run interactive check
npm-check
```

This shows an interactive menu where you can:
- See all outdated packages
- Update individual packages
- Update all packages
- Skip packages

## Method 4: Online Tools

### 1. **npmjs.com**
Visit each package on npmjs.com to see the latest version:
- Example: https://www.npmjs.com/package/@google/genai

### 2. **Snyk Advisor**
- Visit: https://snyk.io/advisor/
- Enter your package name to see version history and security info

### 3. **Bundlephobia**
- Visit: https://bundlephobia.com/
- Check package sizes and versions

## Method 5: Add Update Script to package.json

Add this script to your `package.json`:

```json
{
  "scripts": {
    "check-updates": "ncu",
    "check-updates:interactive": "npm-check",
    "update-check": "npm outdated"
  }
}
```

Then run:
```bash
npm run check-updates
npm run update-check
```

## Method 6: Automated Update Checking

### Using GitHub Dependabot

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

This automatically creates PRs for package updates.

### Using Renovate

Similar to Dependabot but more configurable. Add `renovate.json`:

```json
{
  "extends": ["config:base"],
  "schedule": ["before 10am on monday"],
  "packageRules": [
    {
      "updateTypes": ["minor", "patch"],
      "automerge": true
    }
  ]
}
```

## Understanding Version Ranges

Your `package.json` uses version ranges:

- `^1.2.3` - Allows updates to `1.x.x` (minor and patch)
- `~1.2.3` - Allows updates to `1.2.x` (patch only)
- `1.2.3` - Exact version (no updates)
- `*` - Any version (not recommended)

## Safe Update Strategy

1. **Check what's outdated:**
   ```bash
   npm outdated
   ```

2. **Review breaking changes:**
   - Check package changelogs
   - Visit package GitHub releases
   - Look for migration guides

3. **Update incrementally:**
   ```bash
   # Update one package at a time
   npm install package-name@latest
   
   # Or update all patch/minor versions
   npm update
   ```

4. **Test after updates:**
   ```bash
   npm test
   npm run build
   ```

5. **Commit changes:**
   ```bash
   git add package.json package-lock.json
   git commit -m "chore: update dependencies"
   ```

## Current Outdated Packages (from last check)

Based on `npm outdated`, these packages have updates available:

### Major/Minor Updates:
- `@google/genai`: `1.34.0` → `1.38.0` (minor)
- `framer-motion`: `12.23.26` → `12.29.0` (minor)
- `i18next`: `25.7.4` → `25.8.0` (patch)
- `react-i18next`: `16.5.2` → `16.5.3` (patch)
- `zod`: `4.2.1` → `4.3.5` (minor)
- `zustand`: `5.0.9` → `5.0.10` (patch)
- `cors`: `2.8.5` → `2.8.6` (patch)
- `langsmith`: `0.4.7` → `0.4.8` (patch)
- `@langchain/community`: `1.1.4` → `1.1.5` (patch)
- `@langchain/core`: `1.1.15` → `1.1.16` (patch)
- `@langchain/google-genai`: `2.1.10` → `2.1.11` (patch)

### Patch Updates (Safe):
- `@capacitor/android`: `8.0.0` → `8.0.1`
- `@capacitor/cli`: `8.0.0` → `8.0.1`
- `@capacitor/core`: `8.0.0` → `8.0.1`
- `@capacitor/filesystem`: `8.0.0` → `8.1.0` (minor)
- `@capacitor/ios`: `8.0.0` → `8.0.1`

## Quick Commands Reference

```bash
# Check outdated packages
npm outdated

# Update all packages within semver ranges
npm update

# Update specific package to latest
npm install package-name@latest

# Check updates without installing
npx npm-check-updates

# Interactive update checker
npx npm-check

# Update package.json with latest versions
npx npm-check-updates -u
```

## Security Updates

Check for security vulnerabilities:

```bash
# Check for vulnerabilities
npm audit

# Fix automatically (if possible)
npm audit fix

# Fix with breaking changes
npm audit fix --force
```

## Recommended Workflow

1. **Weekly**: Run `npm outdated` to check for updates
2. **Monthly**: Run `npx npm-check-updates` for comprehensive check
3. **Before major releases**: Review and update all dependencies
4. **After updates**: Run tests and build to ensure compatibility

---

**Tip**: Always test your application after updating packages, especially major version updates!
