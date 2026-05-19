/**
 * File parsing utilities for PDF and EPUB files
 */

/**
 * Parse a PDF file and extract its text content
 * @param {File} file - The PDF file to parse
 * @returns {Promise<string>} The extracted text
 */
export async function parsePDF(file) {
  const pdfjsLib = await import('pdfjs-dist')

  // Set up the worker - use unpkg which mirrors npm directly
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  let fullText = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .filter(item => 'str' in item)
      .map(item => /** @type {{ str: string }} */ (item).str)
      .join(' ')
    fullText += pageText + ' '
  }

  // Clean up the text
  return cleanText(fullText)
}

/**
 * Walk a DOM element and produce flat text segments tagged with italic/bold context.
 * @param {Element|Document} element
 * @returns {Array<{text: string, isItalic: boolean, isBold: boolean}>}
 */
function extractRichSegments(element) {
  const segments = []
  const ITALIC_TAGS = new Set(['em', 'i', 'cite', 'dfn', 'var'])
  const BOLD_TAGS = new Set(['strong', 'b'])

  function walk(node, italic, bold) {
    if (!node) return
    if (node.nodeType === 3 /* TEXT_NODE */) {
      const t = node.textContent
      if (t) segments.push({ text: t, isItalic: italic, isBold: bold })
      return
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) return
    const tag = node.tagName?.toLowerCase()
    let childItalic = italic || ITALIC_TAGS.has(tag)
    let childBold = bold || BOLD_TAGS.has(tag)
    const style = node.style
    if (style) {
      if (style.fontStyle === 'italic' || style.fontStyle === 'oblique') childItalic = true
      const fw = style.fontWeight
      if (fw === 'bold' || fw === 'bolder') childBold = true
      const fwNum = parseInt(fw, 10)
      if (!Number.isNaN(fwNum) && fwNum >= 600) childBold = true
    }
    for (const child of node.childNodes) walk(child, childItalic, childBold)
  }

  walk(element, false, false)
  return segments
}

/**
 * Clean segment text without trimming (whitespace boundaries between segments matter).
 */
function cleanSegmentText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/([.!?])\1+/g, '$1')
}

/**
 * Count words present in an array of rich segments.
 */
function countSegmentWords(segments) {
  let total = 0
  for (const s of segments) {
    const parts = s.text.split(/\s+/).filter(w => w.length > 0)
    total += parts.length
  }
  return total
}

/**
 * Parse an EPUB file and extract its text content with rich formatting.
 * @param {File} file - The EPUB file to parse
 * @returns {Promise<{segments: Array<{text: string, isItalic: boolean, isBold: boolean}>, chapters: Array<{title: string, wordIndex: number}>}>}
 */
export async function parseEPUB(file) {
  const ePub = (await import('epubjs')).default

  const arrayBuffer = await file.arrayBuffer()
  const book = ePub(arrayBuffer)

  await book.ready
  await book.loaded.spine

  // Load navigation (TOC)
  try {
    await book.loaded.navigation
  } catch (e) {
    console.warn('Could not load navigation:', e)
  }

  const toc = book.navigation?.toc || []

  // Flatten TOC
  const flatToc = []
  const flatten = (items) => {
    if (!items) return
    for (const item of items) {
      flatToc.push(item)
      if (item.subitems && item.subitems.length) {
        flatten(item.subitems)
      }
    }
  }
  flatten(toc)

  /** @type {Array<{text: string, isItalic: boolean, isBold: boolean}>} */
  const allSegments = []
  const chapters = []

  // Helper to normalize paths for robust comparison
  const normalizePath = (path) => {
    if (!path) return ''
    let clean = path.split('#')[0]
    clean = clean.replace(/^\.?\//, '')
    try {
      clean = decodeURIComponent(clean)
    } catch (e) {}
    return clean.toLowerCase()
  }

  // Get spine items - the API varies between versions
  const spineItems = book.spine?.spineItems || book.spine?.items || []

  for (const item of spineItems) {
    try {
      // Load the section content using the book's load method
      const href = item.href || item.url
      if (!href) continue

      const contents = await book.load(href)
      if (contents) {
        /** @type {Element|null} */
        let root = null
        // contents can be a Document, string, or XML document
        if (typeof contents === 'string') {
          const doc = new DOMParser().parseFromString(contents, 'text/html')
          root = doc.body || doc.documentElement
        } else if (contents.body) {
          root = contents.body
        } else if (contents.documentElement) {
          root = contents.documentElement
        }

        if (root) {
          const rawSegments = extractRichSegments(root)
          /** @type {Array<{text: string, isItalic: boolean, isBold: boolean}>} */
          const cleanedSegments = []
          for (const s of rawSegments) {
            const t = cleanSegmentText(s.text)
            if (t.length > 0) cleanedSegments.push({ text: t, isItalic: s.isItalic, isBold: s.isBold })
          }
          if (cleanedSegments.length === 0) continue

          const normalizedSpineHref = normalizePath(href)

          // Match TOC items that correspond to this spine item's href
          const matchingTocItems = flatToc.filter(t => {
            const normalizedTocHref = normalizePath(t.href)
            return normalizedTocHref === normalizedSpineHref ||
                   normalizedTocHref.endsWith('/' + normalizedSpineHref) ||
                   normalizedSpineHref.endsWith('/' + normalizedTocHref)
          })

          if (matchingTocItems.length > 0) {
            // Count words across allSegments accumulated so far
            const currentWordCount = countSegmentWords(allSegments)

            for (const tocItem of matchingTocItems) {
              const label = tocItem.label?.trim()
              if (label && !chapters.some(c => c.title === label && c.wordIndex === currentWordCount)) {
                chapters.push({
                  title: label,
                  wordIndex: currentWordCount
                })
              }
            }
          }

          allSegments.push(...cleanedSegments)
          // Separator between spine items so adjacent words don't fuse
          allSegments.push({ text: ' ', isItalic: false, isBold: false })
        }
      }
    } catch (e) {
      console.warn('Could not load section:', e)
    }
  }

  return {
    segments: allSegments,
    chapters
  }
}

/**
 * Clean and normalize extracted text
 * @param {string} text - The raw text to clean
 * @returns {string} Cleaned text
 */
function cleanText(text) {
  return text
    // Replace multiple spaces/newlines with single space
    .replace(/\s+/g, ' ')
    // Remove excessive punctuation
    .replace(/([.!?])\1+/g, '$1')
    // Trim
    .trim()
}

/**
 * Detect file type and parse accordingly.
 * EPUB files return rich segments with italic/bold metadata.
 * PDF files return a plain text string.
 * @param {File} file - The file to parse
 * @returns {Promise<{text?: string, segments?: Array<{text: string, isItalic: boolean, isBold: boolean}>, chapters: Array<{title: string, wordIndex: number}>}>}
 */
export async function parseFile(file) {
  const fileName = file.name.toLowerCase()

  if (fileName.endsWith('.pdf')) {
    const text = await parsePDF(file)
    return { text, chapters: [] }
  } else if (fileName.endsWith('.epub')) {
    return parseEPUB(file)
  } else {
    throw new Error(`Unsupported file type: ${fileName}`)
  }
}

/**
 * Get supported file extensions
 * @returns {string} Comma-separated list of supported extensions
 */
export function getSupportedExtensions() {
  return '.pdf,.epub'
}
