/** Synthetic content only. Exercises the real generator without modifying student records. */
import fs from "node:fs";
import path from "node:path";
import { generateStructuredStudyGuide, generateFlashcards } from "../services/materialsService";
import { groqPool } from "../services/groqPool";

const examples = [
  { name: "science", subject: "Science", topic: "Benedict test for reducing sugars", grade: "Grade 10", text: "Add Benedict solution to the food sample. Heat the sample in a hot water bath. A green, yellow, orange or brick-red precipitate indicates reducing sugar. A blue solution with no precipitate is a negative result. Compare colours only after heating under the same conditions." },
  { name: "history", subject: "History", topic: "British rule in Sri Lanka", grade: "Grade 11", text: "In 1796 the British took control of the coastal areas previously held by the Dutch. The Kandyan Convention was signed in 1815. The Uva-Wellassa rebellion took place in 1817–1818. The Colebrooke-Cameron reforms were introduced in 1833. These events changed the administration of Sri Lanka; dates alone do not explain their causes or consequences." },
];

async function main() {
  const output = path.resolve("tmp/study-materials-verification");
  fs.mkdirSync(output, { recursive: true });
  const complete = groqPool.createChatCompletion.bind(groqPool);
  let call = 0;
  groqPool.createChatCompletion = async (...args) => {
    const result = await complete(...args);
    fs.writeFileSync(path.join(output, `response-${++call}.json`), JSON.stringify({ content: result.choices[0]?.message?.content, finish: result.choices[0]?.finish_reason }, null, 2));
    return result;
  };
  for (const sample of examples.filter(item => !process.argv[2] || item.name === process.argv[2])) {
    const started = Date.now();
    try {
      const guide = await generateStructuredStudyGuide(sample.text, sample.subject, sample.topic, sample.grade);
      const cards = await generateFlashcards(sample.text, sample.subject, sample.topic, sample.grade);
      fs.writeFileSync(path.join(output, `${sample.name}.json`), JSON.stringify({ ...sample, guide, cards }, null, 2));
      console.log(JSON.stringify({ subject: sample.name, seconds: Math.round((Date.now() - started) / 1000), words: guide.textContent.split(/\s+/).length, visuals: guide.visuals.map(item => item.type), flashcards: cards.length, kinds: [...new Set(cards.map(card => card.kind))] }));
    } catch (error: any) {
      console.error(JSON.stringify({ subject: sample.name, failed: true, status: error.status, message: String(error.message).replace(/gsk_\w+/g, "[redacted]").slice(0, 160) }));
      process.exitCode = 1;
    }
  }
}
void main();
