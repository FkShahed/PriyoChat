// Feed (beta) – interests, cities and small helpers shared by the Feed screen and chat share card.
export const FEED_CATEGORIES = [
  { id: 'bangladesh', label: 'Bangladesh', bn: 'বাংলাদেশ', icon: 'flag', colors: ['#10B981', '#059669'] },
  { id: 'world', label: 'World', bn: 'বিশ্ব', icon: 'globe', colors: ['#3B82F6', '#2563EB'] },
  { id: 'tech', label: 'Tech', bn: 'প্রযুক্তি', icon: 'hardware-chip', colors: ['#8B5CF6', '#6D28D9'] },
  { id: 'cricket', label: 'Cricket', bn: 'ক্রিকেট', icon: 'baseball', colors: ['#F59E0B', '#D97706'] },
  { id: 'sports', label: 'Sports', bn: 'খেলা', icon: 'football', colors: ['#EF4444', '#DC2626'] },
  { id: 'science', label: 'Science', bn: 'বিজ্ঞান', icon: 'flask', colors: ['#06B6D4', '#0891B2'] },
  { id: 'space', label: 'Space', bn: 'মহাকাশ', icon: 'planet', colors: ['#6366F1', '#4F46E5'] },
  { id: 'business', label: 'Business', bn: 'ব্যবসা', icon: 'trending-up', colors: ['#14B8A6', '#0D9488'] },
  { id: 'health', label: 'Health', bn: 'স্বাস্থ্য', icon: 'heart', colors: ['#EC4899', '#DB2777'] },
  { id: 'entertainment', label: 'Entertainment', bn: 'বিনোদন', icon: 'film', colors: ['#F97316', '#EA580C'] },
];

export const CATEGORY_BY_ID = FEED_CATEGORIES.reduce((m, c) => { m[c.id] = c; return m; }, {});

export const FEED_CITIES = [
  { name: 'Dhaka', lat: 23.8103, lng: 90.4125 },
  { name: 'Chattogram', lat: 22.3569, lng: 91.7832 },
  { name: 'Sylhet', lat: 24.8949, lng: 91.8687 },
  { name: 'Rajshahi', lat: 24.3745, lng: 88.6042 },
  { name: 'Khulna', lat: 22.8456, lng: 89.5403 },
  { name: 'Barishal', lat: 22.701, lng: 90.3535 },
  { name: 'Rangpur', lat: 25.7439, lng: 89.2752 },
  { name: 'Mymensingh', lat: 24.7471, lng: 90.4203 },
];

export const DEFAULT_PREFS = {
  interests: ['bangladesh', 'world', 'tech', 'cricket'],
  lang: 'both', // 'bn' | 'en' | 'both'
  city: 'Dhaka',
  onboarded: false,
};

export function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
