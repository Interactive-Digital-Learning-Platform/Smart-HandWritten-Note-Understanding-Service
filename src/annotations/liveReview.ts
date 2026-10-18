import { createHmac } from "node:crypto";
import { ConceptStatus } from "../pipeline/types";
import { redactAnnotationText } from "./contract";

export const RESEARCH_CONSENT_STATUSES = [
  "not_provided",
  "granted",
  "withdrawn",
] as const;

export type ResearchConsentStatus =
  (typeof RESEARCH_CONSENT_STATUSES)[number];

export interface ResearchConsentInput {
  status: ResearchConsentStatus;
  version?: string;
  grantedAt?: Date;
  withdrawnAt?: Date;
}

export interface ExpertConceptReviewInput {
  conceptId: string;
  verdict?: ConceptStatus;
  evidencePage?: number;
  evidenceText?: string;
  reviewerNotes?: string;
}

export interface ExpertSubmissionInput {
  correctedText: string;
  subjectConfirmed: boolean;
  lessonConfirmed: boolean;
  flags: {
    wrongLesson: boolean;
    unreadable: boolean;
    duplicate: boolean;
    containsPersonalData: boolean;
  };
  overallNotes?: string;
  concepts: ExpertConceptReviewInput[];
}

export interface ExpertSubmissionValidation {
  valid: boolean;
  quarantine: boolean;
  errors: string[];
  correctedText: string;
}

const normalizedWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const pageTexts = (value: string): Map<number, string> => {
  const marker = /^--- Page (\d+) ---[ \t]*\r?$/gm;
  const matches = [...value.matchAll(marker)];
  const pages = new Map<number, string>();
  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? value.length;
    pages.set(Number(match[1]), value.slice(start, end));
  });
  return pages;
};

export const parseResearchConsent = (
  value: unknown,
  version: unknown,
  defaultVersion: string
): ResearchConsentInput => {
  const granted =
    value === true ||
    (typeof value === "string" && ["true", "yes", "granted", "1"].includes(
      value.trim().toLowerCase()
    ));
  if (!granted) {
    return { status: "not_provided" };
  }
  const normalizedVersion =
    typeof version === "string" && version.trim()
      ? version.trim()
      : defaultVersion;
  return {
    status: "granted",
    version: normalizedVersion,
    grantedAt: new Date(),
  };
};

export const pseudonymizeResearchIdentifier = (
  namespace: "student" | "note",
  identifier: string,
  secret: string
): string => {
  if (!identifier.trim() || !secret.trim()) {
    throw new Error("identifier and pseudonym secret must be non-empty");
  }
  return `${namespace}-${createHmac("sha256", secret)
    .update(`${namespace}|${identifier}`)
    .digest("hex")
    .slice(0, 24)}`;
};

export const validateExpertSubmission = (
  input: ExpertSubmissionInput,
  expectedConceptIds: string[],
  pageCount: number
): ExpertSubmissionValidation => {
  const errors: string[] = [];
  const correctedText = redactAnnotationText(input.correctedText || "");
  const quarantine = Object.values(input.flags).some(Boolean);
  const pages = pageTexts(correctedText);

  if (!correctedText) {
    errors.push("correctedText is required");
  }
  if (quarantine) {
    if (!input.overallNotes?.trim()) {
      errors.push("overallNotes is required when a quarantine flag is selected");
    }
    return { valid: errors.length === 0, quarantine, errors, correctedText };
  }
  if (!input.subjectConfirmed) {
    errors.push("subject must be confirmed");
  }
  if (!input.lessonConfirmed) {
    errors.push("lesson must be confirmed");
  }

  const expected = new Set(expectedConceptIds);
  const received = new Set<string>();
  for (const review of input.concepts) {
    if (!expected.has(review.conceptId)) {
      errors.push(`unknown conceptId ${review.conceptId}`);
      continue;
    }
    if (received.has(review.conceptId)) {
      errors.push(`duplicate concept review ${review.conceptId}`);
      continue;
    }
    received.add(review.conceptId);
    if (
      review.verdict !== "present" &&
      review.verdict !== "partial" &&
      review.verdict !== "missing"
    ) {
      errors.push(`${review.conceptId}: verdict is required`);
      continue;
    }
    const evidence = normalizedWhitespace(review.evidenceText || "");
    if (review.verdict === "missing") {
      if (evidence || review.evidencePage !== undefined) {
        errors.push(`${review.conceptId}: missing verdict must not include evidence`);
      }
      continue;
    }
    if (!evidence) {
      errors.push(`${review.conceptId}: evidenceText is required`);
    }
    if (
      !Number.isInteger(review.evidencePage) ||
      (review.evidencePage as number) < 1 ||
      (review.evidencePage as number) > pageCount
    ) {
      errors.push(`${review.conceptId}: evidencePage must be within the note`);
    } else {
      const declaredPage = review.evidencePage as number;
      const pageText = pages.size > 0
        ? pages.get(declaredPage)
        : pageCount === 1
          ? correctedText
          : undefined;
      if (!pageText) {
        errors.push(
          `${review.conceptId}: correctedText does not contain the declared page marker`
        );
      } else if (!normalizedWhitespace(pageText).includes(evidence)) {
        errors.push(
          `${review.conceptId}: evidenceText must be copied exactly from the declared page`
        );
      }
    }
  }
  for (const conceptId of expected) {
    if (!received.has(conceptId)) {
      errors.push(`${conceptId}: concept review is missing`);
    }
  }

  return { valid: errors.length === 0, quarantine, errors, correctedText };
};
