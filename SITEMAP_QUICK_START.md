# Sitemap Quick Start Guide

## 🚀 TL;DR

Your project has **automatic sitemap generation**! Just build:

```bash
npm run build
```

Sitemap will be at `dist/sitemap.xml` ✅

---

## 📋 Available Commands

```bash
# Method 1: Manual generation
npm run generate:sitemap

# Method 2: Auto-read from routes (RECOMMENDED for dev)
npm run generate:sitemap:auto

# Method 3: Automatic on build (RECOMMENDED for prod)
npm run build
```

---

## ⚙️ Configuration

### Set Your Domain

**Option 1: Environment Variable**
```bash
# .env file
VITE_APP_URL=https://yourdomain.com
```

**Option 2: vite.config.ts**
```typescript
Sitemap({
  hostname: 'https://yourdomain.com',
  // ...
})
```

---

## 🎯 When to Use Each Method

| Scenario | Command | Why |
|----------|---------|-----|
| **Development** | `npm run generate:sitemap:auto` | Quick testing |
| **Production** | `npm run build` | Automatic |
| **Custom needs** | `npm run generate:sitemap` | Full control |

---

## ✅ Verify Your Sitemap

After building:
```bash
npm run preview
```

Visit: http://localhost:4173/sitemap.xml

---

## 📝 Adding New Routes

1. Add route to `router/routes.ts`
2. Add to `vite.config.ts` dynamicRoutes array
3. Build or run generation script

**Example:**
```typescript
// router/routes.ts
{
  path: '/blog',
  title: 'nav.blog',
}

// vite.config.ts
Sitemap({
  dynamicRoutes: [
    '/',
    '/projects',
    '/blog', // ← Add here
  ],
})
```

---

## 🐛 Troubleshooting

### Sitemap not found
```bash
# Rebuild
npm run build

# Check dist folder
ls dist/sitemap.xml
```

### Wrong domain
```bash
# Set environment variable
echo "VITE_APP_URL=https://yourdomain.com" >> .env

# Rebuild
npm run build
```

### Missing routes
```bash
# Check vite.config.ts dynamicRoutes array
# Or run auto-generation
npm run generate:sitemap:auto
```

---

## 📚 Full Documentation

- **SITEMAP_AUTOMATION.md** - Complete guide with all 3 methods
- **SITEMAP_TOOLS_COMPARISON.md** - Tool comparison and alternatives
- **SITEMAP.md** - Original manual setup guide

---

## 🎉 You're Done!

Your sitemap is ready for:
- ✅ Google Search Console
- ✅ Bing Webmaster Tools
- ✅ Search engine crawlers

Just deploy and submit your sitemap URL! 🚀
