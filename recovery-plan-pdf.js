const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 46;
const NAVY = rgb(0.09, 0.196, 0.302);
const INK = rgb(0.09, 0.13, 0.16);
const MUTED = rgb(0.32, 0.36, 0.4);
const RULE = rgb(0.85, 0.88, 0.91);
const BOX = rgb(0.18, 0.24, 0.3);
const CONTENT_BOTTOM = 68;

function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? current + ' ' + word : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
      } else {
        let chunk = '';
        String(word).split('').forEach((char) => {
          const trial = chunk + char;
          if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
            chunk = trial;
          } else {
            if (chunk) lines.push(chunk);
            chunk = char;
          }
        });
        current = chunk;
      }
    }
  });
  if (current) lines.push(current);
  return lines;
}

function drawFooter(page, font, date, pageNumber) {
  page.drawLine({
    start: { x: MARGIN, y: 52 },
    end: { x: PAGE_WIDTH - MARGIN, y: 52 },
    thickness: 0.75,
    color: RULE
  });
  page.drawText('Private recovery record', {
    x: MARGIN,
    y: 36,
    size: 9,
    font: font,
    color: MUTED
  });
  const dateLabel = String(date || '');
  const dateWidth = font.widthOfTextAtSize(dateLabel, 9);
  page.drawText(dateLabel, {
    x: (PAGE_WIDTH - dateWidth) / 2,
    y: 36,
    size: 9,
    font: font,
    color: MUTED
  });
  const pageLabel = 'Page ' + pageNumber + ' of 3';
  page.drawText(pageLabel, {
    x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(pageLabel, 9),
    y: 36,
    size: 9,
    font: font,
    color: MUTED
  });
}

function drawHeader(page, bold, font, title) {
  page.drawText('LostPhones', {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN,
    size: 11,
    font: bold,
    color: NAVY
  });
  page.drawText(title, {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN - 26,
    size: 20,
    font: bold,
    color: NAVY
  });
  page.drawLine({
    start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 36 },
    end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - 36 },
    thickness: 1,
    color: RULE
  });
  return PAGE_HEIGHT - MARGIN - 54;
}

function checkbox(page, y, checked) {
  page.drawRectangle({
    x: MARGIN,
    y: y - 2,
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: BOX,
    color: rgb(1, 1, 1)
  });
  if (checked) {
    page.drawLine({
      start: { x: MARGIN + 2, y: y + 2 },
      end: { x: MARGIN + 4.5, y: y - 1 },
      thickness: 1.2,
      color: NAVY
    });
    page.drawLine({
      start: { x: MARGIN + 4.5, y: y - 1 },
      end: { x: MARGIN + 8, y: y + 5 },
      thickness: 1.2,
      color: NAVY
    });
  }
}

function writeLines(page, font, lines, x, y, size, color, leading) {
  let cursor = y;
  lines.forEach((line) => {
    if (cursor < CONTENT_BOTTOM) return;
    page.drawText(line, {
      x: x,
      y: cursor,
      size: size,
      font: font,
      color: color
    });
    cursor -= leading;
  });
  return cursor;
}

function sectionHeading(page, bold, title, y) {
  if (y < CONTENT_BOTTOM + 28) return y;
  page.drawText(title, {
    x: MARGIN,
    y: y,
    size: 13,
    font: bold,
    color: NAVY
  });
  return y - 18;
}

function drawChecklist(page, font, items, y, checked, emptyLabel) {
  const list = items && items.length ? items : [{ title: emptyLabel || 'None recorded.' }];
  let cursor = y;
  list.forEach((item) => {
    const title = typeof item === 'string' ? item : (item.title || '');
    const extra = typeof item === 'string' ? '' : (item.copy || '');
    const lines = wrapText(title, font, 10, PAGE_WIDTH - MARGIN * 2 - 18);
    const extraLines = extra ? wrapText(extra, font, 9, PAGE_WIDTH - MARGIN * 2 - 18) : [];
    const needed = (lines.length + extraLines.length) * 13 + 6;
    if (cursor - needed < CONTENT_BOTTOM) return;
    checkbox(page, cursor, checked && title !== (emptyLabel || 'None recorded.'));
    cursor = writeLines(page, font, lines, MARGIN + 16, cursor, 10, INK, 13);
    if (extraLines.length) {
      cursor = writeLines(page, font, extraLines, MARGIN + 16, cursor, 9, MUTED, 12);
    }
    cursor -= 4;
  });
  return cursor - 8;
}

function drawPlainList(page, font, items, y) {
  let cursor = y;
  items.forEach((item) => {
    const lines = wrapText('•  ' + item, font, 10, PAGE_WIDTH - MARGIN * 2);
    if (cursor - lines.length * 13 < CONTENT_BOTTOM) return;
    cursor = writeLines(page, font, lines, MARGIN, cursor, 10, INK, 13);
    cursor -= 2;
  });
  return cursor - 8;
}

