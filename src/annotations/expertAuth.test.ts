import assert from "node:assert/strict";
import test from "node:test";
import { parseExpertKeyList, verifyExpertCredential } from "./expertCredentials";

test("expert credentials parse into named reviewer identities", () => {
  assert.deepEqual(parseExpertKeyList("science-1=long-secret, science-2=other"), [
    { expertId: "science-1", accessKey: "long-secret" },
    { expertId: "science-2", accessKey: "other" },
  ]);
  assert.throws(() => parseExpertKeyList("missing-separator"), /expert-id=access-key/);
});

test("expert credential verification binds the key to the reviewer identity", () => {
  const credentials = parseExpertKeyList("science-1=long-secret");
  assert.equal(verifyExpertCredential("science-1", "long-secret", credentials), true);
  assert.equal(verifyExpertCredential("science-1", "wrong", credentials), false);
  assert.equal(verifyExpertCredential("science-2", "long-secret", credentials), false);
});
