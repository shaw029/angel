export function textWalker(root: Element = document.body): TreeWalker {
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = (node.parentElement?.tagName ?? '').toUpperCase()
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
}

export function isVisible(el: Element): boolean {
  // checkVisibility() is available in Chrome 105+ and does not force layout reflow.
  // Fall back to getBoundingClientRect() only on older engines.
  if (typeof (el as Element & { checkVisibility?: () => boolean }).checkVisibility === 'function') {
    return (el as Element & { checkVisibility: () => boolean }).checkVisibility()
  }
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}
