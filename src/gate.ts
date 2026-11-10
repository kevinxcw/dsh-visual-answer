/**
 * Filesystem-free, synchronously testable pieces of the visual-answer gate.
 *
 * The Host half decides whether a turn really produced a page and what to do
 * about it. Everything that can be decided from strings and plain records lives
 * here so it can be unit tested without a live Agent or a filesystem.
 */

/** One entry of the visual output directory, reduced to what the gate reads. */
export interface VisualEntry {
  name: string
  size: number
  mtimeMs: number
}

/** Verdict for the page a turn is supposed to have produced. */
export interface Verdict {
  ok: boolean
  reason: string
}

const HTML_NAME = /\.html?$/iu

/** Whether a directory entry is a page this plugin would list. */
export function isHtmlName(name: string): boolean {
  return !name.startsWith('.') && HTML_NAME.test(name)
}

/**
 * Check that a file is a complete, self-contained document rather than an empty
 * file, a fragment, or a truncated stream.
 * @param source - the whole file content.
 * @returns the verdict and a short reason when it fails.
 */
export function validateHtml(source: string): Verdict {
  const body = source.trim()
  if (body === '') return { ok: false, reason: 'file is empty' }
  if (!/<html[\s>]/iu.test(body)) return { ok: false, reason: 'no <html> element' }
  if (!/<body[\s>]/iu.test(body)) return { ok: false, reason: 'no <body> element' }
  if (!/<\/html\s*>\s*$/iu.test(body)) return { ok: false, reason: 'document is truncated' }
  return { ok: true, reason: '' }
}

/**
 * Pick the newest page written since a turn started.
 *
 * The mtime window is what makes this independent of the tool the model used:
 * `write`, `bash` redirection and `apply_patch` all land in the same place.
 * @param entries - directory listing.
 * @param sinceMs - earliest acceptable modification time, in epoch milliseconds.
 * @returns the newest matching entry, if any.
 */
export function pickProduced(
  entries: readonly VisualEntry[],
  sinceMs: number,
): VisualEntry | undefined {
  if (!Number.isFinite(sinceMs)) return undefined
  let best: VisualEntry | undefined
  for (const entry of entries) {
    if (!isHtmlName(entry.name)) continue
    if (!Number.isFinite(entry.mtimeMs) || entry.mtimeMs < sinceMs) continue
    if (best === undefined || entry.mtimeMs > best.mtimeMs) best = entry
  }
  return best
}

/** What the turn-end gate does next. */
export type GateAction = 'pass' | 'retry' | 'miss'

/**
 * The whole gate policy, kept as one pure decision so it can be tested without
 * an Agent: a valid page passes, a missing page earns exactly one corrective
 * step, and a second miss closes the turn with nothing produced.
 * @param hasValidPage - whether the turn produced a page that passed validation.
 * @param retried - whether the turn already received its corrective step.
 * @returns what the Host should do next.
 */
export function gateAction(hasValidPage: boolean, retried: boolean): GateAction {
  if (hasValidPage) return 'pass'
  return retried ? 'miss' : 'retry'
}
