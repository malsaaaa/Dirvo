import { describe, expect, it } from 'vitest'
import { AiValidationError, applyConfidencePolicy, contradictsSafety, parseAiAnswer, toExplanation } from '../src/main/ai/validate'
import type { Confidence, Verdict } from '../src/shared/types'

const good = {
  whatItIs: 'Cache of a game launcher.',
  createdBy: 'ExampleGames',
  verdict: 'REBUILDS_AUTOMATICALLY',
  confidence: 'HIGH',
  consequenceIfDeleted: 'It is downloaded again.'
}

describe('parseAiAnswer', () => {
  it('accepts a clean JSON reply', () => {
    expect(parseAiAnswer(JSON.stringify(good))).toEqual(good)
  })

  it('accepts JSON wrapped in code fences or prose', () => {
    expect(parseAiAnswer('```json\n' + JSON.stringify(good) + '\n```')).toEqual(good)
    expect(parseAiAnswer('Here you go: ' + JSON.stringify(good) + ' Hope that helps!')).toEqual(good)
  })

  it('normalises case and whitespace', () => {
    const r = parseAiAnswer(JSON.stringify({ ...good, verdict: ' safe ', confidence: 'medium', whatItIs: '  hi  ' }))
    expect(r).toMatchObject({ verdict: 'SAFE', confidence: 'MEDIUM', whatItIs: 'hi' })
  })

  it('maps numeric confidence', () => {
    const conf = (c: number): string => parseAiAnswer(JSON.stringify({ ...good, confidence: c })).confidence
    expect(conf(0.9)).toBe('HIGH')
    expect(conf(0.5)).toBe('MEDIUM')
    expect(conf(0.1)).toBe('LOW')
    expect(conf(85)).toBe('HIGH') // percentages
  })

  it('caps overlong fields', () => {
    const r = parseAiAnswer(JSON.stringify({ ...good, whatItIs: 'x'.repeat(5000) }))
    expect(r.whatItIs).toHaveLength(600)
  })

  it('ignores extra keys', () => {
    expect(parseAiAnswer(JSON.stringify({ ...good, extra: 'ignore me', verdictOverride: 'SAFE' }))).toEqual(good)
  })

  it.each([
    ['no JSON at all', 'Sorry, I cannot help with that.'],
    ['malformed JSON', '{ "whatItIs": "x", '],
    ['an array', '[1,2,3]'],
    ['an unknown verdict', JSON.stringify({ ...good, verdict: 'DELETE_IT' })],
    ['a missing verdict', JSON.stringify({ ...good, verdict: undefined })],
    ['a non-string verdict', JSON.stringify({ ...good, verdict: 3 })],
    ['a bad confidence word', JSON.stringify({ ...good, confidence: 'SURE' })],
    ['an out-of-range confidence', JSON.stringify({ ...good, confidence: 400 })],
    ['a missing whatItIs', JSON.stringify({ ...good, whatItIs: undefined })],
    ['an empty createdBy', JSON.stringify({ ...good, createdBy: '   ' })],
    ['a non-string consequence', JSON.stringify({ ...good, consequenceIfDeleted: { a: 1 } })]
  ])('rejects %s', (_label, text) => {
    expect(() => parseAiAnswer(text)).toThrow(AiValidationError)
  })
})

describe('applyConfidencePolicy', () => {
  const table: Array<[Verdict, Confidence, Verdict]> = [
    ['SAFE', 'HIGH', 'SAFE'],
    ['SAFE', 'MEDIUM', 'CAUTION'],
    ['SAFE', 'LOW', 'CAUTION'],
    ['REBUILDS_AUTOMATICALLY', 'HIGH', 'REBUILDS_AUTOMATICALLY'],
    ['REBUILDS_AUTOMATICALLY', 'MEDIUM', 'REBUILDS_AUTOMATICALLY'],
    ['REBUILDS_AUTOMATICALLY', 'LOW', 'CAUTION'],
    ['CAUTION', 'HIGH', 'CAUTION'],
    ['CAUTION', 'LOW', 'CAUTION'],
    ['DONT_TOUCH', 'HIGH', 'DONT_TOUCH'],
    ['DONT_TOUCH', 'LOW', 'DONT_TOUCH']
  ]
  it.each(table)('%s at %s confidence -> %s', (verdict, confidence, expected) => {
    expect(applyConfidencePolicy(verdict, confidence)).toBe(expected)
  })

  it('never makes a verdict more permissive', () => {
    const order: Verdict[] = ['SAFE', 'REBUILDS_AUTOMATICALLY', 'CAUTION', 'DONT_TOUCH']
    for (const v of order) {
      for (const c of ['LOW', 'MEDIUM', 'HIGH'] as Confidence[]) {
        expect(order.indexOf(applyConfidencePolicy(v, c))).toBeGreaterThanOrEqual(order.indexOf(v))
      }
    }
  })
})

