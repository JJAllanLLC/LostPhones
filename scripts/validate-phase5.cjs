#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function fail(message) {
  console.error('validate:phase5 failed:', message);
  process.exit(1);
}

const requiredFiles = [
  'index.html',
  'recovery.html',
  'recovery.js',
  'recovery-content.js',
  'preparedness.html',
  'preparedness.js',
  'preparedness-content.js',
  'recovery-plan-success.html',
  'recovery-plan-success.js',
  'recovery-plan-core.js',
  'recovery-plan-pdf.js',
  'v2.css',
  'homepage.css',
  'homepage.js',
  'recovery-shell.css',
  'preparedness-shell.css',
  'scripts/validate-phase5.cjs'
];

for (const rel of requiredFiles) {
  if (!fs.existsSync(path.join(root, rel))) {
    fail('Missing required file: ' + rel);
  }
}

const indexHtml = read('index.html');
const recoveryHtml = read('recovery.html');
const recoveryJs = read('recovery.js');
const recoveryCss = read('v2.css');
const preparednessHtml = read('preparedness.html');
const preparednessJs = read('preparedness.js');
const preparednessContent = read('preparedness-content.js');
const successHtml = read('recovery-plan-success.html');
const successJs = read('recovery-plan-success.js');
const pdfJs = read('recovery-plan-pdf.js');
const core = read('recovery-plan-core.js');

if (!/Lost your phone\?/.test(indexHtml) || !/We'll help you/.test(indexHtml) || !/take the right steps/.test(indexHtml)) {
  fail('Homepage H1 copy is missing.');
}
if (!/Tell us what happened\. We'll guide you through the right next steps, one at a time\. Free, no account required\./.test(indexHtml)) {
  fail('Homepage lede copy is missing.');
}
if (/Get your first recommended step in about 60 seconds/.test(indexHtml)) {
  fail('Rejected 60-second homepage line must not appear.');
}
if (!/Start My Recovery/.test(indexHtml) || !/href="recovery\.html"/.test(indexHtml)) {
  fail('Homepage primary CTA must remain Start My Recovery.');
}
if (!/Protect your phone/.test(indexHtml) || !/Build My Safety Plan/.test(indexHtml)) {
  fail('Homepage preparedness section is missing.');
}
if (!/hp-menu-toggle/.test(indexHtml)) fail('Homepage must use a hamburger menu on small screens.');

