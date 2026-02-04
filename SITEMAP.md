# Sitemap Configuration

This document explains the sitemap setup for LyricLens webapp.

## Files Created

1. **`public/sitemap.xml`** - XML sitemap for search engines
2. **`public/robots.txt`** - Robots.txt file with sitemap reference
3. **`scripts/generate-sitemap.ts`** - Script to generate sitemap dynamically

## Quick Start

### 1. Update Your Domain

Before deploying, update the domain in these files:

- `public/sitemap.xml` - Replace `https://yourdomain.com` with your actual domain
- `public/robots.txt` - Replace `https://yourdomain.com` with your actual domain
- `scripts/generate-sitemap.ts` - Update the `DOMAIN` constant

### 2. Generate Sitemap

Run the generation script:

```bash
npm run generate:sitemap
```

This will automatically update `public/sitemap.xml` with current routes and today's date.

### 3. Verify Sitemap

After building your app, verify the sitemap is accessible at:
- `https://yourdomain.com/sitemap.xml`
- `https://yourdomain.com/robots.txt`

## Routes Included

The sitemap includes these public routes:

| Route | Priority | Change Frequency | Description |
|-------|----------|------------------|-------------|
| `/` | 1.0 | weekly | Home page (highest priority) |
| `/projects` | 0.8 | weekly | User projects dashboard |
| `/studio` | 0.9 | monthly | Studio creation workspace |
| `/visualizer` | 0.9 | monthly | Audio visualizer tool |
| `/settings` | 0.5 | monthly | Settings page |
| `/signin` | 0.6 | yearly | Sign-in page |

## SEO Best Practices

### Priority Guidelines
- **1.0** - Most important page (usually homepage)
- **0.8-0.9** - Main feature pages
- **0.5-0.7** - Secondary pages
- **0.3-0.4** - Utility pages

### Change Frequency Guidelines
- **daily** - Content changes daily (news, blogs)
- **weekly** - Updated weekly (dashboards, feeds)
- **monthly** - Updated monthly (feature pages)
- **yearly** - Rarely changes (legal, about)

## Submit to Search Engines

After deployment, submit your sitemap to:

### Google Search Console
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add your property
3. Navigate to Sitemaps
4. Submit: `https://yourdomain.com/sitemap.xml`

### Bing Webmaster Tools
1. Go to [Bing Webmaster Tools](https://www.bing.com/webmasters)
2. Add your site
3. Submit sitemap URL

## Automation

### Build-time Generation

Add to your build process in `package.json`:

```json
"scripts": {
  "prebuild": "npm run generate:sitemap",
  "build": "vite build"
}
```

This ensures the sitemap is always up-to-date before building.

### CI/CD Integration

For automated deployments, add to your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Generate Sitemap
  run: npm run generate:sitemap

- name: Build
  run: npm run build
```

## Dynamic Routes

If you add dynamic routes (e.g., `/project/:id`), you'll need to:

1. Fetch the list of IDs from your database
2. Generate URLs for each ID
3. Add them to the sitemap

Example modification to `generate-sitemap.ts`:

```typescript
// Fetch dynamic project IDs
const projectIds = await fetchProjectIds();

// Add dynamic routes
projectIds.forEach(id => {
  routes.push({
    path: `/project/${id}`,
    changefreq: 'weekly',
    priority: 0.7,
  });
});
```

## Troubleshooting

### Sitemap not accessible
- Ensure `public/sitemap.xml` exists
- Check Vite build includes public folder
- Verify deployment includes static files

### Search engines not indexing
- Wait 24-48 hours after submission
- Check robots.txt isn't blocking crawlers
- Verify sitemap XML is valid at [XML Sitemap Validator](https://www.xml-sitemaps.com/validate-xml-sitemap.html)

### Routes missing
- Run `npm run generate:sitemap` before building
- Check `scripts/generate-sitemap.ts` includes all routes
- Verify no routes have `exclude: true`

## Additional Resources

- [Google Sitemap Guidelines](https://developers.google.com/search/docs/advanced/sitemaps/overview)
- [Sitemap Protocol](https://www.sitemaps.org/protocol.html)
- [Robots.txt Specification](https://developers.google.com/search/docs/advanced/robots/intro)