describe('toExplanation', () => {
  it('marks the source as ai and records a downgrade', () => {
    const e = toExplanation({ ...good, verdict: 'SAFE', confidence: 'LOW' } as never)
    expect(e).toMatchObject({ source: 'ai', verdict: 'CAUTION', confidence: 'LOW', downgradedFrom: 'SAFE' })
  })
  it('has no downgrade marker when the verdict is unchanged', () => {
    const e = toExplanation({ ...good } as never)
    expect(e.verdict).toBe('REBUILDS_AUTOMATICALLY')
    expect(e.downgradedFrom).toBeUndefined()
  })
})

describe('contradiction guard (a "safe" verdict whose own text warns of damage)', () => {
  it.each([
    'Deleting this folder will break the Ollama app on your system.',
    'The program stops working and must be reinstalled.',
    'You will lose your saved games.',
    'Settings are permanently removed.',
    'The app will no longer start until you uninstall and reinstall it.',
    'It could corrupt the database.',
    'A fresh download and installation of the program is required.'
  ])('flags: %s', (text) => expect(contradictsSafety(text)).toBe(true))

  it.each([
    'The app recreates it automatically on the next run.',
    'Pages load slower at first while the cache refills.',
    'Nothing of yours is lost.',
    'This will not break anything.',
    'There is no data loss. npm downloads the packages again.',
    'Packages are downloaded again when needed.'
  ])('does not flag reassurance: %s', (text) => expect(contradictsSafety(text)).toBe(false))

  const base = { whatItIs: 'x', createdBy: 'y', confidence: 'HIGH' as const }

  it('moves a confident SAFE answer to CAUTION when its explanation warns of breakage', () => {
    const e = toExplanation({ ...base, verdict: 'SAFE', consequenceIfDeleted: 'Deleting this will break the app.' })
    expect(e).toMatchObject({ verdict: 'CAUTION', downgradedFrom: 'SAFE', downgradeReason: 'contradiction' })
  })

  it('does the same for REBUILDS_AUTOMATICALLY', () => {
    const e = toExplanation({ ...base, verdict: 'REBUILDS_AUTOMATICALLY', consequenceIfDeleted: 'You would lose your settings.' })
    expect(e).toMatchObject({ verdict: 'CAUTION', downgradeReason: 'contradiction' })
  })

  it('leaves CAUTION and DONT_TOUCH alone, and clean answers alone', () => {
    expect(toExplanation({ ...base, verdict: 'DONT_TOUCH', consequenceIfDeleted: 'Windows will break.' }).verdict).toBe('DONT_TOUCH')
    expect(toExplanation({ ...base, verdict: 'CAUTION', consequenceIfDeleted: 'It will break.' }).downgradedFrom).toBeUndefined()
    const ok = toExplanation({ ...base, verdict: 'SAFE', consequenceIfDeleted: 'Nothing happens. It is rebuilt later.' })
    expect(ok).toMatchObject({ verdict: 'SAFE' })
    expect(ok.downgradedFrom).toBeUndefined()
  })

  it('reports low confidence as the reason when that is what changed it', () => {
    const e = toExplanation({ ...base, confidence: 'LOW', verdict: 'SAFE', consequenceIfDeleted: 'Harmless.' })
    expect(e.downgradeReason).toBe('low-confidence')
  })
})
