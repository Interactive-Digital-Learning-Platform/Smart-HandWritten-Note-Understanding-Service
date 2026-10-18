// Runs inside the frozen Notes image. Never prints configuration values.
const required = (env, name) => {
  const value = env[name]?.trim();
  if (!value || /<[^>]+>|replace[-_ ]?me|your[-_]|example\.(?:com|org|invalid)/i.test(value)) throw Error(`${name} must be configured`);
  return value;
};
const isLoopback = hostname => ['localhost','127.0.0.1','[::1]'].includes(hostname);

function checkReleaseConfig(env) {
  if (env.NODE_ENV !== 'production') throw Error('NODE_ENV must be production');
  for(const name of ['ENGLISH_COVERAGE_SUGGESTIONS_ENABLED','HISTORY_COVERAGE_REVIEW_ENABLED']) {
    if(env[name]?.trim().toLowerCase() !== 'true') throw Error(`${name} must be true for this release`);
  }
  for(const name of ['ICT_COVERAGE_REVIEW_ENABLED','ANNOTATION_REVIEW_ENABLED','ENGLISH_COVERAGE_REVIEW_ENABLED']) {
    if(env[name]?.trim().toLowerCase() !== 'false') throw Error(`${name} must be false for this release`);
  }
  const mongo = required(env,'MONGODB_URI');
  if(!/^mongodb(?:\+srv)?:\/\//i.test(mongo)) throw Error('MONGODB_URI must use a MongoDB connection scheme');
  const curriculum = required({...env, CURRICULUM_DB_URL:env.CURRICULUM_DB_URL || env.DB_URL},'CURRICULUM_DB_URL');
  if(!/^postgres(?:ql)?(?:\+[a-zA-Z0-9_-]+)?:\/\//i.test(curriculum)) throw Error('CURRICULUM_DB_URL must use a PostgreSQL connection scheme');
  const qdrant = new URL(required(env,'QDRANT_DB_URL'));
  if(!['http:','https:'].includes(qdrant.protocol) || isLoopback(qdrant.hostname)) throw Error('QDRANT_DB_URL must reach Qdrant outside the Notes container; localhost is the Notes container');
  const issuer = new URL(required(env,'CLERK_ISSUER_URL'));
  if(issuer.protocol !== 'https:') throw Error('CLERK_ISSUER_URL must use HTTPS');
  for(const origin of required(env,'CLERK_AUTHORIZED_PARTIES').split(',')) {
    const parsed = new URL(origin.trim());
    if(parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback(parsed.hostname))) throw Error('Frontend origins must use HTTPS, except loopback testing');
  }
  if(env.COVERAGE_BUNDLE_DIR !== '/app/coverage-runtime' || env.COVERAGE_PYTHON !== '/opt/coverage-python/bin/python') throw Error('Use the bundled model and Python paths');
}
module.exports = {checkReleaseConfig};

if(require.main === module) {
  try {
    checkReleaseConfig(process.env);
    require('/app/dist/config/validateConfig').validateRuntimeEnvironment();
    require('/app/dist/middleware/studentAuth').studentAuthConfig();
    const {EnglishCoverageService} = require('/app/dist/services/englishCoverageService');
    const {HistoryCoverageReviewService} = require('/app/dist/services/historyCoverageReviewService');
    const history = new HistoryCoverageReviewService();
    try {
      const scienceCatalog = new EnglishCoverageService().catalog();
      const historyCatalog = history.catalog();
      if(scienceCatalog.concepts.length !== 10 || historyCatalog.concepts.length !== 94) throw Error('Unexpected model catalogs');
      console.log(JSON.stringify({release:'science-history-2026-10-17',configuration:'valid',
        science:{version:'3.1',concepts:10,sha256:scienceCatalog.modelSha256},
        history:{version:'5.1',concepts:94,sha256:historyCatalog.modelSha256},ictEnabled:false}));
    } finally {history.dispose();}
  } catch(error) {console.error('Notes release preflight failed: '+error.message);process.exitCode=1;}
}
