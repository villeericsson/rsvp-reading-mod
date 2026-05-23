/**
 * RSVP utility functions for text processing and display calculations
 */

/**
 * Parse plain text into an array of word objects.
 *
 * Quote tracking uses a stack so that nested quotes contribute to a `quoteDepth`
 * (0 = narration, 1 = inside outer quote, 2 = quote-within-quote, ...). The
 * legacy `inQuotes` field is derived as `quoteDepth > 0` for backward compatibility.
 *
 * Ambiguous straight quotes (" and ') are classified open/close from their
 * surrounding characters in the raw paragraph string — this is what lets
 * same-type nesting like `"He said "stop" now"` work. The original word text is
 * preserved verbatim; normalization is internal only.
 *
 * Quote state carries across paragraph breaks only when the next paragraph
 * opens with the same type as the currently-open quote (convention for
 * multi-paragraph speech). Otherwise the stack is cleared at the boundary —
 * orphan/unclosed quotes from typos can't cascade across the whole document.
 *
 * @param {string} text - The input text to parse
 * @returns {Array<{text: string, inQuotes: boolean, quoteDepth: number, isItalic: boolean, isBold: boolean, isParagraphEnd: boolean}>}
 */
export function parseText(text) {
  if (!text || typeof text !== "string") return [];

  const paragraphs = text.split(/\n\s*\n/);
  const words = [];
  const quoteState = { stack: [] };

  for (let p = 0; p < paragraphs.length; p++) {
    const paragraph = paragraphs[p];
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    maybeCarryQuoteAcrossParagraph(quoteState, trimmed);

    const tokens = tokenizeParagraph(trimmed);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const quoteDepth = processWordQuoteEvents(tok, quoteState);
      words.push({
        text: tok.text,
        inQuotes: quoteDepth > 0,
        quoteDepth,
        isItalic: false,
        isBold: false,
        isParagraphEnd: i === tokens.length - 1,
      });
    }
  }

  return words;
}

/**
 * Apostrophe characters that appear between two letters are contractions
 * (don't, it's, O'Brien) and never participate in quote tracking.
 */
const APOSTROPHE_BETWEEN_LETTERS = /(?<=\p{L})['‘’](?=\p{L})/gu;

/**
 * Walk a paragraph string and emit token objects:
 *   { text, events: Array<{kind, indexInToken}> }
 * where `events` lists every quote mark in the token with its classification
 * computed from the surrounding chars in the raw string (whitespace before/after,
 * punctuation, letter/digit context). Apostrophes inside contractions are
 * filtered out and produce no events.
 *
 * The `kind` is one of: 'dOpen', 'dClose', 'sOpen', 'sClose', 'ambiguous-d',
 * 'ambiguous-s'. 'ambiguous-*' means the classifier couldn't decide from local
 * context and the stack-aware resolver will decide at processing time.
 */
function tokenizeParagraph(paragraph) {
  const tokens = [];
  let current = null;

  for (let i = 0; i < paragraph.length; i++) {
    const ch = paragraph[i];
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = null;
      }
      continue;
    }

    if (!current) current = { text: '', events: [] };
    const indexInToken = current.text.length;
    current.text += ch;

    const kind = classifyQuoteChar(paragraph, i);
    if (kind) current.events.push({ kind, indexInToken });
  }
  if (current) tokens.push(current);

  // Strip events for apostrophes-between-letters (contractions). The regex
  // operates on the final token text; we just drop any 's*' event whose token-
  // local index sits between two letters.
  for (const tok of tokens) {
    if (tok.events.length === 0) continue;
    if (!/[''‘’]/.test(tok.text)) continue;
    tok.events = tok.events.filter((ev) => {
      const ch = tok.text[ev.indexInToken];
      if (ch !== "'" && ch !== '‘' && ch !== '’') return true;
      const prev = tok.text[ev.indexInToken - 1];
      const next = tok.text[ev.indexInToken + 1];
      const isLetter = (c) => c && /\p{L}/u.test(c);
      // Contraction between letters (don't, O'Brien)
      if (isLetter(prev) && isLetter(next)) return false;
      // Decade/year elision: ' followed by a digit ('90s, '76)
      if (next && /\d/.test(next)) return false;
      return true;
    });
  }

  return tokens;
}

/**
 * Classify a single quote character based on the chars immediately before and
 * after it in the raw paragraph string. Returns null for non-quote chars.
 */
function classifyQuoteChar(s, i) {
  const ch = s[i];

  // Unambiguous curly quotes
  if (ch === '“') return 'dOpen';
  if (ch === '”') return 'dClose';
  if (ch === '‘') return 'sOpen';
  if (ch === '’') return 'sClose';

  if (ch !== '"' && ch !== "'") return null;

  const prev = i > 0 ? s[i - 1] : '';
  const next = i < s.length - 1 ? s[i + 1] : '';

  const opensLeft  = !prev || /[\s(\[{“‘"']/.test(prev);
  const closesRight = !next || /[\s.,!?;:)\]}”’]/.test(next);
  const wordLeft  = /[\p{L}\p{N}]/u.test(prev || '');
  const wordRight = /[\p{L}\p{N}]/u.test(next || '');

  const baseKind = ch === '"' ? 'd' : 's';

  // Strong open: whitespace/bracket before, word char after
  if (opensLeft && wordRight) return baseKind + 'Open';
  // Strong close: word/punct before, whitespace/punct after
  if ((wordLeft || /[.,!?;:)\]}]/.test(prev)) && closesRight) return baseKind + 'Close';
  // Open at start of string with no clear right-hand signal
  if (!prev) return baseKind + 'Open';
  // Close at end of string with no clear left-hand signal
  if (!next) return baseKind + 'Close';

  // Both sides look "wordy" or otherwise ambiguous — defer to the stack
  return 'ambiguous-' + baseKind;
}

