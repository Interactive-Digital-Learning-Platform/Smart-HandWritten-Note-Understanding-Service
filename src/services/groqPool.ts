import Groq from "groq-sdk";
import { config } from "../config/config";

export interface GroqExecuteOptions {
  model?: string;
  fallbackModels?: string[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  maxRetriesPerKey?: number;
}

export interface GroqPoolStatus {
  totalKeys: number;
  healthyKeys: number;
  activeModel: string;
  cooldowns: { keyIndex: number; maskedKey: string; cooldownSecondsRemaining: number }[];
}

class GroqPoolManager {
  private clients: { client: Groq; index: number }[] = [];
  private currentIndex = 0;
  private keyCooldowns = new Map<number, number>(); // keyIndex -> cooldownUntil timestamp

  constructor() {
    this.initClients();
  }

  public initClients() {
    const keys =
      config.groq.apiKeys && config.groq.apiKeys.length > 0
        ? config.groq.apiKeys
        : [config.groq.apiKey].filter(Boolean);

    this.clients = keys.map((key, index) => ({
      client: new Groq({ apiKey: key }),
      index,
    }));

    console.log(
      `🔑 [GroqPool] Initialized pool with ${this.clients.length} Groq API key(s) | Default model: ${config.groq.model}`
    );
  }

  public getStatus(): GroqPoolStatus {
    const now = Date.now();
    let healthyCount = 0;
    const cooldowns: { keyIndex: number; maskedKey: string; cooldownSecondsRemaining: number }[] = [];

    this.clients.forEach((c) => {
      const cooldownUntil = this.keyCooldowns.get(c.index) || 0;
      const masked = `key_${c.index + 1}`;
      if (cooldownUntil > now) {
        cooldowns.push({
          keyIndex: c.index + 1,
          maskedKey: masked,
          cooldownSecondsRemaining: Math.ceil((cooldownUntil - now) / 1000),
        });
      } else {
        healthyCount++;
      }
    });

    return {
      totalKeys: this.clients.length,
      healthyKeys: healthyCount,
      activeModel: config.groq.model,
      cooldowns,
    };
  }

  // Gets the next available client.
  public getNextClient(): { client: Groq; keyIndex: number; maskedKey: string } {
    if (this.clients.length === 0) {
      throw new Error("No Groq API keys configured. Set GROQ_API_KEY, GROQ_API_KEY_2, or GROQ_API_KEYS in .env");
    }

    const now = Date.now();
    const count = this.clients.length;

    // First, look for a key that is not cooling down.
    for (let i = 0; i < count; i++) {
      const idx = (this.currentIndex + i) % count;
      const cooldown = this.keyCooldowns.get(idx) || 0;
      if (cooldown <= now) {
        this.currentIndex = (idx + 1) % count;
        const entry = this.clients[idx];
        const masked = `key_${idx + 1}`;
        return { client: entry.client, keyIndex: idx, maskedKey: masked };
      }
    }

    // If all keys are cooling down, use the one ready soonest.
    let earliestIdx = 0;
    let earliestCooldown = Infinity;
    for (let i = 0; i < count; i++) {
      const cooldown = this.keyCooldowns.get(i) || 0;
      if (cooldown < earliestCooldown) {
        earliestCooldown = cooldown;
        earliestIdx = i;
      }
    }

    this.currentIndex = (earliestIdx + 1) % count;
    const entry = this.clients[earliestIdx];
    const masked = `key_${earliestIdx + 1}`;
    return { client: entry.client, keyIndex: earliestIdx, maskedKey: masked };
  }

  // Pauses a key for a short time.
  public markCooldown(keyIndex: number, cooldownMs: number = 25000) {
    this.keyCooldowns.set(keyIndex, Date.now() + cooldownMs);
    const masked = `key_${keyIndex + 1}`;
    console.warn(`⏳ [GroqPool] Marked key #${keyIndex + 1} (${masked}) on cooldown for ${cooldownMs / 1000}s`);
  }