function drawLinks(page, font, links, y) {
  let cursor = y;
  (links || []).forEach((item) => {
    const labelLines = wrapText(item.label, font, 10, PAGE_WIDTH - MARGIN * 2);
    const urlLines = wrapText(item.url, font, 9, PAGE_WIDTH - MARGIN * 2);
    if (cursor - (labelLines.length * 13 + urlLines.length * 12 + 8) < CONTENT_BOTTOM) return;
    cursor = writeLines(page, font, labelLines, MARGIN, cursor, 10, INK, 13);
    cursor = writeLines(page, font, urlLines, MARGIN, cursor, 9, MUTED, 12);
    cursor -= 8;
  });
  return cursor;
}

async function generatePdf(model) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const date = model.summary && model.summary.generatedDate ? model.summary.generatedDate : '';
  const title = (model.cover && model.cover.product) || 'My Complete Recovery and Protection Plan';

  const page1 = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const page2 = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const page3 = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  let y = drawHeader(page1, bold, font, title);
  y = writeLines(page1, font, wrapText((model.cover && model.cover.personalization) || '', font, 11, PAGE_WIDTH - MARGIN * 2), MARGIN, y, 11, INK, 15);
  y -= 6;
  y = sectionHeading(page1, bold, 'Recovery summary', y);
  const summaryLines = [
    'Platform: ' + ((model.summary && model.summary.platform) || 'Not specified'),
    'Situation: ' + ((model.summary && model.summary.situation) || 'Not specified'),
    'Final status: ' + ((model.summary && model.summary.finalStatus) || 'Stabilized'),
    'Generated: ' + date
  ];
  y = drawPlainList(page1, font, summaryLines, y);
  y = sectionHeading(page1, bold, 'Secured actions', y);
  y = drawChecklist(page1, font, model.completed, y, true, 'None recorded.');
  y = sectionHeading(page1, bold, 'Remaining actions', y);
  y = drawChecklist(page1, font, model.remaining, y, false, 'None remaining.');
  y = sectionHeading(page1, bold, 'Waiting or blocked actions', y);
  y = drawChecklist(page1, font, model.blocked, y, false, 'No blocked actions.');
  y = sectionHeading(page1, bold, 'Official service links', y);
  drawLinks(page1, font, model.officialLinks, y);
  drawFooter(page1, font, date, 1);

  y = drawHeader(page2, bold, font, 'Follow-up and preparedness');
  y = sectionHeading(page2, bold, 'Claim and replacement documentation', y);
  y = drawChecklist(page2, font, model.claimsChecklist, y, false);
  y = sectionHeading(page2, bold, 'Offline date fields', y);
  y = drawChecklist(page2, font, model.blankDates, y, false);
  y = sectionHeading(page2, bold, 'Post-recovery security checklist', y);
  y = drawChecklist(page2, font, model.postRecovery, y, false);
  y = sectionHeading(page2, bold, 'Future preparedness checklist', y);
  drawChecklist(page2, font, model.preparedness, y, false);
  drawFooter(page2, font, date, 2);

  y = drawHeader(page3, bold, font, 'Emergency reference');
  y = sectionHeading(page3, bold, 'Safety sequence', y);
  const sequence = (model.emergencyReference || []).slice(0, 6).map((line, index) => (index + 1) + '.  ' + line);
  y = drawPlainList(page3, font, sequence, y);
  y = sectionHeading(page3, bold, 'Official Apple or Google entry points', y);
  y = drawLinks(page3, font, model.officialLinks, y);
  y = sectionHeading(page3, bold, 'Carrier and account-protection order', y);
  y = drawPlainList(page3, font, [
    'Ask the carrier to suspend or replace the mobile line through its official app or website.',
    'Protect the main Apple or Google account before financial apps.',
    'Watch bank and card activity after the line is stable.'
  ], y);
  y = sectionHeading(page3, bold, 'Privacy warning', y);
  y = drawPlainList(page3, font, [
    'Keep this file private. It may describe recovery status.',
    'LostPhones never asks for passwords, codes, or device identifiers.',
    'Do not add email addresses, phone numbers, or free-form incident notes to this record.'
  ], y);
  y = sectionHeading(page3, bold, 'Quick checks', y);
  drawChecklist(page3, font, [
    'I moved to safety before using any recovery service.',
    'I opened the official find-device tool from a trusted device.',
    'I marked the phone lost or locked it when that control was available.',
    'I will keep this private recovery record somewhere safe.'
  ], y, false);
  drawFooter(page3, font, date, 3);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

module.exports = {
  generatePdf
};
