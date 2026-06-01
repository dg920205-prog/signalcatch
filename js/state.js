const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function clonePlainData(value) {
  if (Array.isArray(value)) {
    return value.map(clonePlainData);
  }

  if (value && typeof value === "object") {
    const cloned = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (!UNSAFE_KEYS.has(key)) {
        cloned[key] = clonePlainData(nestedValue);
      }
    }

    return cloned;
  }

  return value;
}

function cloneBoundary(value) {
  if (typeof structuredClone === "function") {
    return clonePlainData(structuredClone(value));
  }

  return clonePlainData(value);
}

export function createState(initialState = {}) {
  let state = cloneBoundary(initialState);
  const listeners = new Set();

  return {
    getState() {
      return cloneBoundary(state);
    },

    setState(patch) {
      state = { ...state, ...cloneBoundary(patch) };

      for (const listener of listeners) {
        try {
          listener(cloneBoundary(state));
        } catch {
          // A subscriber failure must not interrupt state propagation.
        }
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
