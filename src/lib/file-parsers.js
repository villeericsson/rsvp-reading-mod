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
 * Parse an EPUB file and extract its text content
 * @param {File} file - The EPUB file to parse
 * @returns {Promise<{text: string, chapters: Array<{title: string, wordIndex: number}>}>} The extracted text and chapters
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

  let fullText = ''
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
        let text = ''
        // contents can be a Document, string, or XML document
        if (typeof contents === 'string') {
          const doc = new DOMParser().parseFromString(contents, 'text/html')
          text = doc.body?.textContent || ''
        } else if (contents.body) {
          text = contents.body.textContent || ''
        } else if (contents.documentElement) {
          text = contents.documentElement.textContent || ''
        }

        if (text) {
          const normalizedSpineHref = normalizePath(href)

          // Match TOC items that correspond to this spine item's href
          const matchingTocItems = flatToc.filter(t => {
            const normalizedTocHref = normalizePath(t.href)
            return normalizedTocHref === normalizedSpineHref ||
                   normalizedTocHref.endsWith('/' + normalizedSpineHref) ||
                   normalizedSpineHref.endsWith('/' + normalizedTocHref)
          })

          if (matchingTocItems.length > 0) {
            // Count words in fullText up to this point
            const currentWordCount = fullText.trim() === '' ? 0 : fullText.trim().split(/\s+/).filter(w => w.length > 0).length

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

          fullText += text + ' '
        }
      }
    } catch (e) {
      console.warn('Could not load section:', e)
    }
  }

  // Clean up the text
  return {
    text: cleanText(fullText),
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
 * Detect file type and parse accordingly
 * @param {File} file - The file to parse
 * @returns {Promise<{text: string, chapters: Array<{title: string, wordIndex: number}>}>} The extracted text and chapters
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
