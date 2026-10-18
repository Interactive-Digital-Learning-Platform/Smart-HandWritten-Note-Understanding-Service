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
