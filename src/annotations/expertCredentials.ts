import { createHash, timingSafeEqual } from "node:crypto";

export interface ExpertCredential {
  expertId: string;
  accessKey: string;
}

export const parseExpertKeyList = (value: string): ExpertCredential[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf("=");
      if (separator <= 0 || separator === entry.length - 1) {
        throw new Error(
          "EXPERT_ANNOTATION_KEYS entries must use expert-id=access-key"
        );
      }
      return {
        expertId: entry.slice(0, separator).trim(),
        accessKey: entry.slice(separator + 1).trim(),
      };
    });

const digest = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

export const verifyExpertCredential = (
  expertId: string,
  accessKey: string,
  credentials: ExpertCredential[]
): boolean => {
  const credential = credentials.find((candidate) => candidate.expertId === expertId);
  if (!credential || !accessKey) return false;
  return timingSafeEqual(digest(accessKey), digest(credential.accessKey));
};
