import { config } from "../../config/config";
import { groqPool } from "../../services/groqPool";
import { PipelineContext, SubjectDetectionOutput } from "../types";
import { getAllSubjects } from "../../curriculum";
import { curriculumDbService } from "../../services/curriculumDbService";

// ─── Prompt ────────────────────────────────────────────────────────────────

const buildPrompt = (text: string, availableSubjects: string[]): string => `
You are an expert at identifying academic subjects and lesson topics in Sri Lankan G.C.E. O/L student notes.

The available subjects in our curriculum database are:
${availableSubjects.map((s) => `  - ${s}`).join("\n")}

Analyze the following student notes and identify:
1. The academic subject (MUST be one from the list above, e.g. "Science", "Biology", "Chemistry", "Physics", "Geography", "ICT", "Mathematics", etc.)
2. The grade level (10 or 11, or 0 if unclear; infer 10 or 11 if topic is standard O/L syllabus)
3. The specific topic / lesson title being studied. If the notes contain a heading or title (such as "Chemical Basis of life", "Photosynthesis", "The Periodic Table", etc.), use that exact title/topic name (1–6 words).
4. Your confidence in the subject identification (0–100)

STUDENT NOTES:
"""
${text.slice(0, 1500)}
"""

Respond ONLY with this JSON (no markdown, no explanation):
{
  "subject": "Science",
  "grade": 10,
  "topicHint": "Chemical Basis of Life",
  "confidence": 95,
  "rawGradeText": ""
}

Rules:
- subject must match one of the available subjects above, or "Unknown"
- grade: 10, 11, or 0 (infer 10 or 11 based on standard O/L syllabus)
- topicHint: the lesson title or primary topic from the notes (1–6 words)
- confidence: 0–100, how certain you are about the subject and topic
- rawGradeText: the exact text in the notes that indicated the grade (or "")`;

// ─── Stage Runner ──────────────────────────────────────────────────────────

export const runSubjectDetection = async (
  ctx: PipelineContext
): Promise<void> => {
  console.log(`  [Stage 3] Subject Detection...`);

  // Check if user provided subject/grade/topic explicitly on upload
  if (ctx.userSubject || ctx.userTopic) {
    const userGrade = ctx.userGrade && [10, 11].includes(ctx.userGrade) ? ctx.userGrade : 10;
    const userTopic = ctx.userTopic || "Lesson";
    const userSubject = ctx.userSubject || "Science";

    ctx.subjectDetection = {
      subject: userSubject,
      grade: userGrade,
      topicHint: userTopic,
      confidence: 100,
      rawGradeText: `User-specified (Grade ${userGrade})`,
    };

    console.log(
      `  [Stage 3] 🎯 User-specified subject: ${userSubject}, Grade: ${userGrade}, Topic: "${userTopic}" (100% confidence)`
    );
    return;
  }

  const textToAnalyze =
    ctx.ocrCleaning?.cleanedText ?? ctx.rawOcrText ?? "";

  if (!textToAnalyze || textToAnalyze.trim().length < 10) {
    throw new Error("Stage 3 requires cleaned OCR text of at least 10 characters");
  }

  // Get available subjects from DB registry and static KB
  let availableSubjects: string[] = [];
  try {
    const dbSubjects = curriculumDbService.getAllRegisteredSubjects();
    const staticSubjects = getAllSubjects();
    availableSubjects = Array.from(new Set([...dbSubjects, ...staticSubjects, "History", "Science", "Geography", "ICT", "Mathematics", "English"]));
  } catch {
    availableSubjects = ["History", "Science", "Geography", "ICT", "Mathematics", "English", "Biology", "Physics", "Chemistry"];
  }

  let output: SubjectDetectionOutput;

  try {
    const completion = await groqPool.createChatCompletion({
      model: config.groq.model,
      temperature: 0.1,
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: buildPrompt(textToAnalyze, availableSubjects),
        },
      ],
    });

    let raw = completion.choices[0]?.message?.content?.trim() ?? "";
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : stripped;

    const parsed = JSON.parse(jsonStr);

    let subject = "Unknown";
    if (typeof parsed.subject === "string" && parsed.subject.trim()) {
      const match = availableSubjects.find(
        (s) => s.toLowerCase() === parsed.subject.trim().toLowerCase()
      );
      if (match) {
        subject = match;
      }
    }

    // Secondary subject keyword heuristic if subject is still Unknown or misclassified
    const textLower = textToAnalyze.toLowerCase();
    if (
      subject === "Unknown" ||
      (subject === "Geography" && (textLower.includes("king") || textLower.includes("prince") || textLower.includes("political power") || textLower.includes("century b.c") || textLower.includes("inscription") || textLower.includes("parumaka") || textLower.includes("mahavamsa")))
    ) {
      if (textLower.includes("king") || textLower.includes("queen") || textLower.includes("vijaya") || textLower.includes("political power") || textLower.includes("century b.c") || textLower.includes("inscription") || textLower.includes("parumaka") || textLower.includes("history") || textLower.includes("ancient times") || textLower.includes("mahavamsa")) {
        subject = "History";
      }
    }

    const grade =
      typeof parsed.grade === "number" && [10, 11].includes(parsed.grade)
        ? parsed.grade
        : 10;

    output = {
      subject: subject !== "Unknown" ? subject : "Science",
      grade: grade || 10,
      topicHint:
        typeof parsed.topicHint === "string" && parsed.topicHint.trim()
          ? parsed.topicHint.trim()
          : "Unknown Topic",
      confidence:
        typeof parsed.confidence === "number"
          ? Math.min(100, Math.max(0, parsed.confidence))
          : 85,
      rawGradeText:
        typeof parsed.rawGradeText === "string" ? parsed.rawGradeText : "",
    };
  } catch (err) {
    console.warn(
      `  [Stage 3] ⚠️  LLM subject detection failed:`,
      err instanceof Error ? err.message : err
    );
    output = {
      subject: "Science",
      grade: 10,
      topicHint: "Chemical Basis of Life",
      confidence: 50,
      rawGradeText: "",
    };
  }

  ctx.subjectDetection = output;

  console.log(
    `  [Stage 3] ✅ Subject: ${output.subject}, Grade: ${output.grade || "?"}, ` +
      `Topic Hint: "${output.topicHint}", Confidence: ${output.confidence}%`
  );
};
