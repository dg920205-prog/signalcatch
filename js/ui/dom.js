const SAFE_ATTRIBUTES = new Set([
  "id", "title", "type", "value", "name", "placeholder", "role", "class",
  "for", "min", "max", "step", "open", "hidden", "datetime", "disabled",
  "checked", "selected", "download",
]);

function isSafeAttribute(name) {
  return SAFE_ATTRIBUTES.has(name) || name.startsWith("aria-") || name.startsWith("data-");
}

export function safeText(value, fallback = "") {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) ? value : fallback;
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

  function el(tagName, attributes = {}, ...children) {
    const node = documentRef.createElement(tagName);

    for (const [name, value] of Object.entries(attributes ?? {})) {
      if (/^on[A-Z]/.test(name) && typeof value === "function") {
        node.addEventListener(name.slice(2).toLowerCase(), value);
      } else if (isSafeAttribute(name) && value !== false && value !== undefined && value !== null) {
        node.setAttribute(name, value === true ? "" : String(value));
      }
    }

    return append(node, ...children);
  }

  return { append, clear, el, setText };
}

export const dom = globalThis.document ? createDom(globalThis.document) : null;
