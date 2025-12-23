/**
 * Dynamic Product Category Type
 *
 * Replaces the previous static enum with a string alias so categories
 * can be created dynamically (e.g. from the database). Existing imports
 * referencing `ProductCategory` remain valid.
 */
export type ProductCategory = string;

/**
 * Category metadata for enhanced UX and SEO
 * Following the Open/Closed Principle - open for extension, closed for modification
 */
export interface CategoryMetadata {
  key: string;
  label: string;
  description: string;
  icon?: string;
  seoKeywords: string[];
  popularTags: string[];
}

/**
 * Category configuration with metadata
 * Single source of truth for all category-related information
 */
export const CATEGORY_METADATA: Record<string, CategoryMetadata> = {
  natural_hair: {
    key: 'natural_hair',
    label: 'Natural Hair',
    description: 'Authentic natural hair textures for versatile styling.',
    icon: 'flower',
    seoKeywords: ['natural hair', 'afro', 'textured', 'virgin hair', 'kinky'],
    popularTags: ['4c', 'kinky', 'afro', 'coily', 'protective'],
  },
  straight_wigs: {
    key: 'straight_wigs',
    label: 'Straight Wigs',
    description: 'Premium straight wigs offering sleek, polished looks.',
    icon: 'scissors',
    seoKeywords: ['straight wigs', 'silky', 'bone straight', 'lace', 'human hair'],
    popularTags: ['bone straight', 'HD lace', 'middle part', 'natural line'],
  },
  'curly_&_wavy_wigs': {
    key: 'curly_&_wavy_wigs',
    label: 'Curly & Wavy Wigs',
    description: 'Beautiful curly and wavy wigs providing volume, bounce, and texture.',
    icon: 'waves',
    seoKeywords: ['curly wigs', 'wavy wigs', 'deep wave', 'body wave', 'loose curl'],
    popularTags: ['body wave', 'deep curl', 'water wave', 'loose curl', 'kinky curl'],
  },
  braided_wigs: {
    key: 'braided_wigs',
    label: 'Braided Wigs',
    description: 'Handcrafted braided wigs delivering protective styling and elegance.',
    icon: 'shield',
    seoKeywords: ['braided wigs', 'box braids', 'twists', 'cornrow', 'protective style'],
    popularTags: ['box braids', 'knotless', 'cornrow', 'twists', 'fulani'],
  },
  'frontal_&_closure_wigs': {
    key: 'frontal_&_closure_wigs',
    label: 'Frontal & Closure Wigs',
    description: 'High-quality frontal and closure wigs for seamless hairlines.',
    icon: 'layout',
    seoKeywords: ['frontal wig', 'closure wig', 'HD frontal', 'transparent lace', 'pre-plucked'],
    popularTags: ['13x4 frontal', '5x5 closure', 'HD lace', 'transparent lace', 'pre-plucked'],
  },
  'hair_bundles_&_extensions': {
    key: 'hair_bundles_&_extensions',
    label: 'Hair Bundles & Extensions',
    description: 'Premium hair bundles and extensions for length and volume.',
    icon: 'layers',
    seoKeywords: ['hair bundles', 'extensions', 'weft', 'clip-ins', 'virgin hair'],
    popularTags: ['bundle deals', 'virgin hair', 'raw hair', 'clip-ins', 'weft'],
  },
  'wig_care_&_accessories': {
    key: 'wig_care_&_accessories',
    label: 'Wig Care & Accessories',
    description: 'Essential wig care accessories and maintenance products.',
    icon: 'tool',
    seoKeywords: ['wig care', 'accessories', 'maintenance', 'lace glue', 'edge control'],
    popularTags: ['lace glue', 'edge control', 'wig stand', 'detangler', 'silk cap'],
  },
};

/**
 * Utility function to validate category
 * @param category - Category string to validate
 * @returns boolean indicating if category is valid
 */
export function isValidCategory(category: string): category is ProductCategory {
  // If present in metadata treat as valid; otherwise allow any non-empty string
  return !!category && (category in CATEGORY_METADATA || category.trim().length > 0);
}

/**
 * Utility function to get all valid categories
 * @returns Array of all valid category values
 */
export function getAllCategories(): ProductCategory[] {
  return Object.keys(CATEGORY_METADATA);
}

/**
 * Utility function to get category metadata
 * @param category - Category to get metadata for
 * @returns Category metadata or null if invalid
 */
export function getCategoryMetadata(category: ProductCategory): CategoryMetadata | null {
  return CATEGORY_METADATA[category] || null;
}

/**
 * Utility function to normalize category input
 * Handles case-insensitive matching and whitespace
 * @param input - Raw category input
 * @returns Normalized ProductCategory or null
 */
export function normalizeCategoryInput(input: string): ProductCategory | null {
  if (!input) return null;
  // Preserve special characters like & by replacing spaces only
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
  return normalized.length ? normalized : null;
}

/**
 * Generate fallback metadata for categories not present in CATEGORY_METADATA.
 */
export function generateMetadataForCategory(rawName: string): CategoryMetadata {
  const key = normalizeCategoryInput(rawName) || rawName;
  const label = rawName
    .split(/[_\s]+/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
    .replace(/&/g, '&');
  return {
    key,
    label,
    description: `Explore our ${label} collection.`,
    icon: 'grid',
    seoKeywords: [label.toLowerCase(), 'hair', 'wigs', 'beauty'],
    popularTags: [],
  };
}
