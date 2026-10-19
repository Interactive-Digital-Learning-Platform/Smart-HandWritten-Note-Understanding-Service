import assert from "node:assert/strict";
import { test, mock, after } from "node:test";
import { validateStudyGuide, validateFlashcards, sourceListVisual } from "./studyMaterialContent";
import { LearningMaterial } from "../models/LearningMaterial";
import { groqPool } from "./groqPool";
import { qdrantService } from "./qdrantService";
import { generateStructuredStudyGuide, generateFlashcards } from "./materialsService";

const markdown = "# Growth\nAn experiment compares seedling growth under two conditions using the supplied measurements.\n\n## Measurements\nRecord the height of each seedling in centimetres.";
const quote = "Seedling A: 10 cm; Seedling B: 20 cm.";
const bar = { type: "bar", title: "Seedling growth", afterHeading: "Measurements", caption: "Compare the recorded heights.", sourceQuote: quote, unit: "cm", data: [{ label: "Seedling A", value: 10 }, { label: "Seedling B", value: 20 }] };

test("a source list can supply a comparison when AI omits visuals, using only original labels and text", () => {
  const source = 'TYPES OF FRICTION\n1. Static friction: acts before motion starts.\n2. Limiting friction: maximum static friction.\n3. Dynamic friction: acts after motion begins.';
  const visuals = sourceListVisual('# Friction\n## 2. Types of friction\nCompare the three types.', source);
  assert.equal(visuals.length,1); assert.equal(visuals[0].items?.[0].detail,'acts before motion starts.');
  assert.ok(source.includes(visuals[0].sourceQuote));
  assert.equal(sourceListVisual('# Other topic\n## Equations\nA different topic.',source).length,0);
  assert.equal(sourceListVisual('# Friction\n## Types of friction\nNo labelled source list.','Some unrelated prose.').length,0);
});

test("keeps source-grounded graphs, correctly pairing each label with its value", () => {
  assert.equal(validateStudyGuide({ markdown, visuals: [bar] }, quote).visuals.length, 1);
  const swapped = { ...bar, data: [{ label: "Seedling A", value: 20 }, { label: "Seedling B", value: 10 }] };
  assert.equal(validateStudyGuide({ markdown, visuals: [swapped] }, quote).visuals.length, 0);
});

