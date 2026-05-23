/**
 * RSVP utility functions for text processing and display calculations
 */

/**
 * Parse plain text into an array of word objects.
 * @param {string} text - The input text to parse
 * @returns {Array<{text: string, inQuotes: boolean, isItalic: boolean, isBold: boolean, isParagraphEnd: boolean}>}
 */
export function parseText(text) {
  if (!text || typeof text !== "string") return [];
  
  // Split into paragraphs by double newlines (or more) to handle structural breaks
  // We use \n\s*\n to match two or more newlines potentially separated by whitespace
  const paragraphs = text.split(/\n\s*\n/);
  
  const words = [];

  for (const paragraph of paragraphs) {
    // Reset quote state at the start of each paragraph to prevent cascading inversions.
    // Track the OUTER quote type so nested quotes of the other type don't toggle state.
    let outerQuoteType = null; // null | 'double' | 'single'

    const rawWords = paragraph.trim().split(/\s+/).filter((w) => w.length > 0);

    for (let iWord = 0; iWord < rawWords.length; iWord++) {
      const rawWord = rawWords[iWord];
      // Apostrophe Safety: Remove single quotes flanked by letters (don't, it's)
      const cleaned = rawWord.replace(/(?<=\p{L})['‘’](?=\p{L})/gu, '');
      let wordInQuotes = outerQuoteType !== null;

      for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        let kind = null;

        if (ch === '“') kind = 'dOpen';
        else if (ch === '”') kind = 'dClose';
        else if (ch === '‘') kind = 'sOpen';
        else if (ch === '’') kind = 'sClose';
        else if (ch === '"') kind = (i === 0) ? 'dOpen' : 'dClose';
        else if (ch === "'") {
          // Leading ' opens; trailing ' only closes when already in a single-quote outer
          // (guards against possessives like dogs')
          if (i === 0) kind = 'sOpen';
          else if (outerQuoteType === 'single' && /^['.,!?;:]*$/.test(cleaned.slice(i))) {
            kind = 'sClose';
          }
        }
        if (!kind) continue;

        if (outerQuoteType === null) {
          if (kind === 'dOpen')      { outerQuoteType = 'double'; wordInQuotes = true; }
          else if (kind === 'sOpen') { outerQuoteType = 'single'; wordInQuotes = true; }
        } else if (outerQuoteType === 'double') {
          wordInQuotes = true;
          if (kind === 'dClose') outerQuoteType = null;
        } else {
          wordInQuotes = true;
          if (kind === 'sClose') outerQuoteType = null;
        }
      }

      const isLast = (iWord === rawWords.length - 1);
      words.push({ text: rawWord, inQuotes: wordInQuotes, isItalic: false, isBold: false, isParagraphEnd: isLast });
    }
  }

  return words;
}

/**
 * Process a single raw word for quote tracking. Mutates the passed quoteState
 * (an object with an `outerQuoteType` field).
 * @returns {boolean} whether the word is inside quotes
 */
function trackQuotesForWord(rawWord, quoteState) {
  const cleaned = rawWord.replace(/(?<=\p{L})['‘’](?=\p{L})/gu, '');
  let wordInQuotes = quoteState.outerQuoteType !== null;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    let kind = null;

    if (ch === '“') kind = 'dOpen';
    else if (ch === '”') kind = 'dClose';
    else if (ch === '‘') kind = 'sOpen';
    else if (ch === '’') kind = 'sClose';
    else if (ch === '"') kind = (i === 0) ? 'dOpen' : 'dClose';
    else if (ch === "'") {
      if (i === 0) kind = 'sOpen';
      else if (quoteState.outerQuoteType === 'single' && /^['.,!?;:]*$/.test(cleaned.slice(i))) {
        kind = 'sClose';
      }
    }
    if (!kind) continue;

    if (quoteState.outerQuoteType === null) {
      if (kind === 'dOpen')      { quoteState.outerQuoteType = 'double'; wordInQuotes = true; }
      else if (kind === 'sOpen') { quoteState.outerQuoteType = 'single'; wordInQuotes = true; }
    } else if (quoteState.outerQuoteType === 'double') {
      wordInQuotes = true;
      if (kind === 'dClose') quoteState.outerQuoteType = null;
    } else {
      wordInQuotes = true;
      if (kind === 'sClose') quoteState.outerQuoteType = null;
    }
  }

  return wordInQuotes;
}

/**
 * Parse rich text segments (with italic/bold metadata) into word objects.
 * Each segment is split on whitespace; every resulting word inherits its
 * segment's italic/bold flags. Quote tracking spans the whole stream.
 *
 * @param {Array<{text: string, isItalic: boolean, isBold: boolean, isParagraphEnd?: boolean}>} segments
 * @returns {Array<{text: string, inQuotes: boolean, isItalic: boolean, isBold: boolean}>}
 */
export function parseRichText(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return [];

  const words = [];
  const quoteState = { outerQuoteType: null };

  for (const seg of segments) {
    if (!seg || !seg.text) continue;
    const parts = seg.text.split(/\s+/).filter(w => w.length > 0);
    for (let i = 0; i < parts.length; i++) {
      const rawWord = parts[i];
      const wordInQuotes = trackQuotesForWord(rawWord, quoteState);
      const isLastOfSegment = (i === parts.length - 1);
      words.push({
        text: rawWord,
        inQuotes: wordInQuotes,
        isItalic: !!seg.isItalic,
        isBold: !!seg.isBold,
        isParagraphEnd: isLastOfSegment && !!seg.isParagraphEnd,
      });
    }
  }

  return words;
}

/**
 * Calculate the Optimal Recognition Point (ORP) index for a word.
 * The ORP is the character position where the eye naturally focuses when reading.
 * Based on word length, this determines which letter should be highlighted.
 * Supports all Unicode letters (Latin, Cyrillic, CJK, Arabic, etc.)
 *
 * @param {string} word - The word to calculate ORP for
 * @returns {number} The index of the letter that should be highlighted
 */
export function getORPIndex(word) {
  if (!word || typeof word !== "string") return 0;
  const len = word.replace(/[^\p{L}]/gu, "").length;
  if (len <= 1) return 0;
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 12) return 3;
  return Math.floor(Math.log2(len - 1)) + 1;
}

/**
 * Get the actual character index for ORP, accounting for leading punctuation.
 * This adjusts the ORP index to skip over non-letter characters.
 * Supports all Unicode letters.
 *
 * @param {string} word - The word to calculate actual ORP for
 * @returns {number} The actual character index in the word
 */
// Pre-compiled regex for performance
const unicodeLetterRegex = /\p{L}/u

export function getActualORPIndex(word) {
  if (!word || typeof word !== "string") return 0;

  const orpIndex = getORPIndex(word);
  let letterCount = 0;

  for (let i = 0; i < word.length; i++) {
    if (unicodeLetterRegex.test(word[i])) {
      if (letterCount === orpIndex) return i
      letterCount++
    }
  }

  return Math.min(orpIndex, word.length - 1);
}

/**
 * Calculate the display delay for a word based on WPM, punctuation, compound words, numbers, and paragraph breaks.
 *
 * @param {string} word - The word to calculate delay for
 * @param {number} wordsPerMinute - Reading speed in WPM
 * @param {boolean} pauseOnPunctuation - Whether to add extra pause on punctuation
 * @param {number} punctuationMultiplier - Multiplier for sentence-ending punctuation
 * @param {number} wordLengthWPMMultiplier - Multiplier for long words
 * @param {boolean} pauseOnCompoundWords - Whether to add extra pause on compound words
 * @param {number} compoundWordMultiplier - Multiplier for compound words
 * @param {number} numberPauseMultiplier - Base multiplier for numbers
 * @param {number} digitLengthPenalty - Extra pause percentage per digit
 * @param {number} paragraphEndMultiplier - Multiplier for paragraph ends
 * @param {boolean} isParagraphEnd - Whether the word is at the end of a paragraph
 * @returns {number} Delay in milliseconds
 */
export function getWordDelay(
  word,
  wordsPerMinute,
  pauseOnPunctuation = true,
  punctuationMultiplier = 2,
  wordLengthWPMMultiplier = 0,
  pauseOnCompoundWords = true,
  compoundWordMultiplier = 2,
  numberPauseMultiplier = 2,
  digitLengthPenalty = 10,
  paragraphEndMultiplier = 2,
  isParagraphEnd = false,
) {
  if (!word || typeof word !== "string") return 60000 / wordsPerMinute;
  if (!wordsPerMinute || wordsPerMinute <= 0) return 200; // Default fallback

  let baseDelay = 60000 / wordsPerMinute;

  // Longer pause for long words (12+ characters is roughly 2 standard deviations above average English word length)
  if (wordLengthWPMMultiplier > 0 && word.length >= 12) {
    // For every character above 12, add wordLengthWPMMultiplier percentage points to delay
    baseDelay *= 1 + ((wordLengthWPMMultiplier / 100) * (word.length - 12));
  }

  // Collect candidates
  let multiplier = 1;

  if (pauseOnPunctuation) {
    if (/[.!?;:]$/.test(word)) multiplier = Math.max(multiplier, punctuationMultiplier);
    else if (/,$/.test(word))  multiplier = Math.max(multiplier, 1.5);
  }

  if (pauseOnCompoundWords) {
    const numSymbols = (word.match(/[-–—]/g) || []).length;
    if (numSymbols > 0) {
      const m = 1 + numSymbols * (compoundWordMultiplier - 1);
      multiplier = Math.max(multiplier, m);
    }
  }

  const numDigits = (word.match(/\d/g) || []).length;
  if (numDigits > 0) {
    const m = numberPauseMultiplier + numDigits * (digitLengthPenalty / 100);
    multiplier = Math.max(multiplier, m);
  }

  if (isParagraphEnd) {
    multiplier = Math.max(multiplier, paragraphEndMultiplier);
  }

  return baseDelay * multiplier;
}

/**
 * Format remaining reading time as MM:SS
 *
 * @param {number} remainingWords - Number of words remaining
 * @param {number} wordsPerMinute - Reading speed in WPM
 * @returns {string} Formatted time string (e.g., "2:30")
 */
export function formatTimeRemaining(remainingWords, wordsPerMinute) {
  if (remainingWords <= 0 || !wordsPerMinute || wordsPerMinute <= 0) {
    return "0:00";
  }

  const seconds = Math.ceil((remainingWords / wordsPerMinute) * 60);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Split a word into parts for ORP display (before, ORP letter, after)
 *
 * @param {string} word - The word to split
 * @returns {{ before: string, orp: string, after: string }} Word parts
 */
export function splitWordForDisplay(word) {
  if (!word || typeof word !== "string") {
    return { before: "", orp: "", after: "" };
  }

  const orpIndex = getActualORPIndex(word);

  return {
    before: word.slice(0, orpIndex),
    orp: word[orpIndex] || "",
    after: word.slice(orpIndex + 1),
  };
}

/**
 * Check if a word should trigger a pause based on pause-every-N-words setting
 *
 * @param {number} wordIndex - Current word index (0-based)
 * @param {number} pauseAfterWords - Pause after every N words (0 = disabled)
 * @returns {boolean} Whether to pause
 */
export function shouldPauseAtWord(wordIndex, pauseAfterWords) {
  if (pauseAfterWords <= 0) return false;
  if (wordIndex <= 0) return false;
  return wordIndex % pauseAfterWords === 0;
}

/**
 * Extract a subset of words centered on current position
 * @param {string[]} allWords - Complete word array
 * @param {number} centerIdx - Index to center on
 * @param {number} frameSize - Total words to display (odd numbers recommended)
 * @returns {{ subset: string[], centerOffset: number }}
 */
export function extractWordFrame(allWords, centerIdx, frameSize) {
  if (frameSize <= 1 || centerIdx >= allWords.length) {
    return { subset: [allWords[centerIdx] || ""], centerOffset: 0 };
  }

  const radius = Math.floor(frameSize / 2);
  const leftBound = Math.max(0, centerIdx - radius);
  const rightBound = Math.min(allWords.length, centerIdx + radius + 1);

  const subset = allWords.slice(leftBound, rightBound);
  const centerOffset = centerIdx - leftBound;

  return { subset, centerOffset };
}
