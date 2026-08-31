const filenameAliases: Record<string, string[]> = {
  "grade-10-history-text-book-64017cf286c01.pdf": [
    "histoy grade 10.pdf",
  ],
  "grade-11-science-part-1.pdf": ["science grade 11 part 1.pdf"],
  "grade-11-science-part-2.pdf": ["science grade 11 part 2.pdf"],
  // Preserve the canonical registry name while accepting the filename already
  // stored by the ingestion service (including its historical typo).
  "grade-11-history-text-book.pdf": ["histoy grade 11.pdf"],
};

export interface TextbookStorageSource {
  filename: string;
  /** Added to the canonical PDF page bounds for this stored file. */
  pageOffset: number;
}

const fallbackStorageSources: Record<string, TextbookStorageSource[]> = {
  // The standalone Part 2 ingestion is missing pages 77-151. The already
  // ingested combined Grade 11 book contains byte-equivalent Part 2 chunks at
  // a verified +220 PDF-page offset.
  "grade-11-science-part-2.pdf": [
    {
      filename: "grade-11-science-text-book-6200f72533f2f.pdf",
      pageOffset: 220,
    },
  ],
};

const normalizeFilename = (filename: string): string =>
  filename
    .trim()
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ");

export const getTextbookFilenameCandidates = (
  canonicalFilename: string
): string[] => [
  canonicalFilename,
  ...(filenameAliases[canonicalFilename.toLowerCase()] ?? []),
];

export const getTextbookStorageSources = (
  canonicalFilename: string
): TextbookStorageSource[] => [
  { filename: canonicalFilename, pageOffset: 0 },
  ...(fallbackStorageSources[canonicalFilename.toLowerCase()] ?? []),
];

export const matchesTextbookFilename = (
  ingestedFilename: string,
  canonicalFilename: string
): boolean => {
  const actual = normalizeFilename(ingestedFilename);
  return getTextbookFilenameCandidates(canonicalFilename).some((candidate) =>
    actual.includes(normalizeFilename(candidate))
  );
};