/**
 * Apply a token's quote events to the stack and return the max depth the word
 * passed through (so the opening word of a quote is considered "inside" it).
 */
function processWordQuoteEvents(tok, quoteState) {
  let maxDepth = quoteState.stack.length;
  // If the token starts inside a quote, that's the baseline depth.
  const startedInside = quoteState.stack.length > 0;
  if (startedInside) maxDepth = Math.max(maxDepth, quoteState.stack.length);

  for (const ev of tok.events) {
    let kind = ev.kind;
    if (kind === 'ambiguous-d' || kind === 'ambiguous-s') {
      const type = kind === 'ambiguous-d' ? 'double' : 'single';
      const top = quoteState.stack[quoteState.stack.length - 1];
      kind = (top === type) ? (type === 'double' ? 'dClose' : 'sClose')
                            : (type === 'double' ? 'dOpen'  : 'sOpen');
    }

    if (kind === 'dOpen') {
      quoteState.stack.push('double');
      maxDepth = Math.max(maxDepth, quoteState.stack.length);
    } else if (kind === 'sOpen') {
      quoteState.stack.push('single');
      maxDepth = Math.max(maxDepth, quoteState.stack.length);
    } else if (kind === 'dClose') {
      const top = quoteState.stack[quoteState.stack.length - 1];
      if (top === 'double') quoteState.stack.pop();
      // mismatched close: ignore
    } else if (kind === 'sClose') {
      const top = quoteState.stack[quoteState.stack.length - 1];
      if (top === 'single') quoteState.stack.pop();
      // mismatched close: ignore
    }
  }

  return maxDepth;
}

/**
 * Before processing a new paragraph, decide whether to carry the open quote
 * stack from the previous paragraph into this one.
 *
 * Rule: carry only if the new paragraph's first non-space char matches the
 * type currently on top of the stack. (English convention: a continuing
 * multi-paragraph speech repeats the opening mark at each paragraph start.)
 * Otherwise force-close everything to prevent runaway highlighting.
 */
function maybeCarryQuoteAcrossParagraph(quoteState, trimmedParagraph) {
  if (quoteState.stack.length === 0) return;
  const first = trimmedParagraph[0];
  const top = quoteState.stack[quoteState.stack.length - 1];
  const matches =
    (top === 'double' && (first === '"' || first === '“')) ||
    (top === 'single' && (first === "'" || first === '‘'));
  if (matches) {
    // The leading mark is a continuation marker (English convention for
    // multi-paragraph speech). Pop now — the classifier will see it as an
    // open and re-push it, leaving the depth unchanged.
    quoteState.stack.pop();
  } else {
    // No continuation signal — clear the stack so an orphan/unclosed quote
    // doesn't cascade into unrelated narration.
    quoteState.stack = [];
  }
}

/**
 * Process a single raw word for quote tracking using the shared classifier.
 * Used by parseRichText where text arrives pre-segmented and whitespace context
 * has already been lost — we still want depth tracking, but the ambiguous-
 * straight-quote resolution falls back to stack-state alone.
 *
 * @returns {number} the word's quote depth (0 = narration)
 */
function trackQuotesForWord(rawWord, quoteState) {
  const cleaned = rawWord.replace(APOSTROPHE_BETWEEN_LETTERS, '');
  let maxDepth = quoteState.stack.length;

  for (let i = 0; i < cleaned.length; i++) {
    // Build a tiny pseudo-context: pad with spaces so start/end-of-word looks
    // like whitespace boundaries to the classifier.
    const padded = ' ' + cleaned + ' ';
    let kind = classifyQuoteChar(padded, i + 1);
    if (!kind) continue;

    if (kind === 'ambiguous-d' || kind === 'ambiguous-s') {
      const type = kind === 'ambiguous-d' ? 'double' : 'single';
      const top = quoteState.stack[quoteState.stack.length - 1];
      kind = (top === type) ? (type === 'double' ? 'dClose' : 'sClose')
                            : (type === 'double' ? 'dOpen'  : 'sOpen');
    }

    if (kind === 'dOpen') {
      quoteState.stack.push('double');
      maxDepth = Math.max(maxDepth, quoteState.stack.length);
    } else if (kind === 'sOpen') {
      quoteState.stack.push('single');
      maxDepth = Math.max(maxDepth, quoteState.stack.length);
    } else if (kind === 'dClose') {
      if (quoteState.stack[quoteState.stack.length - 1] === 'double') quoteState.stack.pop();
    } else if (kind === 'sClose') {
      if (quoteState.stack[quoteState.stack.length - 1] === 'single') quoteState.stack.pop();
    }
  }

  return maxDepth;
}

/**
 * Parse rich text segments (with italic/bold metadata) into word objects.
 * Each segment is split on whitespace; every resulting word inherits its
 * segment's italic/bold flags. Quote tracking spans the whole stream.
 *
 * @param {Array<{text: string, isItalic: boolean, isBold: boolean, isParagraphEnd?: boolean}>} segments
 * @returns {Array<{text: string, inQuotes: boolean, quoteDepth: number, isItalic: boolean, isBold: boolean, isParagraphEnd: boolean}>}
 */
export function parseRichText(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return [];

  const words = [];
  const quoteState = { stack: [] };

  for (const seg of segments) {
    if (!seg || !seg.text) continue;
    const parts = seg.text.split(/\s+/).filter(w => w.length > 0);
    for (let i = 0; i < parts.length; i++) {
      const rawWord = parts[i];
      const quoteDepth = trackQuotesForWord(rawWord, quoteState);
      const isLastOfSegment = (i === parts.length - 1);
      words.push({
        text: rawWord,
        inQuotes: quoteDepth > 0,
        quoteDepth,
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
