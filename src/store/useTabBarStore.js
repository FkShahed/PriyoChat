import { create } from 'zustand';

// Lets a screen (e.g. Feed) slide the floating bottom tab bar away while scrolling down
// and bring it back when scrolling up. Purely visual state.
const useTabBarStore = create((set) => ({
  hidden: false,
  setHidden: (hidden) => set((s) => (s.hidden === hidden ? s : { hidden })),
}));

export default useTabBarStore;
