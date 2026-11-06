import { create } from 'zustand';

// Scroll-driven UI flags for the Feed page. They live outside the Feed component on purpose:
// changing them re-renders only the small components that read them (go-to-top button, pinned tab bar),
// not the whole page with all its cards and images (that was the source of the scroll lag).
// `tab` is the highlighted tab: it changes the instant a tab is tapped and re-renders only the tab bar.
const useFeedUiStore = create((set) => ({
  showTop: false,
  stuck: false,
  tab: 'daily',
  setShowTop: (showTop) => set((s) => (s.showTop === showTop ? s : { showTop })),
  setStuck: (stuck) => set((s) => (s.stuck === stuck ? s : { stuck })),
  setTab: (tab) => set((s) => (s.tab === tab ? s : { tab })),
  // Leaving the Feed page (for example to open one match) clears only the scroll flags. The chosen tab is kept,
  // otherwise the tab bar would jump back to "Daily" while the page itself still shows the other tab.
  reset: () => set({ showTop: false, stuck: false }),
}));

export default useFeedUiStore;