  // Tries available keys and fallback models until the request succeeds.
  public async createChatCompletion(
    params: Parameters<Groq["chat"]["completions"]["create"]>[0],
    options?: { maxRetriesPerKey?: number; timeoutMs?: number; fallbackModels?: string[] }
  ): Promise<Groq.Chat.ChatCompletion> {
    if (this.clients.length === 0) {
      throw new Error("No Groq API keys configured. Set GROQ_API_KEY, GROQ_API_KEY_2, or GROQ_API_KEYS in .env");
    }

    const requestedModel = params.model || config.groq.model;
    const fallbackModels = options?.fallbackModels || [
      "openai/gpt-oss-120b",
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-20b",
    ];

    // Models are tried in this order.
    const modelsToTry = [requestedModel, ...fallbackModels.filter((m) => m !== requestedModel)];
    const totalKeyAttempts = Math.max(this.clients.length * 2, 4);

    // Estimate tokens from the prompt length.
    const promptChars = JSON.stringify(params.messages).length;
    const estimatedPromptTokens = Math.ceil(promptChars / 3.6);
    // Leave room below Groq's 8,000 TPM limit.
    const requestedMaxTokens = params.max_tokens || 2500;
    const safeMaxTokens = Math.max(
      600,
      Math.min(requestedMaxTokens, 7000 - Math.min(estimatedPromptTokens, 6200))
    );

    let lastError: any = null;

    for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
      const currentModel = modelsToTry[mIdx];

      for (let attempt = 0; attempt < totalKeyAttempts; attempt++) {
        const { client, keyIndex, maskedKey } = this.getNextClient();

        try {
          const timeoutMs = options?.timeoutMs || 45000;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const completion = (await client.chat.completions.create(
              {
                ...params,
                model: currentModel,
                max_tokens: safeMaxTokens,
                stream: false,
              },
              { signal: controller.signal }
            )) as Groq.Chat.ChatCompletion;

            clearTimeout(timer);

            const content = completion.choices[0]?.message?.content;
            if (!content || content.trim() === "") {
              throw new Error("Groq returned empty response");
            }

            return completion;
          } catch (callErr: any) {
            clearTimeout(timer);
            throw callErr;
          }
        } catch (err: any) {
          lastError = err;
          const msg = err?.message || String(err);
          const status = err?.status || err?.statusCode;

          const isRateLimit =
            status === 429 ||
            msg.includes("429") ||
            msg.includes("rate_limit_exceeded") ||
            msg.includes("rate limit");

          const isTpmExceeded =
            status === 413 ||
            msg.includes("413") ||
            msg.includes("Request too large") ||
            msg.includes("tokens per minute") ||
            msg.includes("TPM");

          const isOverCapacity =
            status === 503 || msg.includes("over capacity") || msg.includes("service unavailable");

          if (isRateLimit || isTpmExceeded || isOverCapacity) {
            this.markCooldown(keyIndex, isTpmExceeded ? 30000 : 20000);

            if (this.clients.length > 1) {
              console.warn(
                `🔄 [GroqPool] Key #${keyIndex + 1} (${maskedKey}) hit ${
                  isTpmExceeded ? "TPM limit (413)" : "Rate limit (429)"
                }. Immediately failing over to next account key in pool...`
              );
              // Try the next key now.
              continue;
            } else {
              // There is no other key to try.
              if (isTpmExceeded && mIdx < modelsToTry.length - 1) {
                console.warn(
                  `⚠️ [GroqPool] Model ${currentModel} exceeded TPM limit on single key. Switching to high-capacity model: ${modelsToTry[mIdx + 1]}...`
                );
                break; // Break key loop to switch model
              }

              console.warn(`⏳ [GroqPool] Single key rate limited. Waiting 10s before retry...`);
              await new Promise((r) => setTimeout(r, 10000));
            }
          } else if (msg.includes("empty") || msg.includes("model output must contain")) {
            console.warn(`⚠️ [GroqPool] Empty output with ${currentModel} on key #${keyIndex + 1}. Retrying...`);
            await new Promise((r) => setTimeout(r, 1200));
          } else {
            console.error(`❌ [GroqPool] Error on key #${keyIndex + 1} with model ${currentModel}: ${msg}`);
            // Try another model when this one is unavailable.
            if (msg.includes("model_not_found") || msg.includes("decommissioned")) {
              break;
            }
          }
        }
      }
    }

    throw lastError || new Error("All Groq pool keys and fallback models failed");
  }
}

export const groqPool = new GroqPoolManager();