if (!/emergency-header/.test(recoveryHtml) || !/Exit recovery/.test(recoveryHtml)) {
  fail('Recovery must use a focused emergency shell with Exit recovery.');
}
if (!/href="privacy\.html">Privacy/.test(recoveryHtml)) fail('Recovery header must keep Privacy access.');
if (/aria-label="Primary"/.test(recoveryHtml) && /Preparedness/.test(recoveryHtml)) {
  fail('Routine site navigation must not appear on recovery screens.');
}
if (!/What best describes the phone\?/.test(recoveryHtml)) fail('Situation legend is missing.');
if (!/What kind of phone is missing\?/.test(recoveryHtml)) fail('Platform legend is missing.');
if (!/What device are you using to access LostPhones right now\?/.test(recoveryHtml)) fail('Current-device legend is missing.');
if (!/<dialog[\s\S]*id="reset-dialog"/.test(recoveryHtml)) fail('Native reset dialog is missing.');
if (!/Continue later/.test(recoveryHtml)) fail('Resume controls must sit behind Continue later.');
if (!/View full recovery plan/.test(recoveryHtml)) fail('Detailed plan disclosure is missing.');
if (!/I could not complete this/.test(recoveryHtml)) fail('Outcome exception disclosure is missing.');
if (!/Print my free summary/.test(recoveryHtml)) fail('Free print control is missing.');
if (!/Emergency recovery is complete/.test(recoveryHtml + recoveryJs)) fail('Completion boundary copy is missing.');
if (!/Protect My Phone for Next Time/.test(recoveryHtml) || !/href="preparedness\.html"/.test(recoveryHtml)) {
  fail('Prevention transition must enter preparedness without restarting from the homepage.');
}
if (!/I[’']m done for now/.test(recoveryHtml)) fail('I’m done for now finish choice is missing.');
if (!/I understand this is still unresolved/.test(recoveryHtml)) fail('Critical-blocker acknowledgment control is missing.');
if (!/renderPlan\(false\)/.test(recoveryJs)) fail('Complete screen must keep the full plan collapsed.');
if (!/criticalBlockerAcknowledged/.test(recoveryJs + recoveryHtml) && !/acknowledgeCriticalBlocker/.test(recoveryJs)) {
  fail('Critical-blocker acknowledgment must persist on recovery state.');
}
if (!/Optional complete recovery PDF/.test(recoveryHtml)) fail('Optional offer title is missing.');
if (!/Download my complete recovery PDF — \$8\.95/.test(recoveryHtml)) fail('Offer CTA is missing.');
if (!/No thanks — continue free/.test(recoveryHtml)) fail('Offer dismiss copy is missing.');
if (!/I am back/.test(recoveryHtml)) fail('Return control I am back is missing.');
if (!/Review erase option/.test(recoveryJs)) fail('Review erase option must remain available.');
if (!/noopener noreferrer/.test(recoveryJs)) fail('Official links must keep noopener noreferrer.');
if (/localStorage|sessionStorage|document\.cookie/.test(recoveryJs + recoveryHtml)) {
  fail('recovery.js/html must not call storage APIs.');
}
if (!/Needs another route/.test(recoveryJs) || !/Not needed/.test(recoveryJs)) {
  fail('Human blocked and not-needed labels are missing.');
}
if (!/EXCEPTION_OUTCOMES/.test(recoveryJs)) fail('Outcome grouping must remain presentation-only in recovery.js.');
if (!/PROGRESS_STAGES/.test(recoveryJs)) fail('Compact progress stages are missing.');
if (!/I’m somewhere safe now/.test(recoveryJs)) fail('Personal safety must use an internal confirmation control.');
if (!/I finished in the official app or site/.test(recoveryJs)) fail('Manual carrier/financial actions need an internal completion control.');
if (!/Protect the account connected to the missing phone/.test(recoveryJs)) fail('Unknown-platform progress copy is missing.');
if (!/Retry later/.test(recoveryJs)) fail('Provider-unavailable tasks must show Retry later.');
if (/officialUrl \|\| record\.supportSourceUrl \|\| '#'/.test(recoveryJs) || /href\s*=\s*['"]#['"]/.test(recoveryJs)) {
  fail('Recovery UI must not use href="#" fake handoffs.');
}

const recoveryShell = read('recovery-shell.css');
if (!/body\.emergency-shell \[hidden\][\s\S]{0,120}display:\s*none\s*!important/.test(recoveryShell)) {
  fail('Hidden recovery content must be globally suppressed.');
}

if (!/#17324[Dd]/.test(recoveryCss) || !/#2[Ee]5[Ff]8[Aa]/.test(recoveryCss)) fail('Visual tokens for navy and interactive blue are missing.');
if (!/#2[Dd]6[Aa]4[Ff]/.test(recoveryCss) || !/#9[Aa]5[Aa]00/.test(recoveryCss) || !/#9[Bb]2[Cc]2[Cc]/.test(recoveryCss)) {
  fail('Status palette tokens are missing.');
}
if (!/prefers-reduced-motion/.test(recoveryCss)) fail('Reduced-motion support is missing.');
if (!/keyboard-open/.test(recoveryCss) || !/dialog-open/.test(recoveryCss)) {
  fail('Sticky CTA must disable when the keyboard or a dialog is open.');
}
if (!/min-height: 48px/.test(recoveryCss) || !/min-height: 44px/.test(recoveryCss)) {
  fail('Touch targets of 44/48px are missing.');
}

if (!/Build a five-minute phone safety plan/.test(preparednessHtml)) fail('Preparedness framing copy is missing.');
if (!/Optional product ideas/.test(preparednessJs)) fail('Recommendations must sit under Optional product ideas.');
if (!/needs_setup/.test(preparednessJs) || !/results-overview/.test(preparednessHtml)) {
  fail('Preparedness overview ordering is missing.');
}
if (!/Ask your carrier whether your phone supports an eSIM/.test(preparednessContent)) {
  fail('Inactive travel copy is missing.');
}

if (!/Payment confirmed/.test(successHtml)) fail('Paid success heading is missing.');
if (!/Protect My Phone for Next Time/.test(successHtml) || !/I[’']m done for now/.test(successHtml)) {
  fail('Paid success page must keep the prevention transition.');
}
if (!/lostphones-recovery-plan\.pdf/.test(successHtml + successJs)) fail('PDF filename cue is missing.');
if (!/Download again/.test(successHtml)) fail('Persistent Download again control is missing.');
if (!/replaceState/.test(successJs) || !/\/api\/recovery-plan-pdf/.test(successJs)) {
  fail('Success page must strip the session id and POST it to the PDF endpoint.');
}

if (!/Prepared for /.test(core) || !/platformArticle/.test(core)) {
  fail('PDF personalization must use the correct platform article.');
}
if (!/Page ' \+ pageNumber \+ ' of 3'|Page ' \+ pageNumber \+ " of 3"|Page X of 3/.test(pdfJs) && !/of 3/.test(pdfJs)) {
  fail('PDF footer must number three intentional pages.');
}
if ((pdfJs.match(/addPage/g) || []).length !== 3) fail('PDF generator must create exactly three pages.');
if (!/Private recovery record/.test(pdfJs)) fail('PDF footer identifier is missing.');
if (!/checkbox/.test(pdfJs)) fail('PDF checkboxes are missing.');

const haystack = [indexHtml, recoveryHtml, recoveryJs, preparednessHtml, successHtml].join('\n');
if (/GoldenRetriever|goldenretriever\.hair/i.test(haystack)) fail('GoldenRetriever.hair must remain untouched.');
if (/buy\.stripe\.com|js\.stripe\.com/i.test(indexHtml + recoveryHtml + preparednessHtml)) {
  fail('Stripe.js must not load on homepage, recovery, or preparedness.');
}
if (/react|next\/|createRoot|tailwind|bootstrap/i.test(haystack + recoveryCss)) {
  fail('Phase 5 must stay static HTML/CSS/JavaScript without a new framework.');
}

const pkg = JSON.parse(read('package.json'));
if (!pkg.scripts['validate:phase5']) fail('validate:phase5 script is missing.');

console.log('validate:phase5 passed');
