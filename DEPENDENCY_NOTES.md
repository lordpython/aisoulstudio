# Dependency Notes

## Peer Dependency Conflict Resolution

### Issue
When installing dependencies, you may encounter a peer dependency conflict:
```
npm error ERESOLVE unable to resolve dependency tree
npm error Found: dotenv@17.2.3
npm error Could not resolve dependency:
npm error peer dotenv@"^16.4.5" from @browserbasehq/stagehand@1.14.0
```

### Solution
The project includes an `.npmrc` file with `legacy-peer-deps=true` to automatically resolve this conflict.

**Why this is safe:**
- `dotenv@17` is backward compatible with `dotenv@16`
- The conflict is from a transitive dependency (`@browserbasehq/stagehand`) required by `@langchain/community`
- This is a known issue in the LangChain.js ecosystem

**Manual installation:**
If you need to install manually, use:
```bash
npm install --legacy-peer-deps
```

## Security Vulnerabilities

### Current Status
There are 2 high severity vulnerabilities reported in `npm audit`:

1. **tar package** (transitive dependency of `@capacitor/cli`)
   - Vulnerable to Arbitrary File Overwrite and Symlink Poisoning
   - Race Condition in path reservations

### Why Not Fixed Automatically
Running `npm audit fix --force` would:
- Downgrade `@capacitor/cli` from `8.0.1` to `2.5.0` (breaking change)
- Break the entire Capacitor mobile integration
- Remove modern features and bug fixes

### Resolution Status
- **Capacitor Team**: This is a known issue with transitive dependencies
- **Impact**: Low - the vulnerability is in a build-time dependency, not runtime
- **Recommendation**: Monitor for Capacitor updates that address this
- **Workaround**: None required - the vulnerability doesn't affect production builds

### Monitoring
Check for updates regularly:
```bash
npm outdated
npm audit
```

When Capacitor releases a version that fixes this, update:
```bash
npm install @capacitor/cli@latest --legacy-peer-deps
```

## Package Update Strategy

### Safe Updates (Patch/Minor)
These can usually be updated without issues:
- `@google/genai`: `1.34.0` → `1.38.0` ✅
- `framer-motion`: `12.23.26` → `12.29.0` ✅
- `zod`: `4.2.1` → `4.3.5` ✅
- `zustand`: `5.0.9` → `5.0.10` ✅

### Major Updates (Require Testing)
- `react`: `19.2.3` (latest, monitor for `20.x`)
- `vite`: `7.3.1` (latest, monitor for `8.x`)
- `typescript`: `5.9.3` (latest, monitor for `6.x`)

### Update Workflow
1. Check for updates: `npm run check-updates`
2. Review changelogs for breaking changes
3. Update incrementally (one package at a time)
4. Run tests: `npm test && npm run build`
5. Test the application manually
6. Commit changes

## Known Issues

### 1. dotenv Peer Dependency
- **Package**: `@langchain/community` → `@browserbasehq/stagehand`
- **Conflict**: Requires `dotenv@^16.4.5`, we use `dotenv@17.2.3`
- **Status**: Resolved with `legacy-peer-deps=true`
- **Impact**: None (backward compatible)

### 2. tar Security Vulnerability
- **Package**: `tar` (via `@capacitor/cli`)
- **Severity**: High
- **Status**: Known issue, waiting for Capacitor update
- **Impact**: Low (build-time only, not runtime)

## Best Practices

1. **Always use `--legacy-peer-deps`** when installing:
   ```bash
   npm install --legacy-peer-deps
   ```

2. **Check for updates monthly**:
   ```bash
   npm run check-updates
   ```

3. **Test after updates**:
   ```bash
   npm test
   npm run build
   ```

4. **Monitor security**:
   ```bash
   npm audit
   ```

5. **Review breaking changes** before major updates

---

**Last Updated**: January 2026
