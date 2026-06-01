const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const INVALID = Symbol("invalid");
const INVALID_STRUCTURE = Symbol("invalid-structure");
const MAX_ARRAY_LENGTH = 1000;
const MAX_DEPTH = 20;

function isArrayIndex(key, length) {
  return /^(0|[1-9]\d*)$/.test(key) && Number(key) < length;
}

function cloneArray(value, depth, ancestors) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    return INVALID;
  }

  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_ARRAY_LENGTH) {
    return INVALID;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const cloned = new Array(length);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (
      !isArrayIndex(key, length) ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      continue;
    }

    const nestedValue = clonePlainData(descriptor.value, depth + 1, ancestors);
    if (nestedValue === INVALID_STRUCTURE) {
      return INVALID_STRUCTURE;
    }
    if (nestedValue !== INVALID) {
      cloned[key] = nestedValue;
    }
  }

  return cloned;
}

function cloneObject(value, depth, ancestors, tolerateInvalidBranches) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return INVALID;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const cloned = {};

  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (UNSAFE_KEYS.has(key) || !descriptor.enumerable || !("value" in descriptor)) {
      continue;
    }

    const nestedValue = clonePlainData(descriptor.value, depth + 1, ancestors);
    if (nestedValue === INVALID_STRUCTURE) {
      if (tolerateInvalidBranches) {
        continue;
      }
      return INVALID_STRUCTURE;
    }
    if (nestedValue !== INVALID) {
      cloned[key] = nestedValue;
    }
  }

  return cloned;
}

function clonePlainData(
  value,
  depth = 0,
  ancestors = new WeakSet(),
  tolerateInvalidBranches = false,
) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return INVALID;
  }
  if (depth > MAX_DEPTH || ancestors.has(value)) {
    return INVALID_STRUCTURE;
  }

  ancestors.add(value);
  try {
    return Array.isArray(value)
      ? cloneArray(value, depth, ancestors)
      : cloneObject(value, depth, ancestors, tolerateInvalidBranches);
  } catch {
    return INVALID_STRUCTURE;
  } finally {
    ancestors.delete(value);
  }
}

function cloneInitialState(initialState) {
  const cloned = clonePlainData(initialState, 0, new WeakSet(), true);
  return cloned && typeof cloned === "object" && !Array.isArray(cloned) ? cloned : {};
}

export function createState(initialState = {}) {
  let state = cloneInitialState(initialState);
  const listeners = new Set();

  return {
    getState() {
      return cloneInitialState(state);
    },

    setState(patch) {
      const clonedPatch = clonePlainData(patch, 0, new WeakSet(), true);
      if (!clonedPatch || typeof clonedPatch !== "object" || Array.isArray(clonedPatch)) {
        return;
      }

      state = { ...state, ...clonedPatch };

      for (const listener of listeners) {
        try {
          listener(cloneInitialState(state));
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
