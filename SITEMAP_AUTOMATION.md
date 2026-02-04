# Automatic Sitemap Generation

This project now has **3 different methods** for generating sitemaps, from manual to fully automated.

## 🎯 Methods Overview

| Method | Automation Level | When to Use |
|--------|-----------------|-------------|
| **1. Manual Script** | Low | Full control over routes |
| **2. Auto-Read Routes** | Medium | Reads from router config |
| **3. Vite Plugin** | High | Automatic on build |

---

## Method 1: Manual Script (Original)

### How it works
Manually define routes in the script with custom configuration.

### Usage
```bash
npm run generate:sitemap
```

### Configuration
Edit `scripts/generate-sitemap.ts` to add/modify routes:

```typescript
const routes: SitemapRoute[] = [
  {
    path: '/',
    changefreq: 'weekly',
    priority: 1.0,
  },
  // Add more routes...
];
```

### Pros
- Full control over each route
- Custom priority and frequency per route
- Can add dynamic routes manually

### Cons
- Must manually update when routes change
- Requires running script before build

---

## Method 2: Auto-Read Routes (Recommended)

### How it works
Automatically reads your React Router configuration from `router/routes.ts` and generates sitemap.

### Usage
```bash
npm run generate:sitemap:auto
```

### Configuration
The script automatically reads from `router/routes.ts`. Configure defaults in `scripts/auto-generate-sitemap.ts`:

```typescript
const defaultConfigs: Record<string, SitemapConfig> = {
  '/': { changefreq: 'weekly', priority: 1.0 },
  '/projects': { changefreq: 'weekly', priority: 0.8 },
  // Defaults for other routes
};
```

### Environment Variables
Set your domain:
```bash
VITE_APP_URL=https://yourdomain.com npm run generate:sitemap:auto
```

Or add to `.env`:
```
VITE_APP_URL=https://yourdomain.com
```

### Pros
- ✅ Automatically syncs with router configuration
- ✅ No manual route maintenance
- ✅ Excludes auth-required routes automatically
- ✅ Customizable per-route settings

### Cons
- Requires running script before build
- Need to configure defaults for new routes

---

## Method 3: Vite Plugin (Fully Automated)

### How it works
The `vite-plugin-sitemap` automatically generates sitemap during build by scanning your output files.

### Usage
Just build your project:
```bash
npm run build
```

The sitemap is automatically generated in the `dist` folder!

### Configuration
Already configured in `vite.config.ts`:

```typescript
import Sitemap from "vite-plugin-sitemap";

export default defineConfig({
  plugins: [
    react(),
    Sitemap({
      hostname: 'https://yourdomain.com',
      dynamicRoutes: [
        '/',
        '/projects',
        '/studio',
        '/visualizer',
        '/settings',
        '/signin',
      ],
      exclude: ['/404', '/api/*'],
      robots: true, // Also generates robots.txt
    }),
  ],
});
```

### Pros
- ✅ Fully automatic - no manual steps
- ✅ Runs on every build
- ✅ Also generates robots.txt
- ✅ No separate script needed

### Cons
- Only runs during build (not in dev mode)
- Need to manually list dynamic routes
- Less control over individual route settings

---

## 🚀 Recommended Workflow

### For Development
Use **Method 2** (Auto-Read Routes) when you want to test sitemap:
```bash
npm run generate:sitemap:auto
```

### For Production
Use **Method 3** (Vite Plugin) - it runs automatically:
```bash
npm run build
```

The sitemap will be in `dist/sitemap.xml` and deployed with your app.

---

## 📝 Adding New Routes

### With Method 2 (Auto-Read Routes)
1. Add route to `router/routes.ts`
2. Optionally configure in `scripts/auto-generate-sitemap.ts`
3. Run `npm run generate:sitemap:auto`

### With Method 3 (Vite Plugin)
1. Add route to `router/routes.ts`
2. Add to `dynamicRoutes` array in `vite.config.ts`
3. Build your app

