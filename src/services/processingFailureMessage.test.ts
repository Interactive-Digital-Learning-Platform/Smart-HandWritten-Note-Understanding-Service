import test from "node:test";
import assert from "node:assert/strict";
import {processingFailureMessage} from "./processingFailureMessage";

test("vision quota failures give a bounded retry estimate without provider details",()=>{
  const result=processingFailureMessage('Pipeline failed: The AI vision service is rate limited. Retry after approximately 18 minute(s). Private key gsk_secret');
  assert.match(result,/about 18 minutes/);assert.doesNotMatch(result,/gsk_|Private|Pipeline|Groq/);
  assert.match(processingFailureMessage('The AI vision service is rate limited. Retry after approximately 999999 minute(s).'),/1440 minutes/);
});
test("unreadable text, capacity and unknown errors return safe actionable messages",()=>{
  assert.match(processingFailureMessage('OCR failed: Note image storage is temporarily unavailable. Please try again later.'),/note images are temporarily unavailable/);
  assert.match(processingFailureMessage('No readable note text was found.'),/clearer, well-lit photos/);
  assert.match(processingFailureMessage('The AI vision service is currently at capacity.'),/few minutes/);
  assert.equal(processingFailureMessage('Database failed at private-host password=secret'),'We could not finish this analysis. Please try again.');
});
