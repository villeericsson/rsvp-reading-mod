import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  generateBookId,
  saveReadingProgress,
  getReadingProgress,
  percentageToWordIndex,
  wordIndexToPercentage
} from '../lib/progress-storage.js'

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value }),
    removeItem: vi.fn((key) => { delete store[key] }),
    clear: vi.fn(() => { store = {} })
  }
})()

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock
})

describe('progress-storage', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('generateBookId', () => {
    it('should generate hash for a File object', () => {
      const file = new File([''], 'test.epub')
      const id = generateBookId(file)
      expect(id).toMatch(/^file_test\.epub_\d+$/)
    })

    it('should generate hash for a string', () => {
      const id = generateBookId('Hello world test text')
      expect(id).toMatch(/^text_21_\d+$/)
    })
  })

  describe('saveReadingProgress & getReadingProgress', () => {
    it('should save and get progress from localStorage', () => {
      const bookId = 'file_test.epub_123'
      
      saveReadingProgress(bookId, 42)
      
      expect(localStorageMock.setItem).toHaveBeenCalled()
      
      // Simulate retrieving
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({ [bookId]: 42 }))
      
      const progress = getReadingProgress(bookId)
      expect(progress).toBe(42)
    })

    it('should return null when bookId is not found', () => {
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({ 'other': 10 }))
      const progress = getReadingProgress('unknown')
      expect(progress).toBeNull()
    })
    
    it('should ignore invalid saves', () => {
      saveReadingProgress(null, 42)
      expect(localStorageMock.setItem).not.toHaveBeenCalled()
    })
  })

  describe('percentageToWordIndex', () => {
    it('should convert percentage to word index', () => {
      expect(percentageToWordIndex(0, 100)).toBe(0)
      expect(percentageToWordIndex(50, 100)).toBe(50)
      expect(percentageToWordIndex(100, 100)).toBe(100)
    })

    it('should handle decimal percentages', () => {
      expect(percentageToWordIndex(25.5, 100)).toBe(25)
      expect(percentageToWordIndex(33.33, 300)).toBe(99)
    })

    it('should clamp values to 0-100 range', () => {
      expect(percentageToWordIndex(-10, 100)).toBe(0)
      expect(percentageToWordIndex(150, 100)).toBe(100)
    })

    it('should return 0 for invalid totalWords', () => {
      expect(percentageToWordIndex(50, 0)).toBe(0)
      expect(percentageToWordIndex(50, -10)).toBe(0)
    })
  })

  describe('wordIndexToPercentage', () => {
    it('should convert word index to percentage', () => {
      expect(wordIndexToPercentage(0, 100)).toBe(0)
      expect(wordIndexToPercentage(50, 100)).toBe(50)
      expect(wordIndexToPercentage(100, 100)).toBe(100)
    })

    it('should round to nearest integer', () => {
      expect(wordIndexToPercentage(33, 100)).toBe(33)
      expect(wordIndexToPercentage(1, 3)).toBe(33)
    })

    it('should return 0 for invalid totalWords', () => {
      expect(wordIndexToPercentage(50, 0)).toBe(0)
      expect(wordIndexToPercentage(50, -10)).toBe(0)
    })
  })
})
