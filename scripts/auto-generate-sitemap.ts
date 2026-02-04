/**
 * Automatic Sitemap Generator
 * Reads React Router configuration and generates sitemap automatically
 * Run with: npm run generate:sitemap:auto
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { routes } from '../router/routes';

// Configuration
const DOMAIN = process.env.VITE_APP_URL || 'https://yourdomain.com';

interface SitemapConfig {
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

// Default configuration for different route types
const defaultConfigs: Record<string, SitemapConfig> = {
  '/': { changefreq: 'weekly', priority: 1.0 },
  '/projects': { changefreq: 'weekly', priority: 0.8 },
  '/studio': { changefreq: 'monthly', priority: 0.9 },
  '/visualizer': { changefreq: 'monthly', priority: 0.9 },
  '/settings': { changefreq: 'monthly', priority: 0.5 },
  '/signin': { changefreq: 'yearly', priority: 0.6 },
};

// Routes to exclude from sitemap
const excludedRoutes = [
  '/404',
  '*', // Catch-all route
];

function generateSitemap(): string {
  const today = new Date().toISOString().split('T')[0];
  
  // Filter and map routes
  const validRoutes = routes
    .filter(route => !excludedRoutes.includes(route.path))
    .filter(route => !route.meta?.requiresAuth) // Optionally exclude auth-required routes
    .map(route => {
      const config = defaultConfigs[route.path] || {
        changefreq: 'monthly',
        priority: 0.5,
      };
      
      return `  <url>
    <loc>${DOMAIN}${route.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${config.changefreq}</changefreq>
    <priority>${config.priority}</priority>
  </url>`;
    })
    .join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  
${validRoutes}

</urlset>
`;
}

function generateRobotsTxt(): string {
  return `# robots.txt for LyricLens

User-agent: *
Allow: /
Disallow: /api/

# Sitemap location
Sitemap: ${DOMAIN}/sitemap.xml
`;
}

// Generate files
try {
  const sitemap = generateSitemap();
  const robotsTxt = generateRobotsTxt();
  
  const publicDir = join(process.cwd(), 'public');
  
  writeFileSync(join(publicDir, 'sitemap.xml'), sitemap, 'utf-8');
  writeFileSync(join(publicDir, 'robots.txt'), robotsTxt, 'utf-8');
  
  console.log('✅ Sitemap generated successfully!');
  console.log(`📝 Total URLs: ${routes.filter(r => !excludedRoutes.includes(r.path)).length}`);
  console.log(`🌐 Domain: ${DOMAIN}`);
  console.log(`📍 Files created:`);
  console.log(`   - ${join(publicDir, 'sitemap.xml')}`);
  console.log(`   - ${join(publicDir, 'robots.txt')}`);
} catch (error) {
  console.error('❌ Error generating sitemap:', error);
  process.exit(1);
}
