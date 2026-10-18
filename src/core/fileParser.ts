/**
 * @file fileParser.ts
 * @description Intelligent client-side file and document parser, image filtering engine,
 * and credential regex parser for ShadowStep.
 * 
 * Supports zero-server client-side text extraction for:
 * - Documents: PDF, DOCX, DOC
 * - Code & Data: TXT, MD, JSON, CSV
 * - Images: PNG, JPG, JPEG, WEBP
 * 
 * Also provides semantic page image filtering for multimodal context injection.
 */

export interface AttachmentItem {
  id: string;
  type: 'image' | 'text' | 'document' | 'crop_selection';
  name: string;
  size?: number;
  previewUrl?: string; // For images and screen crops (Base64 data URL)
  base64?: string; // For multimodal prompt payload injection
  extractedText?: string; // For documents and text files
}

/**
 * Regex parser for credential and ID inputs.
 * Allows entries with or without commas (e.g., 'val1, val2' or 'val1 val2' or multi-line).
 * Cleans, trims, and strips optional commas and extra whitespace.
 */
export function parseCredentialInput(input: string): string[] {
  if (!input) return [];
  return input
    .split(/[,\s]+/)
    .map(item => item.trim().replace(/^,+|,+$/g, ''))
    .filter(item => item.length > 0);
}

/**
 * Synchronized comma-separated parser for index-paired credentials (e.g. Cloudflare Account IDs & API Keys).
 * Preserves strict 1-to-1 array alignment.
 */
export function parseCommaSeparatedList(input: string): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

/**
 * Regex parser for single ID fields (e.g. Cloudflare Account ID).
 * Cleans, trims, and strips commas and extra whitespace.
 */
export function parseSingleIdInput(input: string): string {
  if (!input) return '';
  const parsed = parseCredentialInput(input);
  return parsed[0] || '';
}

/**
 * Helper to decompress raw deflate or zlib stream using Web standard DecompressionStream.
 */
async function decompressDeflate(bytes: Uint8Array, raw: boolean = true): Promise<Uint8Array> {
  const format = raw ? 'deflate-raw' : 'deflate';
  const stream = new DecompressionStream(format);
  const writer = stream.writable.getWriter();
  writer.write(bytes as unknown as BufferSource);
  writer.close();

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalLength += value.length;
    }
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Client-side extraction of text from .docx files (PKZip archive containing word/document.xml).
 */
