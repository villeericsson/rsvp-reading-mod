/**
 * Progress storage utilities for persisting reading sessions
 */

const STORAGE_KEY = 'rsvp-reading-registry';

/**
 * Get the reading registry from localStorage
 * @returns {Object} The registry object mapping bookId to currentWordIndex
 */
function getRegistry() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Failed to parse reading registry:', error);
    return {};
  }
}

/**
 * Generate a unique book identifier based on file or text
 * @param {File|string} fileOrText - The file object or string text
 * @returns {string} A unique identifier
 */
export function generateBookId(fileOrText) {
  if (fileOrText instanceof File) {
    // Basic hash using file name and size
    return `file_${fileOrText.name}_${fileOrText.size}`;
  } else if (typeof fileOrText === 'string') {
    // Simple hash for string
    let hash = 0;
    for (let i = 0; i < Math.min(fileOrText.length, 1000); i++) {
        const char = fileOrText.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return `text_${fileOrText.length}_${Math.abs(hash)}`;
  }
  return `unknown_${Date.now()}`;
}

/**
 * Save the reading progress for a specific book
 * @param {string} bookId - The unique book identifier
 * @param {number} currentWordIndex - The current word index
 */
export function saveReadingProgress(bookId, currentWordIndex) {
  if (!bookId) return;
  try {
    const registry = getRegistry();
    registry[bookId] = currentWordIndex;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
  } catch (error) {
    console.error('Failed to save reading progress:', error);
  }
}

/**
 * Get the saved reading progress for a specific book
 * @param {string} bookId - The unique book identifier
 * @returns {number|null} The saved word index, or null if not found
 */
export function getReadingProgress(bookId) {
  if (!bookId) return null;
  const registry = getRegistry();
  return registry[bookId] !== undefined ? registry[bookId] : null;
}

/**
 * Calculate word index from a percentage
 * @param {number} percentage - Percentage (0-100)
 * @param {number} totalWords - Total word count
 * @returns {number} The word index
 */
export function percentageToWordIndex(percentage, totalWords) {
  if (!totalWords || totalWords <= 0) return 0;
  const clamped = Math.max(0, Math.min(100, percentage));
  return Math.floor((clamped / 100) * totalWords);
}

/**
 * Calculate percentage from word index
 * @param {number} wordIndex - Current word index
 * @param {number} totalWords - Total word count
 * @returns {number} The percentage (0-100)
 */
export function wordIndexToPercentage(wordIndex, totalWords) {
  if (!totalWords || totalWords <= 0) return 0;
  return Math.round((wordIndex / totalWords) * 100);
}
