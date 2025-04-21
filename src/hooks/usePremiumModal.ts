import { create } from "zustand";

interface PremiumModalState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

// use zustand to this useState throughout entire app
// no need to call useState repeatedly for same modal
// Useful to have so we can show it throughout our app
const usePremiumModal = create<PremiumModalState>((set) => ({
  open: false,
  setOpen: (open: boolean) => set({ open }),
}));

export default usePremiumModal;