---

## 🔧 Advanced Configuration

### Exclude Routes from Sitemap

**Method 2:**
```typescript
// In scripts/auto-generate-sitemap.ts
const excludedRoutes = [
  '/404',
  '/admin',
  '*', // Catch-all
];
```

**Method 3:**
```typescript
// In vite.config.ts
Sitemap({
  exclude: ['/404', '/admin/*', '/api/*'],
})
```

### Custom Priority & Frequency

**Method 2:**
```typescript
const defaultConfigs: Record<string, SitemapConfig> = {
  '/': { changefreq: 'daily', priority: 1.0 },
  '/blog': { changefreq: 'daily', priority: 0.9 },
  '/about': { changefreq: 'yearly', priority: 0.3 },
};
```

**Method 3:**
```typescript
Sitemap({
  changefreq: 'monthly', // Default for all
  priority: 0.7, // Default for all
  // For per-route config, use dynamicRoutes with objects
})
```

### Multi-language Support

**Method 3** supports i18n:
```typescript
Sitemap({
  i18n: {
    defaultLanguage: 'en',
    languages: ['en', 'ar'],
    strategy: 'prefix', // or 'suffix'
  },
})
```

---

## 🧪 Testing Your Sitemap

### 1. Validate XML
Use online validators:
- [XML Sitemap Validator](https://www.xml-sitemaps.com/validate-xml-sitemap.html)
- [Google Search Console](https://search.google.com/search-console)

### 2. Check Locally
After building:
```bash
npm run build
npm run preview
```

Visit: `http://localhost:4173/sitemap.xml`

### 3. Verify Routes
```bash
# Count URLs in sitemap
cat dist/sitemap.xml | grep -c "<loc>"

# List all URLs
cat dist/sitemap.xml | grep "<loc>" | sed 's/.*<loc>\(.*\)<\/loc>.*/\1/'
```

---

## 📦 Package Information

### Installed Packages
- `vite-plugin-sitemap` - Automatic sitemap generation during build

### Scripts Available
```json
{
  "generate:sitemap": "Manual generation",
  "generate:sitemap:auto": "Auto-read from routes",
  "build": "Includes automatic sitemap via plugin"
}
```

---

## 🎓 Best Practices

1. **Use Method 3 for production** - It's automatic and reliable
2. **Use Method 2 for testing** - Quick feedback during development
3. **Set VITE_APP_URL** - Always use your production domain
4. **Exclude private routes** - Don't expose admin/auth pages
5. **Update regularly** - Regenerate when routes change
6. **Submit to search engines** - After deployment

---

## 🐛 Troubleshooting

### Sitemap not generated
- Check if `vite-plugin-sitemap` is installed
- Verify `vite.config.ts` has the plugin configured
- Run `npm run build` (not just `npm run dev`)

### Wrong domain in sitemap
- Set `VITE_APP_URL` environment variable
- Update `hostname` in `vite.config.ts`

### Missing routes
- Add to `dynamicRoutes` in `vite.config.ts`
- Check if route is excluded
- Verify route exists in `router/routes.ts`

### Sitemap not updating
- Delete `dist` folder and rebuild
- Clear browser cache
- Check if using correct method

---

## 📚 Additional Resources

- [Sitemap Protocol](https://www.sitemaps.org/protocol.html)
- [Google Sitemap Guidelines](https://developers.google.com/search/docs/advanced/sitemaps/overview)
- [vite-plugin-sitemap Docs](https://www.npmjs.com/package/vite-plugin-sitemap)
- [React Router Docs](https://reactrouter.com/)

---

## 🎉 Summary

You now have **3 powerful methods** for sitemap generation:

1. ✍️ **Manual** - Full control
2. 🤖 **Auto-Read** - Syncs with routes
3. ⚡ **Vite Plugin** - Fully automated

Choose the method that fits your workflow best!
