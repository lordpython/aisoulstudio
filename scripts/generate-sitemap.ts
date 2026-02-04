/**
 * Generate sitemap.xml dynamically from route configuration
 * Run with: npm run generate:sitemap
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

// Your domain - update this!
const DOMAIN = 'https://yourdomain.com';

// Route configuration
interface SitemapRoute {
  path: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
  exclude?: boolean; // Exclude from sitemap
}

const routes: SitemapRoute[] = [
  {
    path: '/',
    changefreq: 'weekly',
    priority: 1.0,
  },
  {
    path: '/projects',
    changefreq: 'weekly',
    priority: 0.8,
  },
  {
    path: '/studio',
    changefreq: 'monthly',
    priority: 0.9,
  },
  {
    path: '/visualizer',
    changefreq: 'monthly',
    priority: 0.9,
  },
  {
    path: '/settings',
    changefreq: 'monthly',
    priority: 0.5,
  },
  {
    path: '/signin',
    changefreq: 'yearly',
    priority: 0.6,
  },
];

function generateSitemap(): string {
  const today = new Date().toISOString().split('T')[0];
  
  const urls = routes
    .filter(route => !route.exclude)
    .map(route => `  <url>
    <loc>${DOMAIN}${route.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`)
    .join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  
${urls}

</urlset>
`;
}

// Generate and write sitemap
const sitemap = generateSitemap();
const outputPath = join(process.cwd(), 'public', 'sitemap.xml');

writeFileSync(outputPath, sitemap, 'utf-8');
console.log(`✅ Sitemap generated successfully at: ${outputPath}`);
console.log(`📝 Total URLs: ${routes.filter(r => !r.exclude).length}`);
