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

  if (nodeEnv === "production") {
    if (!hasValue(env.MONGODB_URI)) {
      errors.push("MONGODB_URI is required in production");
    }
    if (groqKeys.length === 0) {
      errors.push("at least one GROQ API key is required in production");
    }
  }

  const namedSecrets: Array<[string, string | undefined]> = [
    ["MONGODB_URI", env.MONGODB_URI],
    ["CURRICULUM_DB_URL", env.CURRICULUM_DB_URL || env.DB_URL],
    ["HUGGINGFACE_API_KEY", env.HUGGINGFACE_API_KEY],
    ["ELEVENLABS_API_KEY", env.ELEVENLABS_API_KEY],
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