test("source comparisons retain the first list item and attach to the concept rather than its graph", () => {
  const source = 'TYPES OF FRICTION\n1. Static friction: adjusts before motion starts.\n2. Limiting friction: the maximum static friction.\n3. Dynamic friction: acts after sliding starts.';
  const visuals = sourceListVisual('# Friction\n## Static, Limiting, and Dynamic Frictional States\nLearn the states.\n## Graph of Frictional Force vs Applied Force\nRead the graph.', source);
  assert.equal(visuals.length,1);
  assert.equal(visuals[0].items?.length,3);
  assert.equal(visuals[0].items?.[0].label,'Static friction');
  assert.equal(visuals[0].afterHeading,'Static, Limiting, and Dynamic Frictional States');
  assert.equal(sourceListVisual('# Friction\n## Graph of Frictional Force vs Applied Force\nRead the graph.',source).length,0);
});
test("charts reject negative observations, mixed units and partial category-name matches", () => {
  for (const evidence of ["Seedling A -10 cm; Seedling B: 20 cm.", "Seedling A: 10 cm; Seedling B: 20 kg.", "NotSeedling A: 10 cm; Seedling B: 20 cm.", "Seedling A: 10 cm/s; Seedling B: 20 cm/s."]) {
    assert.equal(validateStudyGuide({ markdown, visuals: [{ ...bar, sourceQuote: evidence }] }, evidence).visuals.length, 0);
  }
});
test("charts accept equivalent decimal representations without changing their measured values", () => {
  const evidence = "Seedling A: 10.00 cm; Seedling B: 20.0 cm.";
  assert.equal(validateStudyGuide({ markdown, visuals: [{ ...bar, sourceQuote: evidence }] }, evidence).visuals.length, 1);
});
test("guides cannot become empty after sanitization and reference-style images are removed", () => {
  assert.throws(() => validateStudyGuide({ markdown: '<img src="https://example.com/' + 'x'.repeat(150) + '">' }, quote), /readable/);
  assert.throws(() => validateStudyGuide({ markdown: '<!--' + 'x'.repeat(150) + '-->' }, quote), /readable/);
  const result = validateStudyGuide({ markdown: markdown + '\n![picture][remote]\n[remote]: https://example.com/picture.png' }, quote);
  assert.doesNotMatch(result.textContent, /!\[picture\]|https:\/\//);
});
test("normalizing visual headings preserves a diagram attached to a decorated section", () => {
  assert.equal(validateStudyGuide({ markdown: markdown.replace("## Measurements", "## **Measurements**"), visuals: [bar] }, quote).visuals.length, 1);
});
test("empty trailing headings are removed unless they contain a validated visual", () => {
  const empty = validateStudyGuide({markdown:markdown+'\n\n## Visuals',visuals:[]},quote);
  assert.doesNotMatch(empty.textContent,/## Visuals/);
  const illustrated = validateStudyGuide({markdown:markdown+'\n\n## Chart',visuals:[{...bar,afterHeading:'Chart'}]},quote);
  assert.match(illustrated.textContent,/## Chart/); assert.equal(illustrated.visuals.length,1);
});
test("visuals attach to real headings, including deeper sections, never code-fence headings", () => {
  const real = markdown.replace('## Measurements', '#### Measurements');
  assert.equal(validateStudyGuide({markdown:real,visuals:[bar]},quote).visuals.length,1);
  const code = markdown.replace('## Measurements', '```text\n## Measurements') + '\n```';
  assert.equal(validateStudyGuide({markdown:code,visuals:[bar]},quote).visuals.length,0);
});
test("optional hints cannot contain the direct answer and explanations cannot merely duplicate it", () => {
  const cards = validateFlashcards([
    {front:'Which year?',back:'1796',hint:'It happened in 1796.',explanation:'1796'},
    {front:'What is measured?',back:'Height',hint:'Think about size.'},
    {front:'What is compared?',back:'Two seedlings'},
  ]);
  assert.equal(cards[0].hint,undefined);assert.equal(cards[0].explanation,undefined);
  assert.equal(cards[1].hint,'Think about size.');
});
test("omits unsupported charts, fake quotes, wrong headings, unknown visual types and invalid dimensions", () => {
  for (const invalid of [
    { ...bar, sourceQuote: "Invented data: Seedling A: 10 cm; Seedling B: 20 cm." },
    { ...bar, afterHeading: "Missing section" }, { ...bar, unit: "kg" }, { ...bar, type: "html" },
    { ...bar, data: [{ label: "Seedling A", value: -10 }, { label: "Seedling B", value: 20 }] },
    { ...bar, data: [{ label: "Seedling A", value: NaN }, { label: "Seedling B", value: 20 }] },
  ]) assert.equal(validateStudyGuide({ markdown, visuals: [invalid] }, quote).visuals.length, 0);
});
test("supports flows, history timelines and comparisons without requiring numerical data", () => {
  for (const type of ["flow", "timeline", "comparison"]) {
    const visual = { ...bar, type, items: [{ label: "Observe", detail: "Record the first observation." }, { label: "Compare", detail: "Compare the two observations." }] };
    assert.equal(validateStudyGuide({ markdown, visuals: [visual] }, quote).visuals[0].type, type);
  }
  const dated = { ...bar, type: "flow", items: [{ label: "1796", detail: "First event." }, { label: "1815", detail: "Second event." }] };
  assert.equal(validateStudyGuide({ markdown, visuals: [dated] }, quote).visuals[0].type, "timeline");
});
test("legacy text-only guides remain readable; executable/remote image markup is removed", () => {
  const result = validateStudyGuide({ markdown: markdown + '\n![fake](https://example.com/a.png) <script>alert(1)</script> [link](javascript:evil)' }, quote);
  assert.deepEqual(result.visuals, []);
  assert.doesNotMatch(result.textContent, /https:|<script>|javascript:/);
  assert.throws(() => validateStudyGuide({ markdown: "too short" }, quote), /readable/);
});
test("flashcards reject empty, duplicate, huge and malformed entries; optional study aids are bounded", () => {
  const cards = validateFlashcards([
    null, { front: 3, back: "bad" }, { front: "What is growth?", back: "An increase in size.", hint: "Think of size.", kind: "recall", explanation: "Size is compared over time." },
    { front: "WHAT IS GROWTH", back: "Duplicate." }, { front: "x".repeat(241), back: "Too long." },
    { front: "Why measure height?", back: "To compare changes.", kind: "invalid" },
    { front: "What is the unit?", back: "cm" }, { front: "Same", back: "Same" },
  ]);
  assert.equal(cards.length, 3); assert.equal(cards[0].hint, "Think of size."); assert.equal(cards[1].kind, undefined);
  assert.throws(() => validateFlashcards([{ front: "one", back: "two" }]), /Not enough/);
  assert.throws(() => validateFlashcards(cards, "This source does not contain those quotations."), /Not enough/);
});
test("new content persists in the Notes material schema and old front/back cards still validate", async () => {
  const record = new LearningMaterial({ noteId: "507f1f77bcf86cd799439011", userId: "test", type: "structured_notes", textContent: markdown, visuals: [bar], flashcards: [{ front: "Question", back: "Answer" }, { front: "Why?", back: "Reason", kind: "explain", hint: "Clue", explanation: "Because..." }] });
  await record.validate();
  assert.equal(record.toObject().visuals?.[0].data?.[1].value, 20);
  assert.equal(record.toObject().flashcards?.[1].hint, "Clue");
});

let response: unknown = { markdown, visuals: [bar] };
let finishReason = "stop";
const requests: any[] = [], grades: unknown[] = [];
mock.method(qdrantService, "getCurriculumTextbookContext", async (...args: any[]) => { grades.push(args[3]); return { isAvailable: false, passages: [] }; });
mock.method(groqPool, "createChatCompletion", async (request: any) => { requests.push(request); return { choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(response) } }] }; });
after(() => mock.restoreAll());
test("generation uses the requested grade, saves a usable visual, and bounds long note context", async () => {
  const result = await generateStructuredStudyGuide(`${quote}\n${"More observations. ".repeat(1000)}`, "Science", "Growth", "Grade 11");
  assert.equal(grades[grades.length - 1], 11); assert.equal(result.visuals.length, 1);
  const request = requests[requests.length - 2];
  assert.equal(request.response_format.type, "json_object");
  assert.ok(request.messages[1].content.length < 6500);
  assert.match(request.messages[0].content, /never.*invent|Never invent/i);
});
test("flashcards use textbook context and validate the generated deck", async () => {
  response = { cards: [{ front: "What grows?", back: "Seedlings.", kind: "recall", sourceQuote: quote }, { front: "Which unit?", back: "cm", kind: "recall", sourceQuote: quote }, { front: "Why compare?", back: "To see differences.", kind: "explain", sourceQuote: quote }] };
  const cards = await generateFlashcards(quote, "Science", "Growth", "Grade 10");
  assert.equal(cards.length, 3); assert.equal(grades[grades.length - 1], 10);
  assert.match(requests[requests.length - 1].messages[0].content, /strict source-grounding editor/);
  assert.match(requests[requests.length - 1].messages[0].content, /3–8 cards/);
});
test("a truncated AI completion fails before partial content is parsed or saved", async () => {
  finishReason = "length";
  const count = requests.length;
  try {
    await assert.rejects(generateFlashcards(quote,"Science","Growth","Grade 10"), /cut short/);
    assert.equal(requests.length,count+1);
  } finally { finishReason = "stop"; }
});
