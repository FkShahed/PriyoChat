// Feed (beta) – interests, cities and small helpers shared by the Feed screen and chat share card.
// "group" decides the heading the topic sits under in the interests sheet
export const FEED_GROUPS = [
  { id: 'news', label: 'News & life', icon: 'newspaper-outline' },
  { id: 'sports', label: 'Sports', icon: 'football-outline' },
  { id: 'tech', label: 'Science & technology', icon: 'hardware-chip-outline' },
  { id: 'medical', label: 'Medical & health', icon: 'medkit-outline' },
  { id: 'women', label: 'Women & beauty', icon: 'rose-outline' },
];

export const FEED_CATEGORIES = [
  { id: 'bangladesh', group: 'news', label: 'Bangladesh', bn: 'বাংলাদেশ', icon: 'flag', colors: ['#10B981', '#059669'] },
  { id: 'world', group: 'news', label: 'World', bn: 'বিশ্ব', icon: 'globe', colors: ['#3B82F6', '#2563EB'] },
  { id: 'business', group: 'news', label: 'Business', bn: 'ব্যবসা', icon: 'trending-up', colors: ['#14B8A6', '#0D9488'] },
  { id: 'entertainment', group: 'news', label: 'Entertainment', bn: 'বিনোদন', icon: 'film', colors: ['#F97316', '#EA580C'] },

  { id: 'cricket', group: 'sports', label: 'Cricket', bn: 'ক্রিকেট', icon: 'baseball', colors: ['#F59E0B', '#D97706'] },
  { id: 'sports', group: 'sports', label: 'Sports', bn: 'খেলা', icon: 'football', colors: ['#EF4444', '#DC2626'] },

  { id: 'tech', group: 'tech', label: 'Tech', bn: 'প্রযুক্তি', icon: 'laptop', colors: ['#8B5CF6', '#6D28D9'] },
  { id: 'ai', group: 'tech', label: 'AI & Robotics', bn: 'এআই ও রোবটিক্স', icon: 'sparkles', colors: ['#A855F7', '#7E22CE'] },
  { id: 'engineering', group: 'tech', label: 'Engineering', bn: 'ইঞ্জিনিয়ারিং', icon: 'construct', colors: ['#F59E0B', '#B45309'] },
  { id: 'semiconductor', group: 'tech', label: 'Semiconductors & VLSI', bn: 'সেমিকন্ডাক্টর ও ভিএলএসআই', icon: 'hardware-chip', colors: ['#0EA5E9', '#0369A1'] },
  { id: 'electronics', group: 'tech', label: 'Electronics & Embedded', bn: 'ইলেকট্রনিক্স', icon: 'flash', colors: ['#EAB308', '#A16207'] },
  { id: 'science', group: 'tech', label: 'Science', bn: 'বিজ্ঞান', icon: 'flask', colors: ['#06B6D4', '#0891B2'] },
  { id: 'space', group: 'tech', label: 'Space', bn: 'মহাকাশ', icon: 'planet', colors: ['#6366F1', '#4F46E5'] },

  { id: 'medical', group: 'medical', label: 'Medical Science', bn: 'চিকিৎসা বিজ্ঞান', icon: 'medkit', colors: ['#F43F5E', '#BE123C'] },
  { id: 'medresearch', group: 'medical', label: 'Medical Research', bn: 'মেডিকেল গবেষণা', icon: 'document-text', colors: ['#EF4444', '#B91C1C'] },
  { id: 'cardiology', group: 'medical', label: 'Heart & Cardiology', bn: 'হৃদরোগ', icon: 'heart-circle', colors: ['#E11D48', '#9F1239'] },
  { id: 'cancer', group: 'medical', label: 'Cancer Research', bn: 'ক্যান্সার গবেষণা', icon: 'ribbon', colors: ['#D946EF', '#A21CAF'] },
  { id: 'mentalhealth', group: 'medical', label: 'Mental Health', bn: 'মানসিক স্বাস্থ্য', icon: 'happy', colors: ['#38BDF8', '#0284C7'] },
  { id: 'nutrition', group: 'medical', label: 'Nutrition & Diet', bn: 'পুষ্টি ও খাদ্যাভ্যাস', icon: 'nutrition', colors: ['#22C55E', '#15803D'] },
  { id: 'health', group: 'medical', label: 'Health', bn: 'স্বাস্থ্য', icon: 'heart', colors: ['#EC4899', '#DB2777'] },

  { id: 'beauty', group: 'women', label: 'Women & Beauty', bn: 'নারী ও সৌন্দর্য', icon: 'rose', colors: ['#F472B6', '#DB2777'] },
  { id: 'skincare', group: 'women', label: 'Skin & Hair Care', bn: 'স্কিন ও হেয়ার কেয়ার', icon: 'water', colors: ['#FB7185', '#E11D48'] },
  { id: 'fashion', group: 'women', label: 'Fashion', bn: 'ফ্যাশন', icon: 'shirt', colors: ['#C084FC', '#9333EA'] },
  { id: 'womenhealth', group: 'women', label: "Women's Health", bn: 'নারীস্বাস্থ্য', icon: 'female', colors: ['#F9A8D4', '#BE185D'] },
  { id: 'pregnancy', group: 'women', label: 'Mother & Baby', bn: 'মা ও শিশু', icon: 'balloon', colors: ['#FDBA74', '#EA580C'] },
];

