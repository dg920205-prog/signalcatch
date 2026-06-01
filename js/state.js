export function createState(initialState = {}) {
  let state = { ...initialState };
  const listeners = new Set();

  return {
    getState() {
      return { ...state };
    },

    setState(patch) {
      state = { ...state, ...patch };

      for (const listener of listeners) {
        listener({ ...state });
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
