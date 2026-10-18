'use strict';
const $ = id => document.getElementById(id);
let catalog = [], savedResult = null, busy = false;
let demoExamples = [];
const labels = {present: 'Suggested complete', partial: 'Suggested partial', missing: 'Suggested missing'};
function clearResult() { $('result').hidden = true; savedResult = null; }
function showConcepts(preferred) {
  $('concept').replaceChildren(...catalog.filter(c => String(c.grade) === $('grade').value).map(c => {
    const option = document.createElement('option'); option.value = c.id;
    option.textContent = `${c.lessonId} · ${c.name}`; return option;
  }));
  if (preferred) $('concept').value = preferred;
  showCriteria();
}
function showCriteria() {
  const concept = catalog.find(c => c.id === $('concept').value);
  $('criteria').replaceChildren(...(concept?.points || []).map(p => {
    const li = document.createElement('li'); li.textContent = p.text; return li;
  }));
  $('scope').checked = false; clearResult();
  $('demoExpectation').textContent = '';
}
function setBusy(value, message) {
  busy = value;
  document.querySelectorAll('button,select,textarea,input').forEach(el => {el.disabled = value;});
  $('status').textContent = message;
}
async function api(url, options) {
  const response = await fetch(url, options); const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function element(tag, text) { const el = document.createElement(tag); el.textContent = text; return el; }
function render(result, input) {
  savedResult = {createdAt: new Date().toISOString(), input, result};
  $('verdict').textContent = labels[result.suggestedStatus] || 'Suggestion withheld — review needed';
  $('explanation').textContent = result.suggestionWithheld
    ? 'The model’s prediction has evidence concerns. Check the requirements and passages below before deciding coverage.'
    : result.suggestedStatus === 'missing'
      ? 'The selected concept was not sufficiently supported by the supplied text. OCR omissions can affect this result.'
      : 'Check each required point against the candidate passages below. A retrieved passage does not prove that the point is correct or complete.';
  $('evidence').replaceChildren();
  for (const p of result.evidence.points) {
    const box = element('div', ''); box.className = 'point';
    box.append(element('h3', p.requirement), element('p', 'Semantic candidate passage'), element('blockquote', p.semanticCandidateEvidence));
    if (p.candidateEvidence !== p.semanticCandidateEvidence) box.append(element('p', 'Lexical candidate passage'), element('blockquote', p.candidateEvidence));
    $('evidence').append(box);
  }
  $('concerns').replaceChildren();
  if (result.evidence.concerns.length) {
    $('concerns').append(element('h3', 'Evidence concerns'));
    for (const concern of result.evidence.concerns) {
      $('concerns').append(element('p', concern.reason || concern.kind.replaceAll('_', ' ')), element('blockquote', concern.quote));
    }
  }
  $('result').hidden = false;
}
$('grade').addEventListener('change', () => showConcepts());
$('concept').addEventListener('change', showCriteria);
$('text').addEventListener('input', () => { $('scope').checked = false; $('demoExpectation').textContent = ''; clearResult(); });
$('scope').addEventListener('change', clearResult);
$('loadDemo').addEventListener('click', () => {
  const example = demoExamples.find(e => e.id === $('demo').value);
  if (!example) { $('status').textContent = 'Choose a demo note first.'; return; }
  $('grade').value = example.conceptId.includes('-g10-') ? '10' : '11';
  showConcepts(example.conceptId); $('text').value = example.text;
  const name = {present: 'Complete', partial: 'Partial', missing: 'Missing'}[example.expectedLabel];
  $('demoExpectation').textContent = `AI-expected coverage: ${name}. ${example.rationale}`;
  $('status').textContent = example.inputType === 'simulated_ocr_text'
    ? 'Simulated OCR errors loaded. Try checking this version, then correct its text and compare.'
    : 'Synthetic typed note loaded. Review its text and confirm scope.';
});
document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', () => {
  $('grade').value = '11'; showConcepts('hist-g11-l02-c01');
  const first = 'Sri Lanka was valuable to Britain for its location along Indian Ocean sea routes.';
  const texts = {complete: first + '\nThe port of Trincomalee was strategically important for naval security near India.', partial: first, missing: 'Plants use sunlight to make food during photosynthesis.'};
  $('text').value = texts[button.dataset.sample];
  $('status').textContent = 'Synthetic example loaded. Check the concept and text, then confirm scope.';
}));
$('analyze').addEventListener('click', async () => {
  if (busy) return;
  if (!$('text').value.trim() || !$('scope').checked) { $('status').textContent = 'Enter note text and confirm the selected concept applies.'; return; }
  const input = {text: $('text').value, conceptId: $('concept').value, scopeConfirmed: true};
  clearResult(); setBusy(true, 'Checking locally… The first request loads the model (up to 90 seconds); later requests reuse it.');
  try { const result = await api('/api/predict', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input)}); render(result, input); setBusy(false, 'Preview ready. Review the evidence below.'); }
  catch (error) { setBusy(false, error.message); }
});
$('extract').addEventListener('click', async () => {
  const image = $('image').files[0];
  if (!image || image.size > 8 * 1024 * 1024) { $('status').textContent = 'Choose one PNG or JPEG image up to 8 MB.'; return; }
  const form = new FormData(); form.append('image', image);
  clearResult(); $('scope').checked = false; setBusy(true, 'Extracting with Groq OCR… This may take a minute.');
  try {
    const result = await api('/api/ocr', {method: 'POST', body: form});
    $('text').value = result.text; $('transcription').textContent = result.transcription; $('transcriptionDetails').hidden = false;
    setBusy(false, 'OCR ready. Correct the text, then confirm scope before checking coverage.');
  } catch (error) { setBusy(false, error.message); }
});
$('download').addEventListener('click', () => {
  if (!savedResult) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(savedResult, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'history-preview-result.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
setBusy(true, 'Loading concepts…');
Promise.all([api('/api/catalog'), api('/demo-pack.json')]).then(([data, pack]) => {
  catalog = data.concepts; demoExamples = pack.examples; showConcepts();
  $('demo').append(...demoExamples.map(example => {
    const option = document.createElement('option'); option.value = example.id;
    option.textContent = `${example.id} · ${example.inputType === 'simulated_ocr_text' ? 'simulated OCR errors' : 'typed'}`;
    return option;
  }));
  setBusy(false, 'Ready. Choose a concept and add your English note.');
}).catch(error => setBusy(false, error.message));
