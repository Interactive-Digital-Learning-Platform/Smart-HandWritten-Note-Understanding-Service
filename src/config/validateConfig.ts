type Environment = NodeJS.ProcessEnv;

const isPlaceholder = (value: string): boolean =>
  /(^your_|<[^>]+>|change[_-]?me|replace[_-]?me)/i.test(value);

const hasValue = (value: string | undefined): value is string =>
  Boolean(value && value.trim());

/**
 * Validates deployment configuration without logging secret values.
 * Development keeps its local MongoDB fallback, while production fails fast
 * instead of starting with missing or placeholder credentials.
 */
export const validateRuntimeEnvironment = (
  env: Environment = process.env
): void => {
  const errors: string[] = [];
  const nodeEnv = env.NODE_ENV || "development";
  const imageStorage = env.NOTE_IMAGE_STORAGE?.trim() || "local";
  if (!["local", "r2"].includes(imageStorage)) errors.push("NOTE_IMAGE_STORAGE must be local or r2");
  if (imageStorage === "r2") {
    for (const name of ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
      if (!hasValue(env[name])) errors.push(`${name} is required for R2 image storage`);
    }
  }
  // Validate supplied R2 settings even while uploads still use local storage.
  // Older R2 notes can still be read after changing the upload provider to local.
  if (hasValue(env.R2_ENDPOINT)) {
    try {
      const url = new URL(env.R2_ENDPOINT.trim());
      if (url.protocol !== "https:" || !/^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(url.hostname)
        || url.port || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
        errors.push("R2_ENDPOINT must be the HTTPS S3 API endpoint from Cloudflare, without a bucket path or credentials");
      }
    } catch { errors.push("R2_ENDPOINT must be a valid Cloudflare HTTPS S3 endpoint"); }
  }
  if (hasValue(env.R2_BUCKET) && !/^(?!.*\.\.)(?!\d+\.\d+\.\d+\.\d+$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET.trim())) {
    errors.push("R2_BUCKET must be a valid bucket name");
  }
  const collection = env.QDRANT_COLLECTION?.trim();
  if (env.QDRANT_PAYLOAD_PAGE_BASE !== undefined && !["0", "1"].includes(env.QDRANT_PAYLOAD_PAGE_BASE.trim())) {
    errors.push("QDRANT_PAYLOAD_PAGE_BASE must be 0 or 1");
  }
  if (collection === "pdf_knowledge_base") errors.push("QDRANT_COLLECTION must use pdf_knowledge_base_v2; the v1 collection has been retired");
  if (hasValue(env.QDRANT_DB_URL)) {
    try {
      const url = new URL(env.QDRANT_DB_URL.trim());
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        errors.push("QDRANT_DB_URL must be an HTTP(S) endpoint without credentials or query parameters");
      }
      if (url.hostname.endsWith(".qdrant.io")) {
        if (url.protocol !== "https:") errors.push("Qdrant Cloud requires HTTPS");
        if (!hasValue(env.QDRANT_API_KEY)) errors.push("QDRANT_API_KEY is required for Qdrant Cloud");
      }
    } catch { errors.push("QDRANT_DB_URL must be a valid HTTP(S) endpoint"); }
  }
  const groqKeys = [
    env.GROQ_API_KEY,
    env.GROQ_API_KEY_2,
    env.GROQ_API_KEY_3,
    ...(env.GROQ_API_KEYS?.split(",") ?? []),
  ].filter(hasValue);
  const annotationEnabled = env.ANNOTATION_REVIEW_ENABLED?.toLowerCase() === "true";
  const expertAnnotationKeys = (env.EXPERT_ANNOTATION_KEYS || "")
    .split(",")
    .map((entry) => entry.slice(entry.indexOf("=") + 1).trim())
    .filter(Boolean);

  if (nodeEnv === "production") {
    if (!hasValue(env.MONGODB_URI)) {
      errors.push("MONGODB_URI is required in production");
    }
    if (groqKeys.length === 0) {
      errors.push("at least one GROQ API key is required in production");
    }
  }

  if (annotationEnabled) {
    if (!hasValue(env.EXPERT_ANNOTATION_KEYS)) {
      errors.push("EXPERT_ANNOTATION_KEYS is required when annotation review is enabled");
    }
    if (!hasValue(env.ANNOTATION_PSEUDONYM_SECRET)) {
      errors.push(
        "ANNOTATION_PSEUDONYM_SECRET is required when annotation review is enabled"
      );
    }
    const credentials = (env.EXPERT_ANNOTATION_KEYS || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (credentials.some((entry) => !/^[a-zA-Z0-9._-]{3,64}=.{16,}$/.test(entry))) {
      errors.push(
        "EXPERT_ANNOTATION_KEYS must use expert-id=access-key with keys of at least 16 characters"
      );
    }
    if (
      hasValue(env.ANNOTATION_PSEUDONYM_SECRET) &&
      env.ANNOTATION_PSEUDONYM_SECRET.trim().length < 32
    ) {
      errors.push("ANNOTATION_PSEUDONYM_SECRET must be at least 32 characters");
    }
  }

  const namedSecrets: Array<[string, string | undefined]> = [
    ["MONGODB_URI", env.MONGODB_URI],
    ["CURRICULUM_DB_URL", env.CURRICULUM_DB_URL || env.DB_URL],
    ["HUGGINGFACE_API_KEY", env.HUGGINGFACE_API_KEY],
    ["ELEVENLABS_API_KEY", env.ELEVENLABS_API_KEY],
    ["QDRANT_API_KEY", env.QDRANT_API_KEY],
    ["R2_ACCESS_KEY_ID", env.R2_ACCESS_KEY_ID],
    ["R2_SECRET_ACCESS_KEY", env.R2_SECRET_ACCESS_KEY],
    ["ANNOTATION_PSEUDONYM_SECRET", env.ANNOTATION_PSEUDONYM_SECRET],
    ...expertAnnotationKeys.map(
      (value, index) => [`EXPERT_ANNOTATION_KEY[${index}]`, value] as [string, string]
    ),
    ...groqKeys.map((value, index) => [`GROQ_API_KEY[${index}]`, value] as [string, string]),
  ];

  for (const [name, value] of namedSecrets) {
    if (hasValue(value) && isPlaceholder(value.trim())) {
      errors.push(`${name} contains a placeholder value`);
    }
  }

  const curriculumDbUrl = env.CURRICULUM_DB_URL || env.DB_URL;
  if (
    hasValue(curriculumDbUrl) &&
    !/^postgres(?:ql)?(?:\+[a-zA-Z0-9_-]+)?:\/\//i.test(curriculumDbUrl.trim())
  ) {
    errors.push("CURRICULUM_DB_URL must be a PostgreSQL connection URL");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid runtime configuration:\n- ${errors.join("\n- ")}`);
  }
};