const BUILT_IN = FEED_CATEGORIES.reduce((m, c) => { m[c.id] = c; return m; }, {});
// Topics the reader typed themselves are sent by the server as "my:<words>"; they get a plain look of their own.
export const CATEGORY_BY_ID = new Proxy(BUILT_IN, {
  get(target, key) {
    if (typeof key === 'string' && target[key] === undefined && key.startsWith('my:')) {
      return { id: key, label: key.slice(3), icon: 'bookmark', colors: ['#7C3AED', '#5B4BE8'], custom: true };
    }
    return target[key];
  },
});

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
  customTopics: [], // topics the reader typed in (shown as "My own topics")
  lang: 'both', // 'bn' | 'en' | 'both'
  city: 'Dhaka',
  useGps: false, // true = use the phone's current location instead of the chosen city
  lat: null,
  lng: null,
  placeName: '',
  onboarded: false,
  // daily cards the user wants to see
  extras: { ayah: true, dua: true, word: true, quote: true, recipe: true, fact: true, joke: true, sunmoon: true, uv: true, safety: true, holidays: true, art: true },
};

export const DAILY_EXTRAS = [
  { id: 'ayah', label: 'Ayah of the day', bn: 'আজকের আয়াত', icon: 'book' },
  { id: 'dua', label: 'Dua of the day', bn: 'আজকের দোয়া', icon: 'hand-left' },
  { id: 'word', label: 'Word of the day', bn: 'আজকের শব্দ', icon: 'text' },
  { id: 'quote', label: 'Quote of the day', bn: 'আজকের উক্তি', icon: 'chatbox-ellipses' },
  { id: 'recipe', label: 'Recipe of the day', bn: 'আজকের রেসিপি', icon: 'restaurant' },
  { id: 'fact', label: 'Fun fact', bn: 'মজার তথ্য', icon: 'bulb' },
  { id: 'joke', label: 'Light joke', bn: 'হালকা জোকস', icon: 'happy' },
  { id: 'sunmoon', label: 'Sun & moon', bn: 'সূর্য ও চাঁদ', icon: 'moon' },
  { id: 'uv', label: 'UV & dust', bn: 'ইউভি ও ধুলা', icon: 'sunny' },
  { id: 'safety', label: 'Earthquakes, disasters & rivers', bn: 'দুর্যোগ সতর্কতা', icon: 'warning' },
  { id: 'holidays', label: 'Public holidays', bn: 'সরকারি ছুটি', icon: 'calendar' },
  { id: 'art', label: 'Artwork of the day', bn: 'আজকের শিল্পকর্ম', icon: 'color-palette' },
];

// The Feed now has a tab for each of these; the cards you switch on or off here decide what shows inside that tab.
// (Matches, Markets and News have no switches: they are always there.)
export const EXTRA_GROUPS = [
  { id: 'daily', label: 'Daily', icon: 'sunny', ids: ['sunmoon', 'uv'] },
  { id: 'safety', label: 'Safety', icon: 'warning', ids: ['safety'] },
  { id: 'holidays', label: 'Holidays', icon: 'calendar', ids: ['holidays'] },
  { id: 'inspiration', label: 'Inspiration', icon: 'sparkles', ids: ['ayah', 'dua', 'quote', 'word'] },
  { id: 'discover', label: 'Discover', icon: 'compass', ids: ['art', 'recipe', 'fact', 'joke'] },
];

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
