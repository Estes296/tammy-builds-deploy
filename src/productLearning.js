import JSZip from 'jszip';
import { initAnalytics, trackEvent } from './analytics.js';

initAnalytics();
let feedbackChoice = null;

function encodeForm(data) { return new URLSearchParams(data).toString(); }

async function buildSampleDocx() {
  const zip = new JSZip();
  const paragraphs = [
    'SHADOW HARBOR PRODUCTIONS — SAMPLE AGREEMENT',
    'Producer agrees to pay Performer $25,000 for principal photography plus a 10% agency fee.',
    'Payment is due within 15 business days after completion of services.',
    'Producer may use Performer name, image, likeness and voice solely for promotion of the Picture.',
    'Any use of a digital replica, synthetic performance, or AI-generated likeness requires separate written consent.',
    'Either party may terminate for material breach if the breach is not cured within 10 days after written notice.',
    'Travel reimbursement is capped at $2,500 and requires receipts.',
    'The agreement is governed by California law and includes an audit right for compensation records.'
  ];
  const body = paragraphs.map((text) => `<w:p><w:r><w:t>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</w:t></w:r></w:p>`).join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], 'Tammy_Builds_Sample_Agreement.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

async function loadSample() {
  trackEvent('sample_clicked', { mode: 'single' });
  const input = document.querySelector('[data-file="A"]');
  if (!input) return;
  const file = await buildSampleDocx();
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  trackEvent('input_added', { mode: 'single', input_source: 'sample', file_type: 'docx' });
  setTimeout(() => {
    const ack = document.querySelector('#acknowledge');
    if (ack && !ack.checked) { ack.checked = true; ack.dispatchEvent(new Event('change', { bubbles: true })); }
  }, 0);
}

function feedbackMarkup() {
  const copy = feedbackChoice === 'yes' ? 'Thanks — what worked well? You can leave this blank.' : feedbackChoice === 'no' ? 'What were you hoping it would do differently?' : 'Found a problem or have an idea? Tell Tammy what would make this more useful.';
  return `<section class="learning-card no-print" data-learning-feedback><strong>Help improve this tool</strong><p>Your feedback is optional. Your document contents are never included.</p><div class="useful-row"><span>Was this useful?</span><button type="button" data-helpful="yes">Yes</button><button type="button" data-helpful="no">Not really</button><button type="button" class="link-button" data-feedback-kind="suggestion">Report a problem / Suggest an improvement</button></div>${feedbackChoice ? `<form data-feedback-form><input type="hidden" name="feedback_type" value="${feedbackChoice === 'yes' ? 'helpful' : feedbackChoice === 'no' ? 'not_helpful' : 'suggestion'}"><input type="hidden" name="helpful" value="${feedbackChoice === 'yes' ? 'yes' : feedbackChoice === 'no' ? 'no' : ''}"><label>${copy}<textarea name="message" rows="3" maxlength="2000"></textarea></label><label>Email if you want a reply<input name="email" type="email" maxlength="200"></label><button type="submit">Send feedback</button><span data-feedback-status></span></form>` : ''}</section>`;
}

function inject() {
  const upload = document.querySelector('.card.no-print');
  if (upload && !document.querySelector('[data-sample-cta]')) {
    const el = document.createElement('div');
    el.className = 'sample-cta'; el.dataset.sampleCta = 'true';
    el.innerHTML = `<div><strong>No contract handy?</strong><span>Try a sample agreement in seconds to see what the tool finds.</span></div><button type="button" data-load-sample>Try an example</button>`;
    upload.querySelector('.upload-grid')?.insertAdjacentElement('afterend', el);
  }
  const results = document.querySelector('.results');
  if (results && !document.querySelector('[data-learning-feedback]')) results.insertAdjacentHTML('afterend', feedbackMarkup());
}

document.addEventListener('click', async (event) => {
  if (event.target.closest('[data-load-sample]')) { event.preventDefault(); await loadSample(); return; }
  const helpful = event.target.closest('[data-helpful]');
  if (helpful) { feedbackChoice = helpful.dataset.helpful; trackEvent('feedback_prompt_answered', { helpful: feedbackChoice }); document.querySelector('[data-learning-feedback]')?.remove(); inject(); return; }
  if (event.target.closest('[data-feedback-kind]')) { feedbackChoice = 'suggestion'; trackEvent('feedback_form_opened', { feedback_type: 'suggestion' }); document.querySelector('[data-learning-feedback]')?.remove(); inject(); }
}, true);

document.addEventListener('change', (event) => {
  const input = event.target.closest('[data-file]');
  if (!input || !input.files?.length) return;
  const file = input.files[0];
  if (file.name === 'Tammy_Builds_Sample_Agreement.docx') return;
  trackEvent('input_added', { input_source: 'own_file', slot: input.dataset.file, file_type: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx' });
}, true);

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-feedback-form]');
  if (!form) return;
  event.preventDefault();
  const status = form.querySelector('[data-feedback-status]');
  const data = new FormData(form);
  const payload = {'form-name':'tammy-builds-feedback',tool:'contract_budget_inspector',feedback_type:data.get('feedback_type')||'general',helpful:data.get('helpful')||'',message:data.get('message')||'',email:data.get('email')||'',page:window.location.pathname};
  status.textContent='Sending…';
  try {
    const response = await fetch('/', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: encodeForm(payload) });
    if (!response.ok) throw new Error('failed');
    status.textContent='Thank you — feedback sent.';
    trackEvent('feedback_submitted', { feedback_type: payload.feedback_type, helpful: payload.helpful || null, contact_provided:Boolean(payload.email), message_provided:Boolean(payload.message) });
  } catch { status.textContent='Could not send right now. Please try again.'; trackEvent('feedback_submit_failed', { feedback_type: payload.feedback_type }); }
});

new MutationObserver(() => queueMicrotask(inject)).observe(document.body, { childList:true, subtree:true });
inject();
