/** Translate known pipeline failures without publishing raw provider details. */
export function processingFailureMessage(message: string): string {
  if (/Note image storage is temporarily unavailable/i.test(message)) {
    return "Your note images are temporarily unavailable. Please try the analysis again later.";
  }
  if (/AI vision service is rate limited/i.test(message)) {
    const minutes=message.match(/Retry after approximately (\d+) minute/i)?.[1];
    const wait=minutes?Math.max(1,Math.min(1440,Number(minutes))):undefined;
    return wait?`The note-reading service is temporarily busy. Try again in about ${wait} minutes.`:
      "The note-reading service is temporarily busy. Please try again later.";
  }
  if (/AI vision service is currently at capacity/i.test(message)) {
    return "The note-reading service is busy right now. Please try again in a few minutes.";
  }
  if (/No readable note text|No active note text remains/i.test(message)) {
    return "We couldn't read usable text from these pages. Try clearer, well-lit photos.";
  }
  return "We could not finish this analysis. Please try again.";
}
