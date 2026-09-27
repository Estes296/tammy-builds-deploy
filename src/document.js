import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function ext(name) {
  return name.toLowerCase().split('.').pop();
}

function squash(s) {
  return String(s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function extractPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const sections = [];
  let sparsePages = 0;
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    let previousY = null;
    const lines = [];
    let line = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform?.[5] ?? null;
      if (previousY !== null && y !== null && Math.abs(y - previousY) > 4 && line.length) {
        lines.push(line.join(' '));
        line = [];
      }
      line.push(item.str);
      previousY = y;
    }
    if (line.length) lines.push(line.join(' '));
    const text = squash(lines.join('\n'));
    if (text.length < 30) sparsePages += 1;
    sections.push({ ref: `Page ${pageNum}`, text });
  }
  return { name: file.name, type: 'pdf', pageCount: pdf.numPages, scanWarning: sparsePages > Math.max(1, Math.floor(pdf.numPages * 0.15)), sections };
}

function localName(node) { return node.localName || node.nodeName?.split(':').pop() || ''; }
function collectWordText(node, mode = 'normal') {
  if (!node) return '';
  const name = localName(node);
  let nextMode = mode;
  if (name === 'ins') nextMode = 'inserted';
  if (name === 'del') nextMode = 'deleted';
  if (name === 't' || name === 'delText') {
    const text = node.textContent || '';
    if (!text) return '';
    if (nextMode === 'inserted') return `⟦INSERTED: ${text}⟧`;
    if (nextMode === 'deleted') return `⟦DELETED: ${text}⟧`;
    return text;
  }
  if (name === 'tab') return '\t';
  if (name === 'br' || name === 'cr') return '\n';
  let out = '';
  for (const child of node.childNodes || []) out += collectWordText(child, nextMode);
  return out;
}
function childrenByLocal(node, name) { return [...(node?.childNodes || [])].filter((n) => localName(n) === name); }
function descendantsByLocal(node, name) { return [...(node?.getElementsByTagNameNS?.('*', name) || [])]; }
function parseXml(xmlText) { return new DOMParser().parseFromString(xmlText, 'application/xml'); }
async function addAncillaryXml(zip, filename, prefix, sections) {
  const entry = zip.file(filename);
  if (!entry) return;
  const xml = parseXml(await entry.async('text'));
  const paragraphs = descendantsByLocal(xml, 'p');
  let n = 0;
  for (const p of paragraphs) {
    const text = squash(collectWordText(p));
    if (!text) continue;
    n += 1;
    sections.push({ ref: `${prefix} ${n}`, text });
  }
}
async function extractDocx(file) {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) throw new Error('This .docx file does not contain word/document.xml.');
  const xml = parseXml(await documentEntry.async('text'));
  const body = descendantsByLocal(xml, 'body')[0];
  const sections = [];
  let paragraphNo = 0;
  let tableNo = 0;
  for (const child of body?.childNodes || []) {
    const name = localName(child);
    if (name === 'p') {
      const text = squash(collectWordText(child));
      if (!text) continue;
      paragraphNo += 1;
      sections.push({ ref: `Paragraph ${paragraphNo}`, text });
    } else if (name === 'tbl') {
      tableNo += 1;
      const rows = childrenByLocal(child, 'tr');
      rows.forEach((row, rIndex) => {
        const cells = childrenByLocal(row, 'tc');
        cells.forEach((cell, cIndex) => {
          const parts = childrenByLocal(cell, 'p').map((p) => squash(collectWordText(p))).filter(Boolean);
          const text = squash(parts.join(' | '));
          if (text) sections.push({ ref: `Table ${tableNo} R${rIndex + 1}C${cIndex + 1}`, text });
        });
      });
    }
  }
  await addAncillaryXml(zip, 'word/footnotes.xml', 'Footnote', sections);
  await addAncillaryXml(zip, 'word/endnotes.xml', 'Endnote', sections);
  await addAncillaryXml(zip, 'word/comments.xml', 'Comment', sections);
  const headerFiles = Object.keys(zip.files).filter((name) => /^word\/header\d+\.xml$/i.test(name));
  const footerFiles = Object.keys(zip.files).filter((name) => /^word\/footer\d+\.xml$/i.test(name));
  for (const [i, name] of headerFiles.entries()) await addAncillaryXml(zip, name, `Header ${i + 1}`, sections);
  for (const [i, name] of footerFiles.entries()) await addAncillaryXml(zip, name, `Footer ${i + 1}`, sections);
  const hasTrackedChanges = sections.some((s) => s.text.includes('⟦INSERTED:') || s.text.includes('⟦DELETED:'));
  return { name: file.name, type: 'docx', pageCount: null, scanWarning: false, hasTrackedChanges, sections };
}
export async function extractDocument(file) {
  const extension = ext(file.name);
  if (extension === 'pdf') return extractPdf(file);
  if (extension === 'docx') return extractDocx(file);
  throw new Error('Please use a PDF or .docx Word document.');
}
