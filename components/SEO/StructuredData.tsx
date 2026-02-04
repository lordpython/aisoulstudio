/**
 * Structured Data (JSON-LD) component for SEO
 * Add this to your pages for better search engine understanding
 */

interface StructuredDataProps {
  type?: 'WebApplication' | 'WebSite' | 'Organization';
  name?: string;
  description?: string;
  url?: string;
}

export function StructuredData({
  type = 'WebApplication',
  name = 'LyricLens',
  description = 'AI-powered lyric video generator - Create stunning music videos with AI',
  url = 'https://yourdomain.com',
}: StructuredDataProps) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': type,
    name,
    description,
    url,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web Browser',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'AI-powered video generation',
      'Lyric synchronization',
      'Audio visualization',
      'Multi-language support',
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

/**
 * Breadcrumb structured data for navigation
 */
interface BreadcrumbItem {
  name: string;
  url: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function BreadcrumbStructuredData({ items }: BreadcrumbProps) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
