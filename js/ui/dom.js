const SAFE_ATTRIBUTES = new Set([
  "id", "title", "type", "value", "name", "placeholder", "role", "class",
  "for", "min", "max", "step", "open", "hidden", "datetime", "disabled",
  "checked", "selected", "download", "viewBox", "points", "colspan",
]);

const SAFE_IFRAME_ATTRIBUTES = new Set(["src", "loading", "referrerpolicy", "allowfullscreen"]);

function isSafeAttribute(name) {
  return SAFE_ATTRIBUTES.has(name) || name.startsWith("aria-") || name.startsWith("data-");
}

function isSafeIframeAttribute(node, name, value) {
  if (String(node.tagName).toLowerCase() !== "iframe" || !SAFE_IFRAME_ATTRIBUTES.has(name)) {
    return false;
  }
  return name !== "src" || String(value).startsWith("https://s.tradingview.com/");
}

export function safeText(value, fallback = "") {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) ? value : fallback;
}

export function snapshotArray(value, limit = 500, { strict = false } = {}) {
  try {
    if (!Array.isArray(value)) {
      return { ok: false, values: [] };
    }

    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, "value")) {
      return { ok: false, values: [] };
    }
    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < 0) {
      return { ok: false, values: [] };
    }

    const values = [];
    for (let index = 0; index < Math.min(length, limit); index += 1) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, "value")) {
          if (strict) {
            return { ok: false, values: [] };
          }
          continue;
        }
        values.push(descriptor.value);
      } catch {
        if (strict) {
          return { ok: false, values: [] };
        }
        return { ok: false, values: [] };
      }
    }
    return { ok: true, truncated: length > limit, values };
  } catch {
    return { ok: false, values: [] };
  }
}

export function createDom(documentRef = globalThis.document) {
  if (!documentRef?.createElement || !documentRef?.createTextNode) {
    throw new TypeError("A document implementation is required.");
  }

  function setText(node, value = "") {
    node.textContent = String(value ?? "");
    return node;
  }

  function append(parent, ...children) {
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) {
        continue;
      }
      parent.append(
        typeof child === "string" || typeof child === "number"
          ? documentRef.createTextNode(child)
          : child,
      );
    }
    return parent;
  }

  function clear(node) {
    node.replaceChildren();
    return node;
  }

  function applyAttributes(node, attributes) {
    for (const [name, value] of Object.entries(attributes ?? {})) {
      if (/^on[A-Z]/.test(name) && typeof value === "function") {
        node.addEventListener(name.slice(2).toLowerCase(), value);
      } else if (
        (isSafeAttribute(name) || isSafeIframeAttribute(node, name, value)) &&
        value !== false &&
        value !== undefined &&
        value !== null
      ) {
        node.setAttribute(name, value === true ? "" : String(value));
      }
    }
    return node;
  }

  function el(tagName, attributes = {}, ...children) {
    return append(applyAttributes(documentRef.createElement(tagName), attributes), ...children);
  }

  function svgEl(tagName, attributes = {}, ...children) {
    if (!documentRef.createElementNS) {
      throw new TypeError("SVG document implementation is required.");
    }
    return append(
      applyAttributes(documentRef.createElementNS("http://www.w3.org/2000/svg", tagName), attributes),
      ...children,
    );
  }

  return { append, clear, el, setText, svgEl };
}

export const dom = globalThis.document ? createDom(globalThis.document) : null;
