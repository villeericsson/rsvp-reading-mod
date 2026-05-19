import { get, set, keys } from 'idb-keyval';

const CACHE_PREFIX = 'rsvp-book-';
const LATEST_BOOK_KEY = 'rsvp-latest-book-id';

/**
 * Save fully parsed book data into IndexedDB
 * @param {string} bookId - Unique book identifier
 * @param {string} text - Raw string text of the book
 * @param {Array<{text: string, inQuotes: boolean}>} words - Parsed word array
 * @param {Array<{title: string, wordIndex: number}>} chapters - Parsed chapters
 */
export async function saveBookToCache(bookId, text, words, chapters, title = "") {
  const bookData = {
    bookId,
    text,
    words,
    chapters,
    title,
    lastAccessed: Date.now()
  };
  
  try {
    await set(CACHE_PREFIX + bookId, bookData);
    await set(LATEST_BOOK_KEY, bookId);
  } catch (error) {
    console.error("Failed to save book to cache:", error);
  }
}

/**
 * Retrieve the most recently accessed book from IndexedDB
 * @returns {Promise<{bookId: string, text: string, words: Array, chapters: Array} | null>}
 */
export async function getLatestBookFromCache() {
  try {
    const latestBookId = await get(LATEST_BOOK_KEY);
    if (!latestBookId) return null;
    
    const latestBook = await get(CACHE_PREFIX + latestBookId);
    
    // As a fallback, if LATEST_BOOK_KEY points to something missing or if we want to scan all
    if (latestBook) {
      // Update lastAccessed timestamp
      latestBook.lastAccessed = Date.now();
      await set(CACHE_PREFIX + latestBookId, latestBook);
      return latestBook;
    }

    // Fallback: search all keys
    const allKeys = await keys();
    const bookKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(CACHE_PREFIX));
    
    if (bookKeys.length === 0) return null;
    
    let mostRecentBook = null;
    let maxTime = 0;
    
    for (const key of bookKeys) {
      const book = await get(key);
      if (book && book.lastAccessed > maxTime) {
        maxTime = book.lastAccessed;
        mostRecentBook = book;
      }
    }
    
    if (mostRecentBook) {
      await set(LATEST_BOOK_KEY, mostRecentBook.bookId);
      mostRecentBook.lastAccessed = Date.now();
      await set(CACHE_PREFIX + mostRecentBook.bookId, mostRecentBook);
    }
    
    return mostRecentBook;
  } catch (error) {
    console.error("Failed to load book from cache:", error);
    return null;
  }
}
