const test = require('node:test');
const assert = require('node:assert/strict');
const {checkReleaseConfig} = require('./check-config.cjs');
const valid = () => ({NODE_ENV:'production',ENGLISH_COVERAGE_SUGGESTIONS_ENABLED:'true',HISTORY_COVERAGE_REVIEW_ENABLED:'true',
  ICT_COVERAGE_REVIEW_ENABLED:'false',ANNOTATION_REVIEW_ENABLED:'false',ENGLISH_COVERAGE_REVIEW_ENABLED:'false',
  MONGODB_URI:'mongodb+srv://user:secret@db.school.edu/notes',CURRICULUM_DB_URL:'postgresql://user:secret@db.school.edu/curriculum',
  QDRANT_DB_URL:'http://qdrant:6333',CLERK_ISSUER_URL:'https://school.clerk.accounts.dev',CLERK_AUTHORIZED_PARTIES:'https://app.school.edu',
  COVERAGE_BUNDLE_DIR:'/app/coverage-runtime',COVERAGE_PYTHON:'/opt/coverage-python/bin/python'});
test('a configured Science/History release and loopback-only test frontend are accepted',()=>{
  assert.doesNotThrow(()=>checkReleaseConfig(valid()));
  assert.doesNotThrow(()=>checkReleaseConfig({...valid(),CURRICULUM_DB_URL:'postgresql+asyncpg://user:secret@db.school.edu/curriculum'}));
  assert.doesNotThrow(()=>checkReleaseConfig({...valid(),CLERK_AUTHORIZED_PARTIES:'http://127.0.0.1:8082,http://localhost:8082'}));
});
test('missing/placeholder settings fail without printing their contents',()=>{
  for(const name of ['MONGODB_URI','CURRICULUM_DB_URL','QDRANT_DB_URL','CLERK_ISSUER_URL','CLERK_AUTHORIZED_PARTIES']) {
    for(const value of ['', 'replace-me', 'https://example.com']) assert.throws(()=>checkReleaseConfig({...valid(),[name]:value}),new RegExp(name));
  }
});
test('other models and research APIs cannot be enabled by this release profile',()=>{
  for(const name of ['ICT_COVERAGE_REVIEW_ENABLED','ANNOTATION_REVIEW_ENABLED','ENGLISH_COVERAGE_REVIEW_ENABLED']) assert.throws(()=>checkReleaseConfig({...valid(),[name]:'true'}),new RegExp(name));
  for(const name of ['ENGLISH_COVERAGE_SUGGESTIONS_ENABLED','HISTORY_COVERAGE_REVIEW_ENABLED']) assert.throws(()=>checkReleaseConfig({...valid(),[name]:'false'}),new RegExp(name));
});
test('container localhost Qdrant and public HTTP frontends fail; private Docker HTTP is supported',()=>{
  for(const host of ['localhost','127.0.0.1','[::1]']) assert.throws(()=>checkReleaseConfig({...valid(),QDRANT_DB_URL:`http://${host}:6333`}),/QDRANT_DB_URL/);
  assert.throws(()=>checkReleaseConfig({...valid(),CLERK_AUTHORIZED_PARTIES:'http://app.school.edu'}),/HTTPS/);
  assert.throws(()=>checkReleaseConfig({...valid(),COVERAGE_BUNDLE_DIR:'C:/training'}),/bundled/);
});