export async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  try {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let offset = 0;
    let documentXmlBytes: Uint8Array | null = null;
    let compressionMethod = 0;

    // Scan ZIP local file headers (0x04034b50 = 'PK\x03\x04')
    while (offset + 30 < bytes.length) {
      const signature = view.getUint32(offset, true);
      if (signature !== 0x04034b50) {
        // Not a local header, scan forward by 1 byte
        offset++;
        continue;
      }

      compressionMethod = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const filenameLength = view.getUint16(offset + 26, true);
      const extraFieldLength = view.getUint16(offset + 28, true);

      const filenameOffset = offset + 30;
      const filenameBytes = bytes.slice(filenameOffset, filenameOffset + filenameLength);
      const filename = new TextDecoder().decode(filenameBytes);

      const dataOffset = filenameOffset + filenameLength + extraFieldLength;

      if (filename === 'word/document.xml' || filename.endsWith('/document.xml')) {
        documentXmlBytes = bytes.slice(dataOffset, dataOffset + compressedSize);
        break;
      }

      // Advance past this file entry
      offset = dataOffset + compressedSize;
    }

    if (!documentXmlBytes) {
      return "[DOCX: Could not locate word/document.xml in file structure]";
    }

    let xmlText = '';
    if (compressionMethod === 8) {
      // Deflate compressed
      try {
        const decompressed = await decompressDeflate(documentXmlBytes, true);
        xmlText = new TextDecoder('utf-8').decode(decompressed);
      } catch (err: any) {
        // Fallback: try standard deflate
        try {
          const decompressed = await decompressDeflate(documentXmlBytes, false);
          xmlText = new TextDecoder('utf-8').decode(decompressed);
        } catch {
          return "[DOCX: Failed to decompress document payload]";
        }
      }
    } else if (compressionMethod === 0) {
      xmlText = new TextDecoder('utf-8').decode(documentXmlBytes);
    } else {
      return `[DOCX: Unsupported compression method ${compressionMethod}]`;
    }

    // Parse paragraphs (<w:p>) and text (<w:t>)
    const paragraphMatches = xmlText.match(/<w:p(?:\s+[^>]*)?>[\s\S]*?<\/w:p>/g);
    if (!paragraphMatches || paragraphMatches.length === 0) {
      // Fallback: match all text elements directly
      const textMatches = xmlText.match(/<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/g);
      if (textMatches) {
        return textMatches
          .map(t => t.replace(/<[^>]+>/g, ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      return "[DOCX: Empty document content]";
    }

    const paragraphs: string[] = [];
    for (const p of paragraphMatches) {
      const textTags = p.match(/<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/g);
      if (textTags) {
        const pText = textTags
          .map(t => t.replace(/<[^>]+>/g, ''))
          .join('')
          .trim();
        if (pText.length > 0) {
          paragraphs.push(pText);
        }
      }
    }

    return paragraphs.join('\n\n');
  } catch (error: any) {
    return `[DOCX Parsing Error: ${error.message}]`;
  }
}

/**
 * Client-side extraction of text from PDF files.
 * Decompresses FlateDecode content streams and extracts text operators.
 */
export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  try {
    const bytes = new Uint8Array(buffer);
    const fullText = new TextDecoder('latin1').decode(bytes);

    const extractedSegments: string[] = [];

    // 1. Locate stream ... endstream blocks
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match: RegExpExecArray | null;

    while ((match = streamRegex.exec(fullText)) !== null) {
      const streamStart = match.index + match[0].indexOf('\n') + 1;
      const streamLength = match[1].length;
      const rawStreamBytes = bytes.slice(streamStart, streamStart + streamLength);

      // Check preceding dictionary for /FlateDecode
      const precedingDict = fullText.substring(Math.max(0, match.index - 350), match.index);
      const isFlate = /Filter\s*(?:\/\w+)*\s*\/FlateDecode/i.test(precedingDict);

      let decompressedBytes: Uint8Array | null = null;

      if (isFlate) {
        // Attempt deflate decompression
        try {
          // Standard zlib stream decompression
          decompressedBytes = await decompressDeflate(rawStreamBytes, false);
        } catch {
          // Strip 2-byte zlib header (usually 0x78) and try deflate-raw
          try {
            if (rawStreamBytes.length > 6) {
              const stripped = rawStreamBytes.slice(2, rawStreamBytes.length - 4);
              decompressedBytes = await decompressDeflate(stripped, true);
            }
          } catch {
            decompressedBytes = null;
          }
        }
      } else {
        decompressedBytes = rawStreamBytes;
      }

      if (decompressedBytes) {
        const contentStr = new TextDecoder('latin1').decode(decompressedBytes);

        // Extract BT ... ET text blocks
        const btBlocks = contentStr.match(/BT[\s\S]*?ET/g);
        if (btBlocks) {
          for (const block of btBlocks) {
            // Match (string) Tj or ' or "
            const tjMatches = block.match(/\((.*?)\)\s*(?:Tj|'|")/g);
            if (tjMatches) {
              for (const tj of tjMatches) {
                const textMatch = tj.match(/\((.*?)\)/);
                if (textMatch && textMatch[1]) {
                  const cleaned = unescapePdfString(textMatch[1]);
                  if (cleaned.trim()) extractedSegments.push(cleaned);
                }
              }
            }

            // Match [(array)] TJ
            const tjArrayMatches = block.match(/\[(.*?)\]\s*TJ/g);
            if (tjArrayMatches) {
              for (const tjArr of tjArrayMatches) {
                const inner = tjArr.match(/\[(.*?)\]/);
                if (inner && inner[1]) {
                  const subStrings = inner[1].match(/\((.*?)\)/g);
                  if (subStrings) {
                    const line = subStrings
                      .map(s => unescapePdfString(s.slice(1, -1)))
                      .join('');
                    if (line.trim()) extractedSegments.push(line);
                  }
                }
              }
            }
          }
        }
      }
    }

    if (extractedSegments.length > 0) {
      return extractedSegments.join(' ').replace(/\s+/g, ' ').trim();
    }

    // Fallback: extract printable strings from raw text
    const printableMatches = fullText.match(/[\x20-\x7E\t\n\r]{6,}/g);
    if (printableMatches) {
      const filtered = printableMatches.filter(s => 
        !s.startsWith('/') && !s.includes('endobj') && !s.includes('xref') && !s.includes('Trailer')
      );
      if (filtered.length > 0) {
        return filtered.join('\n').substring(0, 8000);
      }
    }

    return "[PDF: Text extraction completed. No readable text found or document is raster-only/scanned]";
  } catch (err: any) {
    return `[PDF Parsing Error: ${err.message}]`;
  }
}

/**
 * Unescape PDF literal strings (octal escapes, parentheses, newlines).
 */
function unescapePdfString(str: string): string {
  return str
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

/**
 * Client-side extraction for legacy binary .doc files.
 */
export async function extractTextFromDoc(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder('latin1').decode(bytes);
  const matches = text.match(/[\x20-\x7E\t\n\r]{5,}/g);
  if (matches && matches.length > 0) {
    return matches.join(' ').replace(/\s+/g, ' ').substring(0, 8000);
  }
  return "[DOC: Binary document format. Minimal ASCII/Unicode extracted]";
}

/**
 * Reads a text file using FileReader.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || '');
    reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
    reader.readAsText(file);
  });
}

/**
 * Reads an image or binary file as Base64 Data URL using FileReader.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || '');
    reader.onerror = () => reject(new Error(`Failed to read file ${file.name} as Data URL`));
    reader.readAsDataURL(file);
  });
}

/**
 * Unified file parser: converts user-uploaded file into an AttachmentItem.
 */
export async function parseFileAttachment(file: File): Promise<AttachmentItem> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const id = `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // 1. Image Files
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext) || file.type.startsWith('image/')) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      id,
      type: 'image',
      name: file.name,
      size: file.size,
      previewUrl: dataUrl,
      base64: dataUrl
    };
  }

  // 2. Plain Text / Code / Structured Data
  if (['txt', 'md', 'json', 'csv'].includes(ext) || file.type === 'text/plain') {
    const rawText = await readFileAsText(file);
    return {
      id,
      type: 'text',
      name: file.name,
      size: file.size,
      extractedText: rawText
    };
  }

  // 3. PDF Documents
  if (ext === 'pdf' || file.type === 'application/pdf') {
    const buffer = await file.arrayBuffer();
    const extractedText = await extractTextFromPdf(buffer);
    return {
      id,
      type: 'document',
      name: file.name,
      size: file.size,
      extractedText
    };
  }

  // 4. DOCX Documents
  if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const buffer = await file.arrayBuffer();
    const extractedText = await extractTextFromDocx(buffer);
    return {
      id,
      type: 'document',
      name: file.name,
      size: file.size,
      extractedText
    };
  }

  // 5. DOC Legacy Documents
  if (ext === 'doc' || file.type === 'application/msword') {
    const buffer = await file.arrayBuffer();
    const extractedText = await extractTextFromDoc(buffer);
    return {
      id,
      type: 'document',
      name: file.name,
      size: file.size,
      extractedText
    };
  }

  // Default fallback for any other text-like document
  try {
    const text = await readFileAsText(file);
    return {
      id,
      type: 'text',
      name: file.name,
      size: file.size,
      extractedText: text
    };
  } catch {
    return {
      id,
      type: 'document',
      name: file.name,
      size: file.size,
      extractedText: `[Unsupported attachment format: ${file.name}]`
    };
  }
}

/**
 * Task 3: Full-Page Image Filtering & Extraction Rules.
 * 
 * Filters out:
 * - Tracking pixels, decorative icons, SVGs under 48x48px, badges, and headers/footers.
 * - Targets only content-relevant <img> or <picture> elements inside main semantic containers
 *   (<main>, <article>, or dominant content containers).
 * - Limits full-page image attachments to a maximum of 3 top-priority images per query.
 */
export async function extractFilteredPageImages(maxCount: number = 3): Promise<{ url: string; base64: string; alt: string }[]> {
  try {
    // 1. Locate main semantic containers
    const semanticSelectors = [
      'main',
      'article',
      '[role="main"]',
      '#main',
      '#content',
      '.main-content',
      '.post-content',
      '.article-body',
      '.entry-content'
    ];

    let container: Element | null = null;
    for (const sel of semanticSelectors) {
      const el = document.querySelector(sel);
      if (el && el.clientHeight > 100) {
        container = el;
        break;
      }
    }

    // Fallback: If no semantic container, select document body
    const searchRoot = container || document.body;

    // 2. Query all img and picture img elements inside the container
    const rawImages = Array.from(searchRoot.querySelectorAll('img, picture img'));

    const candidateImages: {
      el: HTMLImageElement;
      score: number;
      width: number;
      height: number;
      src: string;
      alt: string;
    }[] = [];

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    for (const imgNode of rawImages) {
      const el = imgNode as HTMLImageElement;

      // Ignore if inside shadow root UI
      if (el.closest('#shadowstep-root')) continue;

      // Exclude header, footer, nav, aside, badges, icons
      if (el.closest('header, footer, nav, aside, [role="banner"], [role="contentinfo"], [role="navigation"]')) {
        continue;
      }

      // Check class & ID exclusions
      const classAndId = `${el.className || ''} ${el.id || ''}`.toLowerCase();
      if (/(avatar|icon|badge|logo|tracker|pixel|ad|advert|social|share|thumb-mini|btn)/.test(classAndId)) {
        continue;
      }

      // Check accessibility decorative indicators
      if (el.getAttribute('aria-hidden') === 'true' || el.getAttribute('role') === 'presentation' || el.getAttribute('role') === 'none') {
        continue;
      }

      // Check dimensions (natural or computed)
      const rect = el.getBoundingClientRect();
      const w = el.naturalWidth || rect.width;
      const h = el.naturalHeight || rect.height;

      // Must be at least 48x48px (strictly filter tracking pixels & micro-icons)
      if (w < 48 || h < 48) continue;

      const src = el.currentSrc || el.src;
      if (!src || src.startsWith('data:image/svg')) continue;

      // Filter SVGs under 48x48px
      if (src.endsWith('.svg') && (w < 48 || h < 48)) continue;

      // Compute priority score
      let score = w * h; // larger images usually hold primary content

      // Boost if inside viewport
      if (rect.top >= -100 && rect.bottom <= viewportHeight + 200) {
        score *= 1.5;
      }

      // Boost if it has a meaningful alt text
      const alt = el.getAttribute('alt') || '';
      if (alt.length > 5) {
        score *= 1.2;
      }

      candidateImages.push({
        el,
        score,
        width: w,
        height: h,
        src,
        alt
      });
    }

    // Sort descending by priority score and pick top maxCount (max 3)
    candidateImages.sort((a, b) => b.score - a.score);
    const topCandidates = candidateImages.slice(0, maxCount);

    const results: { url: string; base64: string; alt: string }[] = [];

    for (const cand of topCandidates) {
      const base64 = await convertImageElementToBase64(cand.el, cand.src);
      if (base64) {
        results.push({
          url: cand.src,
          base64,
          alt: cand.alt || 'Page Content Image'
        });
      }
    }

    return results;
  } catch (err) {
    console.warn("[ShadowStep] Page image extraction encountered an error:", err);
    return [];
  }
}

/**
 * Converts an HTMLImageElement to Base64 data URL.
 * Uses canvas rendering with CORS safety and fallback to background service worker fetch.
 */
async function convertImageElementToBase64(imgEl: HTMLImageElement, src: string): Promise<string | null> {
  // If already a base64 data url
  if (src.startsWith('data:image/')) return src;

  // Try direct HTML5 Canvas rendering
  try {
    const canvas = document.createElement('canvas');
    let w = imgEl.naturalWidth || imgEl.clientWidth || 300;
    let h = imgEl.naturalHeight || imgEl.clientHeight || 300;

    // Rescale if excessively large to prevent token and payload bloat
    const maxDim = 800;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(imgEl, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      if (dataUrl && dataUrl.length > 100) return dataUrl;
    }
  } catch {
    // Canvas tainted by CORS, fallback to background worker
  }

  // Fallback: Request background worker with <all_urls> permission to fetch as blob
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const resp: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_BASE64', url: src }, (res) => {
          resolve(res);
        });
      });
      if (resp?.success && resp?.dataUrl) {
        return resp.dataUrl;
      }
    } catch {
      // Background message dropped
    }
  }

  return null;
}
