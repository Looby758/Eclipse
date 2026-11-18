import { describe, expect, it } from 'vitest'
import { learn, leaning, normalizeTaste } from './taste'
import { applyTaste, answerRecommendation, whyText, type Recommendation } from './recommend'
import { normalizeLibrary } from './library'
import type { Trait } from './types'

const t = (id: string, name: string): Trait => ({ id, name })
// Shadowhunters-ish, a grim monster hunt, and Supernatural.
const shadowhunters = [t('creator:1', 'Ed Decter'), t('network:2', 'Freeform'), t('cast:3', 'Katherine McNamara'), t('keyword:10', 'demon'), t('keyword:11', 'found family')]
const grimHunt = [t('creator:4', 'Grim Maker'), t('network:5', 'Grim Network'), t('cast:6', 'Gruff Lead'), t('keyword:10', 'demon'), t('keyword:12', 'gore')]
const supernatural = [t('creator:7', 'Eric Kripke'), t('network:8', 'The CW'), t('cast:9', 'Jensen Ackles'), t('keyword:10', 'demon'), t('keyword:11', 'found family')]
const grimHunt2 = [t('creator:4', 'Grim Maker'), t('network:5', 'Grim Network'), t('keyword:12', 'gore'), t('keyword:10', 'demon')]

const rec = (key: string, name: string, score: number): Recommendation => {
  const [type, id] = key.split(':')
  return { key: key as Recommendation['key'], type: type as 'tv', id: Number(id), name, year: 2020, posterPath: '/p.jpg', overview: '', popularity: 1, score, because: ['Shadowhunters'] }
}

describe('recommendations that learn', () => {
  it('a no lowers what shares its makers more than what only shares a keyword', () => {
    const taste = learn(undefined, grimHunt, false)
    expect(taste.no).toBe(1)
    const other = leaning(taste, grimHunt2)
    const kindred = leaning(taste, supernatural)
    expect(other.adjust).toBeLessThan(-0.8)
    expect(kindred.adjust).toBeLessThan(0)
    expect(kindred.adjust).toBeGreaterThan(-0.2)
    expect(other.disliked).toEqual(['Grim Maker', 'Grim Network'])
  })

  it('learns over a session so the shows like ones you said yes to rise above the ones like your no’s', () => {
    let taste = learn(undefined, shadowhunters, true)
    taste = learn(taste, grimHunt, false)
    const ranked = applyTaste([rec('tv:20', 'Another grim hunt', 10), rec('tv:21', 'Supernatural', 6), rec('tv:22', 'Unrelated', 8)], { 'tv:20': grimHunt2, 'tv:21': supernatural }, taste)
    expect(ranked.map((r) => r.name)).toEqual(['Unrelated', 'Supernatural', 'Another grim hunt'])
    // Supernatural only shares keywords with Shadowhunters here, so it gets a small lift and no named reason.
    expect(ranked[1].score).toBeGreaterThan(6)
  })

  it('names people it liked in the reason', () => {
    const taste = learn(undefined, supernatural, true)
    const [r] = applyTaste([rec('tv:30', 'Another Kripke show', 5)], { 'tv:30': [t('creator:7', 'Eric Kripke')] }, taste)
    expect(r.liked).toEqual(['Eric Kripke'])
    expect(whyText({ because: ['The Walking Dead', 'Shadowhunters'], liked: r.liked })).toBe('Because of The Walking Dead and Shadowhunters · you were interested in others with Eric Kripke')
    expect(whyText({ because: ['A', 'B', 'C'] })).toBe('Because of A and B +1')
  })

  it('keeps any one trait and the whole lift within bounds', () => {
    let taste = learn(undefined, grimHunt, false)
    for (let i = 0; i < 20; i++) taste = learn(taste, grimHunt, false)
    expect(taste.weights['creator:4'].w).toBe(-2.5)
    expect(leaning(taste, grimHunt).adjust).toBe(-2.5)
    // Answering yes then no cancels out.
    expect(learn(learn(undefined, supernatural, true), supernatural, false).weights).toEqual({})
  })

  it('a no hides the title, a yes doesn’t, and what it learnt survives saving', () => {
    const lib = normalizeLibrary({ version: 1, entries: {} })
    const after = answerRecommendation(answerRecommendation(lib, 'tv:40', false, grimHunt), 'tv:41', true, shadowhunters)
    expect(after.recsHidden).toEqual(['tv:40'])
    const back = normalizeLibrary(JSON.parse(JSON.stringify(after)))
    expect(back.recsTaste).toEqual(after.recsTaste)
    expect(back.recsTaste).toMatchObject({ yes: 1, no: 1 })
    expect(normalizeTaste({ weights: { 'bogus:1': { w: 1 }, 'cast:3': { w: 99, name: 'X' } }, yes: -1 })).toEqual({ weights: { 'cast:3': { w: 2.5, name: 'X' } }, yes: 0, no: 0 })
    expect(normalizeTaste('nonsense')).toBeUndefined()
  })
})
