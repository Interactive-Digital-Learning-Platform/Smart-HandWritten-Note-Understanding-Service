# Curriculum Knowledge Base

This directory contains the structured curriculum knowledge base for the Sri Lankan G.C.E. O/L syllabus (Grade 10 & 11).

## Directory Structure

```
curriculum/
├── index.ts          # KB loader & query API
├── types.ts          # TypeScript interfaces
├── validator.ts      # JSON schema validation
├── README.md         # This file
└── data/
    ├── biology/
    │   ├── grade10/
    │   │   ├── photosynthesis.json
    │   │   ├── respiration.json
    │   │   └── ecology.json
    │   └── grade11/
    │       └── (add lessons here)
    ├── physics/
    │   ├── grade10/
    │   │   ├── electricity.json
    │   │   └── force-and-motion.json
    │   └── grade11/
    │       └── (add lessons here)
    ├── chemistry/
    │   ├── grade10/
    │   │   ├── periodic-table.json
    │   │   └── chemical-reactions.json
    │   └── grade11/
    │       └── (add lessons here)
    └── mathematics/
        ├── grade10/
        │   ├── algebra.json
        │   └── geometry.json
        └── grade11/
            └── (add lessons here)
```

## Adding New Lessons

To add a new lesson, create a JSON file inside the appropriate `data/<subject>/grade<N>/` directory.

### JSON Schema Template

```json
{
  "lessonId": "<subject-abbreviation>-g<grade>-<topic-slug>",
  "subject": "Subject Name",
  "grade": 10,
  "unit": "Unit or Chapter Name",
  "lessonName": "Lesson Name",
  "textbookReference": "Grade X Subject — Chapter Y, Section Z",
  "matchingKeywords": ["keyword1", "keyword2", "..."],
  "learningOutcomes": [
    {
      "id": "<lessonId>-lo-01",
      "description": "Full learning outcome description",
      "requiredConcepts": ["<concept-id-1>", "<concept-id-2>"]
    }
  ],
  "concepts": [
    {
      "id": "<lessonId>-001",
      "name": "Concept Name",
      "weight": 3,
      "isFrequentlyTested": true,
      "category": "definition",
      "keywords": ["synonym1", "synonym2", "alternative phrasing"],
      "relatedConcepts": ["<other-concept-id>"]
    }
  ],
  "definitions": [
    {
      "term": "Term Name",
      "definition": "Official curriculum definition.",
      "conceptId": "<concept-id>"
    }
  ],
  "formulae": ["Formula 1", "Formula 2"],
  "expectedDiagrams": ["Description of expected diagram"],
  "examKeywords": ["keyword1", "keyword2"]
}
```

### Field Reference

| Field | Required | Description |
|---|---|---|
| `lessonId` | ✅ | Unique ID. Convention: `<subj>-g<grade>-<topic>` |
| `subject` | ✅ | Full subject name (Biology, Physics, Chemistry, Mathematics) |
| `grade` | ✅ | Must be `10` or `11` |
| `unit` | ✅ | Chapter/unit name |
| `lessonName` | ✅ | Lesson display name |
| `matchingKeywords` | ✅ | Keywords used to match student notes to this lesson |
| `learningOutcomes` | ✅ | Array of learning outcomes with required concept IDs |
| `concepts` | ✅ | Array of concepts with weight, keywords, and category |
| `definitions` | ✅ | Array of key term definitions |
| `formulae` | Optional | Important formulae/equations |
| `expectedDiagrams` | Optional | Diagrams students should know |
| `examKeywords` | Optional | Words that appear frequently in exam questions |
| `textbookReference` | Optional | Textbook chapter/section reference |

### Concept Weight Scale

| Weight | Meaning | Example |
|---|---|---|
| **5** | Critical — exam failure if missing | Photosynthesis equation, Ohm's Law |
| **4** | Very important — frequently tested | ATP, Chloroplast structure |
| **3** | Important — standard curriculum | Effect of temperature on reaction rate |
| **2** | Supporting — helps understanding | History of periodic table discovery |
| **1** | Supplementary — nice to know | Leaf colour |

### Concept Categories

| Category | Description |
|---|---|
| `definition` | A term that must be defined |
| `process` | A step-by-step process |
| `formula` | A mathematical equation or chemical formula |
| `diagram` | A visual representation |
| `fact` | A factual statement |
| `law` | A scientific law or principle |
| `calculation` | A numerical calculation method |
| `experiment` | A practical experiment |

### Naming Conventions

- **Lesson IDs**: `bio-g10-photosynthesis`, `phy-g10-electricity`
- **Concept IDs**: `bio-g10-photo-001`, `phy-g10-elec-004`
- **Learning Outcome IDs**: `bio-g10-photo-lo-01`
- **File names**: Lowercase, hyphenated topic slug: `force-and-motion.json`

## Validation

All JSON files are validated at server startup. The validator checks:

- All required fields are present and correctly typed
- Concept IDs are unique within a lesson
- Learning outcome `requiredConcepts` reference valid concept IDs
- Weights are between 1 and 5
- Categories are valid values

Invalid files are skipped with detailed error messages in the console.

## Transitioning to Shared KB

When the shared curriculum KB is ready, swap the data source in `index.ts`:

1. Replace `findJsonFiles(DATA_DIR)` with a MongoDB/API query
2. Keep the same `CurriculumLesson` interface
3. The rest of the system (pipeline, analysis, coverage) works unchanged
