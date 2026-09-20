const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

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
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function addHeading(ctx, title) {
  ensureSpace(ctx, 36);
  ctx.page.drawText(title, {
    x: ctx.margin,
    y: ctx.y,
    size: 14,
    font: ctx.bold,
    color: rgb(0.12, 0.2, 0.3)
  });
  ctx.y -= 22;
}

function addLines(ctx, lines, size, font) {
  const used = font || ctx.font;
  lines.forEach((line) => {
    const wrapped = wrapText(line, used, size, ctx.maxWidth);
    wrapped.forEach((part) => {
      ensureSpace(ctx, 18);
      ctx.page.drawText(part, {
        x: ctx.margin,
        y: ctx.y,
        size: size,
        font: used,
        color: rgb(0.09, 0.13, 0.16)
      });
      ctx.y -= 16;
    });
  });
  ctx.y -= 8;
}

function ensureSpace(ctx, needed) {
  if (ctx.y - needed < ctx.margin) {
    ctx.page = ctx.doc.addPage();
    ctx.y = ctx.page.getSize().height - ctx.margin;
  }
}

async function generatePdf(model) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage();
  const margin = 48;
  const ctx = {
    doc: doc,
    page: page,
    font: font,
    bold: bold,
    margin: margin,
    maxWidth: page.getSize().width - margin * 2,
    y: page.getSize().height - margin
  };

  addLines(ctx, [model.cover.product], 20, bold);
  addLines(ctx, [model.cover.personalization], 11, font);

  addHeading(ctx, 'Summary');
  addLines(ctx, [
    'Platform: ' + model.summary.platform,
    'Situation: ' + model.summary.situation,
    'Final status: ' + model.summary.finalStatus,
    'Generated: ' + model.summary.generatedDate
  ], 11, font);

  addHeading(ctx, 'Completed actions');
  addLines(ctx, model.completed.length ? model.completed.map((item) => item.title) : ['None recorded.'], 11, font);

  addHeading(ctx, 'Remaining actions');
  addLines(ctx, model.remaining.length ? model.remaining.map((item) => item.title) : ['None remaining.'], 11, font);

  addHeading(ctx, 'Blocked actions');
  if (model.blocked.length) {
    model.blocked.forEach((item) => {
      addLines(ctx, [item.title, item.copy], 11, font);
    });
  } else {
    addLines(ctx, ['No blocked actions.'], 11, font);
  }

  addHeading(ctx, 'Official service links');
  addLines(ctx, model.officialLinks.map((item) => item.label + ' — ' + item.url), 10, font);

  addHeading(ctx, 'Claim and replacement documentation');
  addLines(ctx, model.claimsChecklist, 11, font);

  addHeading(ctx, 'Offline date fields');
  addLines(ctx, model.blankDates, 11, font);

  addHeading(ctx, 'Post-recovery security checklist');
  addLines(ctx, model.postRecovery, 11, font);

  addHeading(ctx, 'Future preparedness checklist');
  addLines(ctx, model.preparedness, 11, font);

  ctx.page = ctx.doc.addPage();
  ctx.y = ctx.page.getSize().height - ctx.margin;
  addHeading(ctx, 'Emergency reference');
  addLines(ctx, model.emergencyReference, 11, font);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

module.exports = {
  generatePdf
};
