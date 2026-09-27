// Share one delivery/control queue: results and reminders cannot spend the
// same budget, and controls ordered before a delivery are always respected.
let tail: Promise<unknown> = Promise.resolve()
export function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = tail.then(work, work)
  tail = next.catch(() => undefined)
  return next
}
