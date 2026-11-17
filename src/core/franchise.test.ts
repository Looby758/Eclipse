import { describe, expect, it } from 'vitest'
import { franchiseName, franchisePhrases, matchesPhrase, normalizeName, pickFranchise, type FranchiseHit } from './franchise'
import { guideForQuery } from './guides'
import { listIdFor, sourceOf } from './lists'
import { titleKey } from './types'

const hit = (type: 'movie' | 'tv', id: number, name: string, votes = 500, extra: Partial<FranchiseHit> = {}): FranchiseHit => ({
  key: titleKey(type, id),
  type,
  id,
  name,
  year: 2020,
  posterPath: null,
  votes,
  genres: [18],
  language: 'en',
  ...extra
})

describe('franchise names', () => {
  it('normalises names', () => {
    expect(normalizeName('The Walking Dead: Daryl Dixon')).toBe('walking dead daryl dixon')
    expect(normalizeName('Pokémon & Friends')).toBe('pokemon and friends')
  })

  it('matches whole words only', () => {
    expect(matchesPhrase('Fear the Walking Dead', 'walking dead')).toBe(true)
    expect(matchesPhrase('Tales of the Walking Dead', 'walking dead')).toBe(true)
    expect(matchesPhrase('Aliens', 'alien')).toBe(false)
    expect(matchesPhrase('Alien: Romulus', 'alien')).toBe(true)
  })

  it('suggests phrases from a title', () => {
    expect(franchisePhrases('The Walking Dead: Dead City')[0]).toBe('walking dead')
    expect(franchisePhrases('Fear the Walking Dead')).toEqual(['fear the walking dead', 'walking dead'])
    expect(franchisePhrases('Alien 3')).toEqual(['alien 3', 'alien'])
    expect(franchisePhrases('Up')).toEqual([])
  })

  it('finds the walking dead shows and leaves out the rest', () => {
    const hits = [
      hit('tv', 1402, 'The Walking Dead', 16000),
      hit('tv', 62286, 'Fear the Walking Dead', 5000),
      hit('tv', 94305, 'The Walking Dead: World Beyond', 900),
      hit('tv', 206586, 'The Walking Dead: Daryl Dixon', 800),
      hit('tv', 1, 'Talking Dead', 50, { genres: [10767] }),
      hit('movie', 2, 'The Walking Dead: The Making Of', 30, { genres: [99] }),
      hit('movie', 3, 'Walking Dead fan film', 3),
      hit('movie', 4, 'Walking Dead Man', 40, { language: 'ko' }),
      hit('tv', 1402, 'The Walking Dead', 16000)
    ]
    const picked = pickFranchise(hits, 'walking dead')!
    expect(picked.map((h) => h.id)).toEqual([1402, 62286, 94305, 206586])
    expect(franchiseName(picked, 'walking dead')).toBe('The Walking Dead')
  })

  it('keeps the title you came from even with few votes', () => {
    const picked = pickFranchise([hit('tv', 1, 'Dead City', 900), hit('tv', 2, 'Dead City Stories', 2)], 'dead city', [titleKey('tv', 2)])!
    expect(picked).toHaveLength(2)
  })

  it('gives up on names that are too common', () => {
    const hits = Array.from({ length: 50 }, (_, i) => hit('movie', i + 1, `Love ${i}`))
    expect(pickFranchise(hits, 'love')).toBeNull()
  })

  it('names a franchise with no exact title from its phrase', () => {
    expect(franchiseName([hit('movie', 1, 'Harry Potter and the Goblet of Fire')], 'harry potter')).toBe('Harry Potter')
  })

  it('round-trips franchise list ids', () => {
    const id = listIdFor({ kind: 'franchise', phrase: 'walking dead' })
    expect(id).toBe('franchise:walking-dead')
    expect(sourceOf(id)).toEqual({ kind: 'franchise', phrase: 'walking dead' })
  })

  it('sends Marvel and Star Wars searches to the curated guides', () => {
    expect(guideForQuery('Star Wars')?.id).toBe('star-wars')
    expect(guideForQuery('MCU')?.id).toBe('marvel')
    expect(guideForQuery('The Avengers')?.id).toBe('marvel')
    expect(guideForQuery('The Walking Dead')).toBeUndefined()
  })
})
