import test from "node:test";
import assert from "node:assert/strict";
import {
  assertUniqueCurriculumIds,
  buildDynamicCurriculumLesson,
  createRegistryLessonId,
  CURRICULUM_VERSION,
} from "./identity";
import { loadCurriculum } from "./index";
import { curriculumDbService } from "../services/curriculumDbService";

const generatedLesson = {
  lessonName: "Chemical Reactions",
  unit: "Chemical Reactions",
  concepts: [
    {
      id: "concept-01",
      name: "Reactants and Products",
      weight: 5,
      isFrequentlyTested: true,
      category: "definition",
      keywords: ["reactant", "product"],
    },
    {
      id: "concept-02",
      name: "Conservation of Mass",
      weight: 4,
      isFrequentlyTested: true,
      category: "law",
      keywords: ["mass is conserved"],
    },
  ],
  learningOutcomes: [
    {
      id: "lo-01",
      description: "Explain reactants, products, and conservation of mass",
      requiredConcepts: ["concept-01", "concept-02"],
    },
  ],
  definitions: [
    {
      term: "Reactant",
      definition: "A starting substance in a chemical reaction",
      conceptId: "concept-01",
    },
  ],
  matchingKeywords: ["chemical reaction"],
};

test("registry lesson IDs remain backward compatible", () => {
  assert.equal(
    createRegistryLessonId("Science", 10, "Chemical Basis of Life"),
    "sci-g10-chemical-basis-of-life"
  );
});

test("dynamic lessons receive deterministic server-owned IDs", () => {
  const input = {
    subject: "Science",
    grade: 10,
    topic: "Chemical Reactions",
    textbookReference: "Science Grade 10",
    generated: generatedLesson,
  };
  const first = buildDynamicCurriculumLesson(input);
  const second = buildDynamicCurriculumLesson(input);

  assert.ok(first);
  assert.deepEqual(first, second);
  assert.equal(first.curriculumVersion, CURRICULUM_VERSION);
  assert.match(first.lessonId, /^db-science-g10-chemical-reactions-[a-f0-9]{8}$/);
  assert.ok(first.concepts.every((concept) => !concept.id.startsWith("concept-")));
  assert.deepEqual(
    first.learningOutcomes[0].requiredConcepts,
    first.concepts.map((concept) => concept.id)
  );
  assert.equal(first.definitions[0].conceptId, first.concepts[0].id);
});

test("global identity validation rejects duplicate lessons and concepts", () => {
  const lesson = buildDynamicCurriculumLesson({
    subject: "Science",
    grade: 10,
    topic: "Chemical Reactions",
    generated: generatedLesson,
  });
  assert.ok(lesson);
  assert.throws(
    () => assertUniqueCurriculumIds([lesson, { ...lesson }]),
    /duplicate lesson ID.*duplicate concept ID/s
  );
});

test("loaded curriculum is globally unique and versioned", async () => {
  const curriculum = await loadCurriculum();
  const lessons = Object.values(curriculum.subjects).flatMap((subject) =>
    Object.values(subject.grades).flat()
  );

  assert.equal(curriculum.version, CURRICULUM_VERSION);
  assert.ok(lessons.length > 0);
  assert.ok(
    lessons.every(
      (lesson) => lesson.curriculumVersion === CURRICULUM_VERSION
    )
  );
  assert.doesNotThrow(() => assertUniqueCurriculumIds(lessons));
});

test("TOC lookup does not default an unmatched topic to the first unit", () => {
  assert.equal(
    curriculumDbService.getChapterPageBounds(
      "Science",
      10,
      "Photosynthesis"
    ),
    null
  );
  assert.equal(
    curriculumDbService.getChapterPageBounds(
      "Science",
      11,
      "Photosynthesis"
    )?.unitName,
    "Photosynthesis"
  );
});
