import type { Confidence, FolderExplanation, Verdict } from '../../shared/types'

export class AiValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiValidationError'
  }
}

/** The validated shape the AI must return. */
export interface AiAnswer {
  whatItIs: string
  createdBy: string
  verdict: Verdict
  confidence: Confidence
  consequenceIfDeleted: string
}

const VERDICTS: Verdict[] = ['SAFE', 'REBUILDS_AUTOMATICALLY', 'CAUTION', 'DONT_TOUCH']
const MAX_FIELD = 600

/** Models sometimes wrap JSON in prose or code fences. Take the outermost {...}. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new AiValidationError('The AI did not return JSON')
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new AiValidationError('The AI returned malformed JSON')
  }
}

function toConfidence(v: unknown): Confidence {
  if (typeof v === 'string') {
    const up = v.trim().toUpperCase()
    if (up === 'LOW' || up === 'MEDIUM' || up === 'HIGH') return up
  }
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) {
    const p = v > 1 ? v / 100 : v
    return p >= 0.75 ? 'HIGH' : p >= 0.4 ? 'MEDIUM' : 'LOW'
  }
  throw new AiValidationError('The AI returned an invalid confidence')
}

/** Parses and strictly validates the AI's reply. Throws AiValidationError if anything is off. */
export function parseAiAnswer(text: string): AiAnswer {
  const raw = extractJson(text)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new AiValidationError('The AI reply is not an object')
  const o = raw as Record<string, unknown>

  const field = (key: string): string => {
    const v = o[key]
    if (typeof v !== 'string' || v.trim() === '') throw new AiValidationError(`The AI reply is missing "${key}"`)
    return v.trim().slice(0, MAX_FIELD)
  }

  const verdict = typeof o.verdict === 'string' ? o.verdict.trim().toUpperCase() : ''
  if (!VERDICTS.includes(verdict as Verdict)) throw new AiValidationError('The AI returned an invalid verdict')

  return {
    whatItIs: field('whatItIs'),
    createdBy: field('createdBy'),
    verdict: verdict as Verdict,
    confidence: toConfidence(o.confidence),
    consequenceIfDeleted: field('consequenceIfDeleted')
  }
}

/**
 * Low confidence moves the verdict toward caution; it never makes it more permissive.
 *  - LOW:    SAFE and REBUILDS_AUTOMATICALLY become CAUTION
 *  - MEDIUM: SAFE becomes CAUTION (only a confident answer may say "safe")
 *  - HIGH:   unchanged
 * CAUTION and DONT_TOUCH are never changed.
 */
export function applyConfidencePolicy(verdict: Verdict, confidence: Confidence): Verdict {
  if (confidence === 'LOW' && (verdict === 'SAFE' || verdict === 'REBUILDS_AUTOMATICALLY')) return 'CAUTION'
  if (confidence === 'MEDIUM' && verdict === 'SAFE') return 'CAUTION'
  return verdict
}

// Phrases that say deleting the folder breaks, loses or uninstalls something.
const BREAKAGE =
  /\b(?:breaks?|broken|stops? working|stopped working|(?:will|would|may|might|can)\s+(?:not|no longer)\s+(?:work|run|start|open|launch|function)|won'?t\s+(?:work|run|start|open|launch)|crash(?:es)?|corrupt\w*|data loss|lose|loses|lost|permanently|uninstall\w*|reinstall(?:ing)?|need(?:s)? to be (?:re)?installed|fresh (?:download|install\w*))\b/i
// "nothing is lost", "will not break", "no data loss": the same words, used to reassure.
const NEGATED =
  /\b(?:no|not|never|nothing|none|without|n't)\b[^.;]{0,40}?\b(?:breaks?|broken|crash(?:es)?|corrupt\w*|data loss|lose|loses|lost)\b/gi

/**
 * A SAFE or REBUILDS verdict whose own explanation says deleting will break or lose something is
 * contradicting itself. Small models do this. Trust the warning in the text over the label.
 */
export function contradictsSafety(consequence: string): boolean {
  return BREAKAGE.test(consequence.replace(NEGATED, ' '))
}

export function toExplanation(answer: AiAnswer): FolderExplanation {
  let verdict = applyConfidencePolicy(answer.verdict, answer.confidence)
  let reason: FolderExplanation['downgradeReason']
  if (verdict !== answer.verdict) reason = 'low-confidence'

  if ((verdict === 'SAFE' || verdict === 'REBUILDS_AUTOMATICALLY') && contradictsSafety(answer.consequenceIfDeleted)) {
    verdict = 'CAUTION'
    reason = 'contradiction'
  }

  return {
    whatItIs: answer.whatItIs,
    createdBy: answer.createdBy,
    verdict,
    confidence: answer.confidence,
    consequenceIfDeleted: answer.consequenceIfDeleted,
    source: 'ai',
    ...(verdict !== answer.verdict ? { downgradedFrom: answer.verdict, downgradeReason: reason } : {})
  }
}
