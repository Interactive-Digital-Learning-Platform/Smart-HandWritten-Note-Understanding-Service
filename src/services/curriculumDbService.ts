import { Pool, PoolConfig } from "pg";
import { config } from "../config/config";
import { CurriculumConcept, LearningOutcome, CurriculumDefinition } from "../curriculum/types";

export interface CurriculumJob {
  job_id: string;
  user_id: string;
  filename: string;
  minio_object_key: string;
  qdrant_collection: string;
  status: string;
  progress: number;
  current_stage: string | null;
  chunks_created: number | null;
  pages_processed: number | null;
  error_message: string | null;
  started_at: Date;
  completed_at: Date | null;
}

export interface CurriculumTextbookInfo {
  filename: string;
  job_id: string;
  chunks_created: number;
  pages_processed: number;
  status: string;
  completed_at: string | null;
}

export interface CurriculumDbHealth {
  isConnected: boolean;
  totalJobs: number;
  doneJobs: number;
  database: string;
  error?: string;
}

export interface ChapterPageBounds {
  subject: string;
  grade: number;
  unitNumber: number;
  unitName: string;
  bookPageStart: number;
  bookPageEnd: number;
  pdfPageStart: number;
  pdfPageEnd: number;
  pdfOffset: number;
  textbookFilename: string;
  textbookReference: string;
  matchingKeywords: string[];
  concepts?: CurriculumConcept[];
  learningOutcomes?: LearningOutcome[];
  definitions?: CurriculumDefinition[];
  formulae?: string[];
  expectedDiagrams?: string[];
}

/**
 * Table of Contents (TOC) Chapter Boundaries and Granular Concept Taxonomies
 * mapped directly from official Sri Lankan National Science Syllabi & Textbooks.
 */
export const TEXTBOOK_TOC_REGISTRY: ChapterPageBounds[] = [
  // ── Grade 10 Science (Textbook: grade-10-science-text-book-6200ec8f089d4.pdf, PDF offset: 14) ──
  // Official Table of Contents (Part 1, Units 1 to 12)
  {
    subject: "Science",
    grade: 10,
    unitNumber: 1,
    unitName: "Chemical Basis of Life",
    bookPageStart: 1,
    bookPageEnd: 22,
    pdfPageStart: 15,
    pdfPageEnd: 36,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 1: Chemical Basis of Life (Book Pages 1–22 | PDF Pages 15–36)",
    matchingKeywords: [
      "chemical basis of life", "carbohydrates", "proteins", "lipids", "nucleic acids", "water",
      "minerals", "vitamins", "monosaccharides", "disaccharides", "polysaccharides",
      "amino acids", "fatty acids", "glycerol", "nucleotides", "benedict test",
      "biuret test", "iodine test", "sudan iii", "dna", "rna", "lesson 1", "unit 1"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-cbl-lo-01",
        description: "Identify the main elements and distinguish between organic and inorganic compounds in living organisms",
        requiredConcepts: ["sci-g10-cbl-001", "sci-g10-cbl-002", "sci-g10-cbl-003"]
      },
      {
        id: "sci-g10-cbl-lo-02",
        description: "Describe the classification, functions, and identification tests for carbohydrates",
        requiredConcepts: ["sci-g10-cbl-004", "sci-g10-cbl-005", "sci-g10-cbl-006"]
      },
      {
        id: "sci-g10-cbl-lo-03",
        description: "Describe the structure, functions, and identification test (Biuret test) for proteins",
        requiredConcepts: ["sci-g10-cbl-009", "sci-g10-cbl-010", "sci-g10-cbl-011"]
      },
      {
        id: "sci-g10-cbl-lo-04",
        description: "Describe the structure, functions, and identification tests for lipids",
        requiredConcepts: ["sci-g10-cbl-012", "sci-g10-cbl-013", "sci-g10-cbl-014"]
      },
      {
        id: "sci-g10-cbl-lo-05",
        description: "Explain the types (DNA, RNA) and biological significance of nucleic acids",
        requiredConcepts: ["sci-g10-cbl-015", "sci-g10-cbl-016", "sci-g10-cbl-017"]
      },
      {
        id: "sci-g10-cbl-lo-06",
        description: "Explain the physical and biological properties of water that support life",
        requiredConcepts: ["sci-g10-cbl-018", "sci-g10-cbl-019"]
      },
      {
        id: "sci-g10-cbl-lo-07",
        description: "Identify essential minerals, their biological roles, and deficiency symptoms",
        requiredConcepts: ["sci-g10-cbl-020", "sci-g10-cbl-021", "sci-g10-cbl-022"]
      },
      {
        id: "sci-g10-cbl-lo-08",
        description: "Classify vitamins (fat-soluble vs water-soluble) and describe their functions and deficiency diseases",
        requiredConcepts: ["sci-g10-cbl-023", "sci-g10-cbl-024", "sci-g10-cbl-025"]
      }
    ],
    concepts: [
      { id: "sci-g10-cbl-001", name: "Elements in Living Matter", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["elements in living body", "carbon", "hydrogen", "oxygen", "nitrogen", "25 elements", "c – carbon", "c - carbon", "h - hydrogen", "o - oxygen", "n - nitrogen"] },
      { id: "sci-g10-cbl-002", name: "Organic Compounds", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["organic compounds", "contain carbon", "organic & inorganic", "organic and inorganic"] },
      { id: "sci-g10-cbl-003", name: "Inorganic Compounds", weight: 3, isFrequentlyTested: false, category: "definition", keywords: ["inorganic compounds", "do not contain carbon", "without carbon"] },
      { id: "sci-g10-cbl-004", name: "Monosaccharides", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["monosaccharide", "monosaccharides", "glucose", "fructose", "galactose", "simple sugar"] },
      { id: "sci-g10-cbl-005", name: "Disaccharides", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["disaccharide", "disaccharides", "sucrose", "maltose", "lactose", "double sugar"] },
      { id: "sci-g10-cbl-006", name: "Polysaccharides", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["polysaccharide", "polysaccharides", "starch", "glycogen", "cellulose", "polymer of glucose"] },
      { id: "sci-g10-cbl-007", name: "Benedict Test for Reducing Sugars", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["benedict test", "benedict's test", "reducing sugar test", "brick red precipitate", "water bath heating"] },
      { id: "sci-g10-cbl-008", name: "Iodine Test for Starch", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["iodine test", "starch test", "blue black color", "blue-black"] },
      { id: "sci-g10-cbl-009", name: "Amino Acids as Building Blocks of Proteins", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["amino acids", "building block of proteins", "peptide bond", "chons"] },
      { id: "sci-g10-cbl-010", name: "Biological Importance of Proteins", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["functions of protein", "enzymes", "hormones", "antibodies", "hemoglobin", "tissue building"] },
      { id: "sci-g10-cbl-011", name: "Biuret Test for Proteins", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["biuret test", "sodium hydroxide and copper sulfate", "purple color", "violet color"] },
      { id: "sci-g10-cbl-012", name: "Lipid Composition (Fatty Acids and Glycerol)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["lipid composition", "fats and oils", "glycerol", "fatty acids", "triglyceride", "structure of lipids"] },
      { id: "sci-g10-cbl-013", name: "Functions of Lipids", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["energy storage", "thermal insulation", "organ protection", "cell membrane structure"] },
      { id: "sci-g10-cbl-014", name: "Sudan III Test for Lipids", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["sudan iii", "red spot on filter paper", "translucent spot"] },
      { id: "sci-g10-cbl-015", name: "Nucleotides as Units of Nucleic Acids", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["nucleotide", "nucleic acid unit", "nitrogenous base", "pentose sugar", "phosphate group"] },
      { id: "sci-g10-cbl-016", name: "DNA (Deoxyribonucleic Acid)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["dna", "deoxyribonucleic acid", "double helix", "genetic material", "hereditary information"] },
      { id: "sci-g10-cbl-017", name: "RNA (Ribonucleic Acid)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["rna", "ribonucleic acid", "single strand", "protein synthesis"] },
      { id: "sci-g10-cbl-018", name: "Properties of Water Supporting Life", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["universal solvent", "high specific heat capacity", "coolant", "anomalous expansion", "high surface tension"] },
      { id: "sci-g10-cbl-019", name: "Biological Roles of Water", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["medium for biochemical reactions", "transport medium", "homeostasis"] },
      { id: "sci-g10-cbl-020", name: "Calcium (Ca) and Phosphorus (P)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["calcium in diet", "phosphorus in diet", "bones and teeth", "blood clotting", "rickets", "osteoporosis", "calcium deficiency", "phosphorus deficiency"] },
      { id: "sci-g10-cbl-021", name: "Iron (Fe) and Iodine (I)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["iron in diet", "hemoglobin", "anemia", "iodine in diet", "thyroxin", "goitre", "iron deficiency", "iodine deficiency"] },
      { id: "sci-g10-cbl-022", name: "Plant Minerals (N, P, K, Mg)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["nitrogen in plants", "phosphorus in plants", "potassium in plants", "magnesium", "chlorophyll synthesis", "chlorosis"] },
      { id: "sci-g10-cbl-023", name: "Fat-Soluble Vitamins (A, D, E, K)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["fat soluble vitamins", "vitamin a", "vitamin d", "vitamin e", "vitamin k"] },
      { id: "sci-g10-cbl-024", name: "Water-Soluble Vitamins (B Complex, C)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["water soluble vitamins", "vitamin b", "vitamin b complex", "vitamin c", "ascorbic acid"] },
      { id: "sci-g10-cbl-025", name: "Vitamin Deficiency Diseases", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["night blindness", "scurvy", "bleeding gums", "rickets", "beriberi", "vitamin deficiency"] }
    ],
    definitions: [
      { term: "Organic Compound", definition: "Chemical compounds containing carbon naturally found in living organisms (e.g., carbohydrates, proteins, lipids, nucleic acids).", conceptId: "sci-g10-cbl-002" },
      { term: "Monosaccharide", definition: "The simplest form of carbohydrate consisting of a single sugar molecule, such as glucose, fructose, or galactose.", conceptId: "sci-g10-cbl-004" },
      { term: "Amino Acid", definition: "The basic structural building block of proteins, containing carbon, hydrogen, oxygen, nitrogen, and sometimes sulfur.", conceptId: "sci-g10-cbl-009" },
      { term: "Nucleotide", definition: "The repeating structural unit of nucleic acids (DNA and RNA), consisting of a nitrogenous base, a pentose sugar, and a phosphate group.", conceptId: "sci-g10-cbl-015" }
    ],
    formulae: [
      "General formula of Carbohydrates: C_n(H_2O)_n",
      "Glucose molecular formula: C6H12O6",
      "Lipid formation: 1 Glycerol + 3 Fatty Acids → 1 Lipid (Triglyceride) + 3 Water"
    ],
    expectedDiagrams: [
      "Benedict test color change progression (Blue → Green → Yellow → Orange → Brick Red)",
      "Biuret test color change (Blue → Purple/Violet)",
      "DNA double helix structure diagram"
    ]
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 2,
    unitName: "Motion in a Straight Line",
    bookPageStart: 23,
    bookPageEnd: 51,
    pdfPageStart: 37,
    pdfPageEnd: 65,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 2: Motion in a Straight Line (Book Pages 23–51 | PDF Pages 37–65)",
    matchingKeywords: [
      "motion in a straight line", "distance and displacement", "speed", "velocity", "acceleration",
      "displacement - time graphs", "displacement time graphs", "velocity - time graphs", "velocity time graphs",
      "gravitational acceleration", "equations of motion", "lesson 2", "unit 2"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-mot-lo-01",
        description: "Distinguish between scalar and vector quantities, distance and displacement",
        requiredConcepts: ["sci-g10-mot-001", "sci-g10-mot-002"]
      },
      {
        id: "sci-g10-mot-lo-02",
        description: "Define and calculate speed, velocity, uniform acceleration, and deceleration",
        requiredConcepts: ["sci-g10-mot-003", "sci-g10-mot-004", "sci-g10-mot-005"]
      },
      {
        id: "sci-g10-mot-lo-03",
        description: "Construct and interpret displacement-time and velocity-time graphs",
        requiredConcepts: ["sci-g10-mot-006", "sci-g10-mot-007"]
      },
      {
        id: "sci-g10-mot-lo-04",
        description: "Apply linear equations of motion and understand motion under gravitational acceleration",
        requiredConcepts: ["sci-g10-mot-008", "sci-g10-mot-009", "sci-g10-mot-010", "sci-g10-mot-011", "sci-g10-mot-012"]
      }
    ],
    concepts: [
      { id: "sci-g10-mot-001", name: "Scalar and Vector Quantities", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["scalar", "vector", "magnitude", "direction"] },
      { id: "sci-g10-mot-002", name: "Distance and Displacement (2.1)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["distance", "displacement", "shortest straight-line distance", "path length"] },
      { id: "sci-g10-mot-003", name: "Speed (Uniform and Non-uniform) (2.2)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["speed", "distance/time", "average speed", "uniform speed"] },
      { id: "sci-g10-mot-004", name: "Velocity (2.3)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["velocity", "displacement/time", "rate of change of displacement"] },
      { id: "sci-g10-mot-005", name: "Acceleration and Deceleration (2.4)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["acceleration", "deceleration", "rate of change of velocity", "retardation", "(v-u)/t"] },
      { id: "sci-g10-mot-006", name: "Displacement - Time Graphs (2.5)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["displacement - time graphs", "displacement time graph", "s-t graph", "gradient represents velocity"] },
      { id: "sci-g10-mot-007", name: "Velocity - Time Graphs and Area Under Graph (2.6)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["velocity - time graphs", "velocity time graph", "v-t graph", "gradient is acceleration", "area under graph is displacement"] },
      { id: "sci-g10-mot-008", name: "First Equation of Motion: v = u + at", weight: 5, isFrequentlyTested: true, category: "formula", keywords: ["v=u+at", "v = u + at", "final velocity formula"] },
      { id: "sci-g10-mot-009", name: "Second Equation of Motion: s = ut + 1/2at²", weight: 5, isFrequentlyTested: true, category: "formula", keywords: ["s=ut+1/2at^2", "s = ut + 1/2at2", "displacement formula"] },
      { id: "sci-g10-mot-010", name: "Third Equation of Motion: v² = u² + 2as", weight: 5, isFrequentlyTested: true, category: "formula", keywords: ["v^2=u^2+2as", "v2 = u2 + 2as"] },
      { id: "sci-g10-mot-011", name: "Average Velocity Equation: s = ((u+v)/2)t", weight: 4, isFrequentlyTested: true, category: "formula", keywords: ["s = ((u+v)/2)t", "average velocity formula"] },
      { id: "sci-g10-mot-012", name: "Gravitational Acceleration (2.7)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["gravitational acceleration", "g = 9.8", "g = 10 ms-2", "free fall under gravity", "vertical projection"] },
      { id: "sci-g10-mot-013", name: "Terminal Velocity", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["terminal velocity", "constant velocity in fluid", "air resistance equals weight"] }
    ],
    definitions: [
      { term: "Displacement", definition: "The shortest straight-line distance from the initial position to the final position in a specified direction.", conceptId: "sci-g10-mot-002" },
      { term: "Velocity", definition: "The rate of change of displacement with respect to time (Vector quantity, SI unit: m s⁻¹).", conceptId: "sci-g10-mot-004" },
      { term: "Acceleration", definition: "The rate of change of velocity with respect to time (Vector quantity, SI unit: m s⁻²).", conceptId: "sci-g10-mot-005" }
    ],
    formulae: ["v = u + at", "s = ut + ½at²", "v² = u² + 2as", "s = ((u + v) / 2) × t"],
    expectedDiagrams: [
      "Displacement-Time graph for uniform velocity",
      "Velocity-Time graph for uniform acceleration",
      "Velocity-Time graph for body projected vertically upwards"
    ]
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 3,
    unitName: "Structure of Matter",
    bookPageStart: 52,
    bookPageEnd: 83,
    pdfPageStart: 66,
    pdfPageEnd: 97,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 3: Structure of Matter (Book Pages 52–83 | PDF Pages 66–97)",
    matchingKeywords: [
      "structure of matter", "planetary model of the atom", "electronic configuration",
      "modern periodic table", "isotopes", "patterns seen in the periodic table",
      "metals, non metals and metalloids", "chemical formulae", "protons", "neutrons",
      "electrons", "atomic number", "mass number", "valency", "lesson 3", "unit 3"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-som-lo-01",
        description: "Describe the planetary atomic model, subatomic particles (p, n, e), and write electronic configurations for the first 20 elements",
        requiredConcepts: ["sci-g10-som-001", "sci-g10-som-002", "sci-g10-som-003", "sci-g10-som-004"]
      },
      {
        id: "sci-g10-som-lo-02",
        description: "Analyze the Modern Periodic Table, periodic trends (atomic radius, electronegativity, ionization energy), and isotopes",
        requiredConcepts: ["sci-g10-som-005", "sci-g10-som-006", "sci-g10-som-007"]
      },
      {
        id: "sci-g10-som-lo-03",
        description: "Classify elements into metals, non-metals, and metalloids, and deduce chemical formulae using valency",
        requiredConcepts: ["sci-g10-som-008", "sci-g10-som-009", "sci-g10-som-010"]
      }
    ],
    concepts: [
      { id: "sci-g10-som-001", name: "The Planetary Model of the Atom (3.1)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["planetary model of the atom", "rutherford bohr model", "nucleus", "protons", "neutrons", "electrons"] },
      { id: "sci-g10-som-002", name: "Atomic Number (Z) and Mass Number (A)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["atomic number", "mass number", "z and a", "number of protons", "nucleons"] },
      { id: "sci-g10-som-003", name: "Electronic Configuration (3.2)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["electronic configuration", "2 8 8 2", "electron shells", "k l m n shells", "valence electrons"] },
      { id: "sci-g10-som-004", name: "Modern Periodic Table (3.3)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["modern periodic table", "periods and groups", "moseley", "first 20 elements"] },
      { id: "sci-g10-som-005", name: "Isotopes (3.4)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["isotopes", "same atomic number different mass number", "protium deuterium tritium", "carbon-12 carbon-14"] },
      { id: "sci-g10-som-006", name: "Patterns Seen in the Periodic Table (3.5)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["patterns seen in the periodic table", "periodic trends", "first ionization energy", "electronegativity", "atomic radius decrease across period"] },
      { id: "sci-g10-som-007", name: "Metals, Non Metals and Metalloids (3.6)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["metals, non metals and metalloids", "properties of metals", "ductile", "malleable", "metalloids silicon germanium", "non metals"] },
      { id: "sci-g10-som-008", name: "Allotropes of Carbon", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["allotropes of carbon", "diamond", "graphite", "fullerene", "graphene"] },
      { id: "sci-g10-som-009", name: "Valency and Oxidation States", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["valency", "combining capacity", "valence electrons", "variable valency"] },
      { id: "sci-g10-som-010", name: "Writing Chemical Formulae (3.7)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["chemical formulae", "criss cross method", "polyatomic ions", "hydroxide", "sulfate", "carbonate", "nitrate"] }
    ]
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 4,
    unitName: "Newton’s Laws of Motion",
    bookPageStart: 84,
    bookPageEnd: 97,
    pdfPageStart: 98,
    pdfPageEnd: 111,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 4: Newton’s Laws of Motion (Book Pages 84–97 | PDF Pages 98–111)",
    matchingKeywords: [
      "newton's laws of motion", "newtons laws of motion", "nature of force and its effects",
      "momentum", "mass and weight", "inertia", "newton's first law", "newton's second law",
      "newton's third law", "f=ma", "action and reaction", "linear momentum", "lesson 4", "unit 4"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-nlm-lo-01",
        description: "Explain the nature of forces, balanced vs unbalanced forces, and Newton's First Law (Inertia)",
        requiredConcepts: ["sci-g10-nlm-001", "sci-g10-nlm-002", "sci-g10-nlm-003"]
      },
      {
        id: "sci-g10-nlm-lo-02",
        description: "Define momentum, explain Newton's Second Law (F = ma), and perform force calculations",
        requiredConcepts: ["sci-g10-nlm-004", "sci-g10-nlm-005", "sci-g10-nlm-006"]
      },
      {
        id: "sci-g10-nlm-lo-03",
        description: "Distinguish between mass and weight, and explain Newton's Third Law (Action-Reaction)",
        requiredConcepts: ["sci-g10-nlm-007", "sci-g10-nlm-008"]
      }
    ],
    concepts: [
      { id: "sci-g10-nlm-001", name: "Nature of Force and Its Effects (4.1)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["nature of force", "push or pull", "effects of force", "changing speed direction shape"] },
      { id: "sci-g10-nlm-002", name: "Balanced and Unbalanced Forces", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["balanced forces", "unbalanced forces", "net force", "resultant force zero"] },
      { id: "sci-g10-nlm-003", name: "Newton's First Law of Motion and Inertia", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["newton's first law", "law of inertia", "remains at rest or uniform motion", "inertia of mass"] },
      { id: "sci-g10-nlm-004", name: "Linear Momentum (4.2)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["momentum", "p = mv", "mass times velocity", "kg m s-1", "conservation of momentum"] },
      { id: "sci-g10-nlm-005", name: "Newton's Second Law of Motion (F = ma)", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["newton's second law", "f = ma", "f=ma", "rate of change of momentum", "force calculation"] },
      { id: "sci-g10-nlm-006", name: "The Unit Newton (N)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["definition of newton", "1 n = 1 kg m s-2", "si unit of force"] },
      { id: "sci-g10-nlm-007", name: "Mass and Weight (4.3)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["mass and weight", "mass is amount of matter", "weight is gravitational pull", "w = mg", "spring balance"] },
      { id: "sci-g10-nlm-008", name: "Newton's Third Law of Motion (Action and Reaction)", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["newton's third law", "action and reaction", "equal and opposite forces", "acting on two different bodies", "rocket propulsion"] }
    ],
    definitions: [
      { term: "Newton's First Law", definition: "An object will remain at rest or continue to move at a constant velocity in a straight line unless acted upon by an unbalanced external force.", conceptId: "sci-g10-nlm-003" },
      { term: "Newton's Second Law", definition: "The rate of change of momentum of a body is directly proportional to the applied unbalanced force and takes place in the direction of the force (F = ma).", conceptId: "sci-g10-nlm-005" },
      { term: "Newton's Third Law", definition: "For every action force, there is an equal and opposite reaction force acting on different interacting bodies.", conceptId: "sci-g10-nlm-008" }
    ],
    formulae: ["F = ma", "p = mv", "W = mg"]
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 5,
    unitName: "Friction",
    bookPageStart: 98,
    bookPageEnd: 109,
    pdfPageStart: 112,
    pdfPageEnd: 123,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 5: Friction (Book Pages 98–109 | PDF Pages 112–123)",
    matchingKeywords: [
      "friction", "nature of friction", "static, limiting and dynamic states of frictional forces",
      "static friction", "limiting friction", "dynamic friction", "factors affecting the limiting frictional force",
      "practical applications of friction", "limiting frictional force", "normal reaction", "lubricants", "lesson 5", "unit 5"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-frc-lo-01",
        description: "Explain the nature of friction and distinguish between static, limiting, and dynamic frictional states",
        requiredConcepts: ["sci-g10-frc-001", "sci-g10-frc-002", "sci-g10-frc-003"]
      },
      {
        id: "sci-g10-frc-lo-02",
        description: "Investigate factors affecting the limiting frictional force and apply friction in practical engineering contexts",
        requiredConcepts: ["sci-g10-frc-004", "sci-g10-frc-005", "sci-g10-frc-006"]
      }
    ],
    concepts: [
      { id: "sci-g10-frc-001", name: "Nature and Direction of Friction (5.1)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["nature of friction", "opposes relative motion", "frictional force", "contact force"] },
      { id: "sci-g10-frc-002", name: "Static, Limiting, and Dynamic Frictional States (5.2)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["static friction", "limiting friction", "dynamic friction", "kinetic friction", "states of frictional forces", "maximum static friction"] },
      { id: "sci-g10-frc-003", name: "Graph of Frictional Force vs Applied Force", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["frictional force graph", "applied force vs friction", "linear static region", "limiting peak", "constant dynamic region"] },
      { id: "sci-g10-frc-004", name: "Factors Affecting Limiting Frictional Force (5.3)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["factors affecting limiting friction", "normal reaction R", "nature of contact surfaces", "independent of apparent surface area"] },
      { id: "sci-g10-frc-005", name: "Methods of Increasing and Decreasing Friction", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["reducing friction", "lubrication", "ball bearings", "streamlining", "increasing friction", "treads on tyres", "brake pads"] },
      { id: "sci-g10-frc-006", name: "Practical Applications and Disadvantages of Friction (5.4)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["practical applications of friction", "walking", "braking vehicles", "energy loss as heat", "wear and tear of machine parts"] }
    ],
    definitions: [
      { term: "Limiting Frictional Force", definition: "The maximum value of static frictional force generated between two contact surfaces just before relative motion begins.", conceptId: "sci-g10-frc-002" },
      { term: "Dynamic (Kinetic) Friction", definition: "The resistive frictional force that acts between two surfaces moving relative to each other.", conceptId: "sci-g10-frc-002" }
    ]
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 6,
    unitName: "Structure and Functions of the Plant and Animal Cell",
    bookPageStart: 110,
    bookPageEnd: 122,
    pdfPageStart: 124,
    pdfPageEnd: 136,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 6: Structure and Functions of the Plant and Animal Cell (Book Pages 110–122 | PDF Pages 124–136)",
    matchingKeywords: [
      "structure and functions of the plant and animal cell", "basic unit of life", "concept of the cell",
      "structure of cells", "cell organelles", "plant cell", "animal cell", "nucleus", "mitochondria",
      "chloroplast", "endoplasmic reticulum", "golgi apparatus", "ribosome", "vacuole", "cell wall",
      "cell membrane", "cell growth and cell division", "mitosis", "meiosis", "lesson 6", "unit 6"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-cel-lo-01",
        description: "Explain the cell theory, structural differences between plant and animal cells, and observe cells under light microscope",
        requiredConcepts: ["sci-g10-cel-001", "sci-g10-cel-002", "sci-g10-cel-003"]
      },
      {
        id: "sci-g10-cel-lo-02",
        description: "Identify cell organelles and explain their specific biological functions",
        requiredConcepts: ["sci-g10-cel-004", "sci-g10-cel-005", "sci-g10-cel-006", "sci-g10-cel-007"]
      },
      {
        id: "sci-g10-cel-lo-03",
        description: "Distinguish between cell growth and cell division (Mitosis vs Meiosis) and their significance",
        requiredConcepts: ["sci-g10-cel-008", "sci-g10-cel-009"]
      }
    ],
    concepts: [
      { id: "sci-g10-cel-001", name: "Concept of the Cell and Basic Unit of Life (6.1 & 6.2)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["basic unit of life", "concept of the cell", "cell theory", "robert hooke", "schleiden and schwann"] },
      { id: "sci-g10-cel-002", name: "Plant Cell Structure vs Animal Cell Structure (6.3)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["structure of cells", "plant cell vs animal cell", "cellulose cell wall", "large central vacuole", "centrosome in animal cell"] },
      { id: "sci-g10-cel-003", name: "Plasma Membrane and Cell Wall", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["cell membrane", "plasma membrane", "selectively permeable", "phospholipid bilayer", "cell wall", "turgidity"] },
      { id: "sci-g10-cel-004", name: "Nucleus (Nuclear Envelope, Nucleolus, Chromatin)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["nucleus", "nuclear membrane", "nucleolus", "chromatin", "control center of cell", "genetic material"] },
      { id: "sci-g10-cel-005", name: "Mitochondria and Energy Production (ATP)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["mitochondria", "power house of cell", "cellular respiration", "atp production", "cristae"] },
      { id: "sci-g10-cel-006", name: "Chloroplast and Photosynthesis", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["chloroplast", "chlorophyll", "photosynthesis", "grana and stroma", "thylakoid"] },
      { id: "sci-g10-cel-007", name: "Endoplasmic Reticulum, Golgi Body, Ribosomes, and Vacuoles", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["cell organelles", "rough endoplasmic reticulum", "smooth er", "golgi apparatus", "ribosomes protein synthesis", "vacuole tonoplast"] },
      { id: "sci-g10-cel-008", name: "Mitosis (Equational Cell Division)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["mitosis", "equational division", "growth and repair", "identical daughter cells", "diploid 2n"] },
      { id: "sci-g10-cel-009", name: "Meiosis (Reductional Cell Division)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["meiosis", "reductional division", "gamete formation", "haploid n", "genetic variation"] }
    ]
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 7,
    unitName: "Quantification of Elements and Compounds",
    bookPageStart: 123,
    bookPageEnd: 138,
    pdfPageStart: 137,
    pdfPageEnd: 152,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 7: Quantification of Elements and Compounds (Book Pages 123–138 | PDF Pages 137–152)",
    matchingKeywords: [
      "quantification of elements and compounds", "relative atomic mass", "relative molecular mass",
      "avogadro constant", "mole", "molar mass", "molar volume of gases", "avogadro number",
      "mole concept", "n = m/m", "lesson 7", "unit 7"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-qec-lo-01",
        description: "Define and calculate Relative Atomic Mass (Ar) and Relative Molecular Mass (Mr)",
        requiredConcepts: ["sci-g10-qec-001", "sci-g10-qec-002"]
      },
      {
        id: "sci-g10-qec-lo-02",
        description: "Explain the Mole concept, Avogadro constant (6.022 × 10²³), and molar mass calculations",
        requiredConcepts: ["sci-g10-qec-003", "sci-g10-qec-004", "sci-g10-qec-005"]
      }
    ],
    concepts: [
      { id: "sci-g10-qec-001", name: "Relative Atomic Mass (Ar) (7.1)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["relative atomic mass (ar)", "relative atomic mass", "ar", "carbon-12 scale", "1/12th of carbon-12 atom"] },
      { id: "sci-g10-qec-002", name: "Relative Molecular Mass (Mr) and Formula Mass (7.2)", weight: 5, isFrequentlyTested: true, category: "calculation", keywords: ["relative molecular mass (mr)", "relative molecular mass", "mr", "formula mass", "sum of atomic masses"] },
      { id: "sci-g10-qec-003", name: "Avogadro Constant (L / NA) (7.3)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["avogadro constant", "6.022 x 10^23", "avogadro number", "number of particles in one mole"] },
      { id: "sci-g10-qec-004", name: "The Mole Concept and Molar Mass (7.4)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["mole", "mole concept", "molar mass", "g mol-1", "amount of substance"] },
      { id: "sci-g10-qec-005", name: "Mole Calculations (n = m / M and n = N / NA)", weight: 5, isFrequentlyTested: true, category: "calculation", keywords: ["mole calculation", "n = m/m", "mass / molar mass", "n = n/na", "number of moles"] },
      { id: "sci-g10-qec-006", name: "Molar Volume of Gases at STP (22.4 dm³ mol⁻¹)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["molar volume of gases", "22.4 dm3", "stp molar volume", "22.4 l mol-1"] }
    ],
    formulae: ["n = m / M", "n = N / NA", "V = n × 22.4 dm³ (at STP)"]
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 8,
    unitName: "Characteristics of Organisms",
    bookPageStart: 139,
    bookPageEnd: 155,
    pdfPageStart: 153,
    pdfPageEnd: 169,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 8: Characteristics of Organisms (Book Pages 139–155 | PDF Pages 153–169)",
    matchingKeywords: [
      "characteristics of organisms", "cellular organization", "nutrition", "respiration",
      "irritability and co-ordination", "irritability and coordination", "excretion", "movement",
      "reproduction", "growth and development", "autotrophic", "heterotrophic", "lesson 8", "unit 8"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-cho-lo-01",
        description: "Analyze the fundamental characteristics distinguishing living organisms from non-living matter",
        requiredConcepts: ["sci-g10-cho-001", "sci-g10-cho-002", "sci-g10-cho-003", "sci-g10-cho-004"]
      },
      {
        id: "sci-g10-cho-lo-02",
        description: "Explain coordination, excretion, movement, reproduction, and growth in organisms",
        requiredConcepts: ["sci-g10-cho-005", "sci-g10-cho-006", "sci-g10-cho-007", "sci-g10-cho-008"]
      }
    ],
    concepts: [
      { id: "sci-g10-cho-001", name: "Cellular Organization (8.1)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["cellular organization", "unicellular organisms", "multicellular organisms", "cells tissues organs systems"] },
      { id: "sci-g10-cho-002", name: "Nutrition (Autotrophic vs Heterotrophic) (8.2)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["nutrition", "autotrophic nutrition", "photosynthesis", "heterotrophic nutrition", "holozoic saprophytic parasitic"] },
      { id: "sci-g10-cho-003", name: "Respiration and Energy Release (8.3)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["respiration", "aerobic and anaerobic", "gas exchange", "energy liberation atp"] },
      { id: "sci-g10-cho-004", name: "Irritability and Co-ordination (8.4)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["irritability and co-ordination", "irritability", "response to stimuli", "nervous coordination", "chemical coordination hormones"] },
      { id: "sci-g10-cho-005", name: "Excretion and Metabolic Waste Removal (8.5)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["excretion", "metabolic waste products", "urea", "carbon dioxide", "kidneys", "stomata in plants"] },
      { id: "sci-g10-cho-006", name: "Movement and Locomotion (8.6)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["movement", "locomotion", "plant tropisms", "phototropism", "muscular movement"] },
      { id: "sci-g10-cho-007", name: "Reproduction (Sexual and Asexual) (8.7)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["reproduction", "sexual reproduction", "asexual reproduction", "continuation of species"] },
      { id: "sci-g10-cho-008", name: "Growth and Development (8.8)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["growth and development", "irreversible increase in dry mass", "differentiation of cells"] }
    ]
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 9,
    unitName: "Resultant Force",
    bookPageStart: 156,
    bookPageEnd: 167,
    pdfPageStart: 170,
    pdfPageEnd: 181,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 9: Resultant Force (Book Pages 156–167 | PDF Pages 170–181)",
    matchingKeywords: [
      "resultant force", "resultant of several forces", "resultant of two collinear forces",
      "resultant of two parallel forces", "resultant of two inclined forces", "parallelogram law of forces",
      "collinear forces", "parallel forces", "inclined forces", "vector addition", "lesson 9", "unit 9"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-res-lo-01",
        description: "Determine the resultant of two or more collinear forces acting in the same or opposite directions",
        requiredConcepts: ["sci-g10-res-001", "sci-g10-res-002"]
      },
      {
        id: "sci-g10-res-lo-02",
        description: "Determine the resultant of parallel forces and inclined forces using the Parallelogram Law",
        requiredConcepts: ["sci-g10-res-003", "sci-g10-res-004", "sci-g10-res-005"]
      }
    ],
    concepts: [
      { id: "sci-g10-res-001", name: "Concept of Resultant Force (9.1)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["resultant force", "single force having same effect", "vector sum of forces"] },
      { id: "sci-g10-res-002", name: "Resultant of Two Collinear Forces (9.2)", weight: 5, isFrequentlyTested: true, category: "calculation", keywords: ["collinear forces", "forces in same direction F1+F2", "forces in opposite direction F1-F2", "algebraic addition"] },
      { id: "sci-g10-res-003", name: "Resultant of Two Like and Unlike Parallel Forces (9.3)", weight: 5, isFrequentlyTested: true, category: "calculation", keywords: ["resultant of two parallel forces", "like parallel forces", "unlike parallel forces", "point of application"] },
      { id: "sci-g10-res-004", name: "Resultant of Two Perpendicular Forces (Pythagoras Theorem)", weight: 5, isFrequentlyTested: true, category: "calculation", keywords: ["perpendicular forces", "r = sqrt(f1^2 + f2^2)", "tan theta = f2/f1", "pythagoras resultant"] },
      { id: "sci-g10-res-005", name: "Parallelogram Law of Forces (Inclined Forces) (9.4)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["resultant of two inclined forces", "parallelogram law of forces", "scale drawing", "diagonal of parallelogram"] }
    ]
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 10,
    unitName: "Chemical Bonds",
    bookPageStart: 168,
    bookPageEnd: 188,
    pdfPageStart: 182,
    pdfPageEnd: 202,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 10: Chemical Bonds (Book Pages 168–188 | PDF Pages 182–202)",
    matchingKeywords: [
      "chemical bonds", "ionic bonds", "covalent bonds", "polarity of bonds",
      "intermolecular bonds", "properties of ionic and covalent compounds", "octet rule",
      "electron sharing", "electron transfer", "electronegativity", "hydrogen bond", "van der waals", "lesson 10", "unit 10"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-chb-lo-01",
        description: "Explain the formation of ionic bonds via electron transfer and draw Lewis dot structures of ionic compounds",
        requiredConcepts: ["sci-g10-chb-001", "sci-g10-chb-002"]
      },
      {
        id: "sci-g10-chb-lo-02",
        description: "Explain the formation of single, double, and triple covalent bonds and analyze bond polarity",
        requiredConcepts: ["sci-g10-chb-003", "sci-g10-chb-004", "sci-g10-chb-005"]
      },
      {
        id: "sci-g10-chb-lo-03",
        description: "Compare properties of ionic and covalent compounds and explain intermolecular forces",
        requiredConcepts: ["sci-g10-chb-006", "sci-g10-chb-007"]
      }
    ],
    concepts: [
      { id: "sci-g10-chb-001", name: "Octet Rule and Chemical Stability", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["octet rule", "duplet rule", "noble gas electronic configuration", "chemical stability"] },
      { id: "sci-g10-chb-002", name: "Ionic Bonds and Crystal Lattice Formation (10.1)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["ionic bonds", "electrostatic attraction", "cation and anion", "electron transfer", "nacl lattice", "mgo"] },
      { id: "sci-g10-chb-003", name: "Covalent Bonds (Single, Double, Triple Bonds) (10.2)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["covalent bonds", "sharing of electrons", "single bond h2", "double bond o2", "triple bond n2", "ch4", "h2o", "lewis dot diagram"] },
      { id: "sci-g10-chb-004", name: "Polarity of Bonds (Polar and Non-Polar) (10.3)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["polarity of bonds", "electronegativity difference", "polar covalent bond", "non-polar covalent bond", "dipole moment", "delta positive delta negative"] },
      { id: "sci-g10-chb-005", name: "Intermolecular Bonds (Hydrogen Bonds & Van der Waals) (10.4)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["intermolecular bonds", "hydrogen bonding in water", "van der waals forces", "weak intermolecular attraction"] },
      { id: "sci-g10-chb-006", name: "Properties of Ionic Compounds (10.5)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["properties of ionic compounds", "high melting and boiling points", "conduct electricity in molten/aqueous state", "soluble in polar solvents"] },
      { id: "sci-g10-chb-007", name: "Properties of Covalent Compounds (10.5)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["properties of covalent compounds", "low melting and boiling points", "poor electrical conductors", "soluble in non-polar organic solvents"] }
    ]
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 11,
    unitName: "Turning Effect of a Force",
    bookPageStart: 189,
    bookPageEnd: 200,
    pdfPageStart: 203,
    pdfPageEnd: 214,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 11: Turning Effect of a Force (Book Pages 189–200 | PDF Pages 203–214)",
    matchingKeywords: [
      "turning effect of a force", "moment", "moment of a force", "principle of moments",
      "clockwise moment", "anticlockwise moment", "the couple of forces", "couple",
      "torque", "levers", "perpendicular distance", "lesson 11", "unit 11"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-trf-lo-01",
        description: "Define moment of a force, calculate clockwise/anticlockwise moments, and apply the Principle of Moments",
        requiredConcepts: ["sci-g10-trf-001", "sci-g10-trf-002", "sci-g10-trf-003"]
      },
      {
        id: "sci-g10-trf-lo-02",
        description: "Explain the couple of forces, torque, and practical applications in tools and machinery",
        requiredConcepts: ["sci-g10-trf-004", "sci-g10-trf-005"]
      }
    ],
    concepts: [
      { id: "sci-g10-trf-001", name: "Moment of a Force (11.1)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["moment", "moment of a force", "turning effect", "force x perpendicular distance", "torque", "n m unit"] },
      { id: "sci-g10-trf-002", name: "Clockwise and Anticlockwise Moments", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["clockwise moment", "anticlockwise moment", "direction of rotation"] },
      { id: "sci-g10-trf-003", name: "Principle of Moments", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["principle of moments", "sum of clockwise moments equals sum of anticlockwise moments", "rotational equilibrium"] },
      { id: "sci-g10-trf-004", name: "The Couple of Forces (11.2)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["the couple of forces", "couple", "two equal and opposite parallel forces", "torque of a couple", "steering wheel", "water tap"] },
      { id: "sci-g10-trf-005", name: "Practical Applications of Moments and Levers", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["spanner", "crowbar", "see saw", "door handle", "mechanical advantage"] }
    ],
    formulae: ["Moment of a Force = F × d (N m)", "Torque of a Couple = F × s (N m)"]
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 12,
    unitName: "Equilibrium of Forces",
    bookPageStart: 201,
    bookPageEnd: 215,
    pdfPageStart: 215,
    pdfPageEnd: 229,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 12: Equilibrium of Forces (Book Pages 201–215 | PDF Pages 215–229)",
    matchingKeywords: [
      "equilibrium of forces", "equilibrium of a body under two forces", "equilibrium of a body under three coplanar parallel forces",
      "equilibrium of a body under three forces that are not parallel", "coplanar forces", "triangle law of forces",
      "concurrent forces", "point of concurrency", "static equilibrium", "lesson 12", "unit 12"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-eqf-lo-01",
        description: "State conditions for equilibrium under two forces and under three coplanar parallel forces",
        requiredConcepts: ["sci-g10-eqf-001", "sci-g10-eqf-002", "sci-g10-eqf-003"]
      },
      {
        id: "sci-g10-eqf-lo-02",
        description: "Analyze equilibrium under three non-parallel forces (concurrency) and apply the Triangle Law of Forces",
        requiredConcepts: ["sci-g10-eqf-004", "sci-g10-eqf-005"]
      }
    ],
    concepts: [
      { id: "sci-g10-eqf-001", name: "Introduction to Equilibrium of Forces (12.1)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["equilibrium of forces", "state of rest or uniform motion", "resultant force zero", "resultant moment zero"] },
      { id: "sci-g10-eqf-002", name: "Equilibrium Under Two Forces (12.2)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["equilibrium of a body under two forces", "equal magnitude", "opposite direction", "same line of action"] },
      { id: "sci-g10-eqf-003", name: "Equilibrium Under Three Coplanar Parallel Forces (12.3)", weight: 5, isFrequentlyTested: true, category: "calculation", keywords: ["equilibrium of a body under three coplanar parallel forces", "sum of upward forces equals sum of downward forces", "moment about any point is zero"] },
      { id: "sci-g10-eqf-004", name: "Equilibrium Under Three Non-Parallel Forces (Concurrency) (12.4)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["equilibrium of a body under three forces that are not parallel", "point of concurrency", "lines of action meet at a single point"] },
      { id: "sci-g10-eqf-005", name: "Triangle Law of Forces", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["triangle law of forces", "closed triangle of vectors", "scale vector diagram", "three forces in equilibrium"] }
    ]
  },

  // ── Grade 11 Geography (Textbook: grade-11-geography-text-book.pdf, PDF offset: 12) ──
  {
    subject: "Geography",
    grade: 11,
    unitNumber: 1,
    unitName: "Physical Landscape of Sri Lanka",
    bookPageStart: 1,
    bookPageEnd: 28,
    pdfPageStart: 13,
    pdfPageEnd: 40,
    pdfOffset: 12,
    textbookFilename: "grade-11-geography-text-book-6200f4747a893.pdf",
    textbookReference: "Grade 11 Geography — Unit 1: Physical Landscape of Sri Lanka (Book Pages 1–28 | PDF Pages 13–40)",
    matchingKeywords: ["geography", "sri lanka", "relief", "central highlands", "coastal plain", "drainage patterns", "rivers", "climate", "monsoon"],
  },

  // ── Grade 11 ICT (Textbook: ICT G-11 E.pdf, PDF offset: 10) ──
  {
    subject: "ICT",
    grade: 11,
    unitNumber: 1,
    unitName: "Programming and Algorithms",
    bookPageStart: 1,
    bookPageEnd: 35,
    pdfPageStart: 11,
    pdfPageEnd: 45,
    pdfOffset: 10,
    textbookFilename: "ICT G-11 E.pdf",
    textbookReference: "Grade 11 ICT — Unit 1: Programming and Algorithms (Book Pages 1–35 | PDF Pages 11–45)",
    matchingKeywords: ["ict", "programming", "algorithms", "flowchart", "pseudocode", "python", "variables", "data types", "loops"],
  },

  // ── Grade 10 History (Textbook: grade-10-history-text-book-64017cf286c01.pdf, PDF offset: 10) ──
  // Based on official National Institute of Education (NIE) Teacher's Instructional Guide (TG)
  {
    subject: "History",
    grade: 10,
    unitNumber: 1,
    unitName: "Sources for Studying History",
    bookPageStart: 1,
    bookPageEnd: 9,
    pdfPageStart: 11,
    pdfPageEnd: 19,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 1: Sources for Studying History (Book Pages 1–9 | PDF Pages 11–19)",
    matchingKeywords: [
      "sources for studying history", "sources of studying history", "classification of sources",
      "importance of learning history", "protecting archaeological sources", "literary sources",
      "local literary sources", "foreign literary sources", "pali chronicles", "pali atthakatha",
      "religious texts", "verse literature", "prose literature", "archaeological sources",
      "inscriptions", "coins", "ruins", "mahavamsa", "deepavamsa", "pujavaliya", "rajavaliya", "lesson 1", "unit 1"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u1-lo-01",
        description: "Classify historical sources into local/foreign literary and archaeological categories and evaluate their historical reliability",
        requiredConcepts: ["his-g10-u1-001", "his-g10-u1-002", "his-g10-u1-003"]
      },
      {
        id: "his-g10-u1-lo-02",
        description: "Explain the personal, cultural, and national importance of learning history and apply lessons to contemporary life",
        requiredConcepts: ["his-g10-u1-004", "his-g10-u1-005"]
      }
    ],
    concepts: [
      { id: "his-g10-u1-001", name: "Local Literary Sources (Chronicles, Atthakatha, Verse, and Prose)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["local literary sources", "pali chronicles", "mahavamsa", "deepavamsa", "pali atthakatha", "pujavaliya", "rajavaliya", "thupavamsa", "verse literature"] },
      { id: "his-g10-u1-002", name: "Foreign Literary Sources (Books, Visitor Accounts, Records)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["foreign literary sources", "books written by foreigners", "reports of foreign visitors", "fa-hsien", "megasthenes", "cosmas indicopleustes", "ibn battuta"] },
      { id: "his-g10-u1-003", name: "Archaeological Sources (Inscriptions, Coins, Ruins, and Material Remains)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["archaeological sources", "inscriptions", "cave inscriptions", "rock inscriptions", "slab inscriptions", "pillar inscriptions", "coins", "kahapana", "ruins", "monuments", "pottery"] },
      { id: "his-g10-u1-004", name: "Value and Importance of Learning History", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["importance of learning history", "understand present through past", "build the future", "national identity", "critical thinking", "tolerate different views", "national unity", "leadership qualities"] },
      { id: "his-g10-u1-005", name: "Protection and Preservation of Archaeological Sources", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["protecting archaeological sources", "preservation of monuments", "antiquities ordinance", "archaeological department", "national heritage"] }
    ],
    definitions: [
      { term: "Literary Sources", definition: "Written historical documents, chronicles, commentaries (Atthakatha), and traveler accounts that record past events." },
      { term: "Archaeological Sources", definition: "Physical and material remains left by past human societies, including epigraphical inscriptions, coins, pottery, tools, and architectural monuments." }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 2,
    unitName: "Early Settlements of Sri Lanka",
    bookPageStart: 10,
    bookPageEnd: 30,
    pdfPageStart: 20,
    pdfPageEnd: 40,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 2: Early Settlements of Sri Lanka (Book Pages 10–30 | PDF Pages 20–40)",
    matchingKeywords: [
      "early settlements of sri lanka", "ancient settlements", "settlements in the pre-historic era",
      "settlements in proto-historic era", "settlements in early historic era", "pre-historic settlement",
      "proto-historic period", "historic period", "stone age", "balangoda man", "homo sapiens balangodensis",
      "pahiyangala", "batadombalena", "kithulgala belilena", "bellanbendipelessa", "bandarawela",
      "ibbankatuwa", "vapigam", "parikitta gam", "pandukabhaya", "anuradhapura city plan", "lesson 2", "unit 2"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u2-lo-01",
        description: "Analyze the environmental adaptation, stone tool technology, dietary habits, and burial rituals of pre-historic Balangoda Man",
        requiredConcepts: ["his-g10-u2-001", "his-g10-u2-002", "his-g10-u2-003"]
      },
      {
        id: "his-g10-u2-lo-02",
        description: "Explain the transition into proto-historic iron-age societies and megalithic burial practices at Ibbankatuwa",
        requiredConcepts: ["his-g10-u2-004"]
      },
      {
        id: "his-g10-u2-lo-03",
        description: "Describe early historic village settlement types (Vapigam, Parikitta Gam) and urban planning under King Pandukabhaya",
        requiredConcepts: ["his-g10-u2-005", "his-g10-u2-006"]
      }
    ],
    concepts: [
      { id: "his-g10-u2-001", name: "Pre-Historic Hunter-Gatherer Cave and Open-Air Sites", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["pre-historic settlement", "cave habitations", "pahiyangala", "batadombalena", "kithulgala belilena", "dorawaka lena", "open-space hunting grounds", "bundala", "pathirajawela", "minihagalkanda"] },
      { id: "his-g10-u2-002", name: "Mesolithic Lifestyle, Food, and Geometric Stone Tools (Balangoda Man)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["balangoda man", "homo sapiens balangodensis", "geometric micro stone tools", "quartz tools", "animal-bone tools", "wild breadfruit", "wild plantain", "yams", "roasting", "salt mixing"] },
      { id: "his-g10-u2-003", name: "Later Pre-Historic Dwellings and Burial Customs (Bellanbendipelessa & Bandarawela)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["bellanbendipelessa", "bandarawela", "wattle-and-daub houses", "painted pottery", "red ochre burial ritual", "exhumation"] },
      { id: "his-g10-u2-004", name: "Proto-Historic Early Iron Age and Megalithic Burials (Ibbankatuwa)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["proto-historic period", "early iron age", "ibbankatuwa megalithic cist burial", "iron tools", "pottery painting", "farming transition"] },
      { id: "his-g10-u2-005", name: "Historic Period Settlement Distribution and Village Types (Vapigam & Parikitta Gam)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["vapigam", "tank-based villages", "parikitta gam", "family-based settlements", "river basin settlements", "malwathu oya", "kelani ganga", "occupational specialization"] },
      { id: "his-g10-u2-006", name: "Urban Planned Settlements and King Pandukabhaya's Anuradhapura Plan", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["planned settlements", "pandukabhaya's city plan", "anuradhapura urban settlement", "city layout", "four gates", "sanitation workers"] }
    ],
    definitions: [
      { term: "Vapigam", definition: "Ancient Sri Lankan agricultural rural settlements that originated and clustered around an irrigation tank (Wewa)." },
      { term: "Parikitta Gam", definition: "Small, enclosed family-based or specialized occupational settlements in early historical Sri Lanka." }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 3,
    unitName: "Evolution of Political Power in Sri Lanka",
    bookPageStart: 31,
    bookPageEnd: 43,
    pdfPageStart: 41,
    pdfPageEnd: 53,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 3: Evolution of Political Power in Sri Lanka (Book Pages 31–43 | PDF Pages 41–53)",
    matchingKeywords: [
      "evolution of political power in sri lanka", "pre-state era", "pre state era", "pre-monarchical period",
      "the concept of state", "monarchy and the king", "concept of monarchy", "great kings who ruled this country",
      "prince vijaya", "mahasammatha", "grahapati", "gahapathi", "gamika", "parumaka", "parumakas",
      "parvatha raja", "bodhisathwa", "deva", "chakravarthi", "veerathva", "royal succession",
      "decentralization of power", "centralization of power", "kothgalakanda", "periyapuliyankulama",
      "thota bojaka", "king dutugemunu", "king pandukabhaya", "king vasabha", "king mahasen", "lesson 3", "unit 3", "his"
    ],
    learningOutcomes: [
      {
        id: "his-g10-epp-lo-01",
        description: "Explain the pre-monarchical political hierarchy (Grahapati → Gamika → Parumaka) and the decentralization of regional power",
        requiredConcepts: ["his-g10-epp-001", "his-g10-epp-002", "his-g10-epp-003", "his-g10-epp-004", "his-g10-epp-005"]
      },
      {
        id: "his-g10-epp-lo-02",
        description: "Examine ideological concepts of monarchy (Parvatha Raja, Bodhisathwa, Deva, Chakravarthi, Mahasammatha) and royal succession rules",
        requiredConcepts: ["his-g10-epp-006", "his-g10-epp-007"]
      },
      {
        id: "his-g10-epp-lo-03",
        description: "Analyze epigraphical evidence (Kothgalakanda, Periyapuliyankulama) and the role of great kings in centralizing power",
        requiredConcepts: ["his-g10-epp-008", "his-g10-epp-009", "his-g10-epp-010"]
      }
    ],
    concepts: [
      { id: "his-g10-epp-001", name: "Pre-Monarchical Political Organization (Grahapati → Gamika → Parumaka)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["pre-monarchical period", "pre-state era", "grahapati", "gahapathi", "head of family", "gamika", "village leader", "parumaka", "leader of gamikas", "family village several villages"] },
      { id: "his-g10-epp-002", name: "Decentralization vs Centralization of Political Power", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["decentralization of power", "centralization of power", "power distributed among representatives", "power concentrated around one person"] },
      { id: "his-g10-epp-003", name: "Arrival of Prince Vijaya and Early Legends", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["prince vijaya", "vijaya arrived", "6th century b.c", "first king who ruled", "came from india"] },
      { id: "his-g10-epp-004", name: "Role and Dominance of Parumakas in Provincial Leadership", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["parumaka", "parumakas", "pramukha", "provincial chieftains", "local leaders", "parumakas associated with kingship"] },
      { id: "his-g10-epp-005", name: "Concept of Mahasammatha and People's Consent in Kingship", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["mahasammatha", "general will of the people", "consent of people", "authority to rule given by people", "king or queen"] },
      { id: "his-g10-epp-006", name: "Concepts of Monarchy (Parvatha Raja, Bodhisathwa, Deva, Chakravarthi, Veerathva)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["concept of monarchy", "parvatha raja", "bodhisathwa", "deva", "chakravarthi", "veerathva", "king appearing as god"] },
      { id: "his-g10-epp-007", name: "Royal Succession Rules (Father to Son, Brother to Brother)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["royal succession", "father to son", "brother to brother", "royal heritage", "patrilineal succession"] },
      { id: "his-g10-epp-008", name: "Epigraphical Evidence of Early Statecraft (Kothgalakanda & Periyapuliyankulama)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["kothgalakanda", "thota bojaka", "periyapuliyankulama", "cave inscription", "inscriptions of 250 b.c", "anubhava kirima", "collect taxes"] },
      { id: "his-g10-epp-009", name: "Archaeological Evidence of Early Settlements (Beragala & Haldummulla)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["beragala", "haldummulla", "burial grounds", "2400 b.c", "early agricultural society"] },
      { id: "his-g10-epp-010", name: "Great Centralizing Rulers (Pandukabhaya, Devanampiyatissa, Dutugemunu, Vasabha, Mahasen)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["king dutugemunu", "king pandukabhaya", "king devanampiyatissa", "king vasabha", "king mahasen", "great kings who ruled", "centralized state"] }
    ],
    definitions: [
      { term: "Grahapati (Gahapathi)", definition: "The head of an ancient family unit ('Kula') or household in the early village settlements." },
      { term: "Gamika", definition: "The designated chief or leader responsible for the administration of a village (Gama) in pre-monarchical Sri Lanka." },
      { term: "Parumaka", definition: "A prominent provincial chieftain in ancient Sri Lanka who held leadership over multiple village chiefs (Gamikas) and regional resources (derived from 'Pramukha')." },
      { term: "Mahasammatha", definition: "The ideal concept of a ruler chosen and authorized by the general consensus, will, and approval of the people." }
    ],
    expectedDiagrams: [
      "Flowchart: Grahapati (Family Head) → Gamika (Village Chief) → Parumaka (Provincial Leader)"
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 4,
    unitName: "Ancient Society of Sri Lanka",
    bookPageStart: 44,
    bookPageEnd: 62,
    pdfPageStart: 54,
    pdfPageEnd: 72,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 4: Ancient Society of Sri Lanka (Book Pages 44–62 | PDF Pages 54–72)",
    matchingKeywords: [
      "ancient society of sri lanka", "the ancient society of sri lanka", "administration", "economy", "culture",
      "executive", "legislature", "judiciary", "foreign policy", "chena cultivation", "paddy cultivation",
      "taxation", "diyadada", "bojakapati", "livestock", "industries", "craftsmen", "industry-based villages",
      "internal trade", "barter", "guilds", "external trade", "silk route", "mathota", "godawaya",
      "buddhism", "pirivena education", "astrology", "warfare", "astronomy", "logic", "mathematics",
      "literature", "pali", "sanskrit", "sinhala", "ethnic coexistence", "plural society", "lesson 4", "unit 4"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u4-lo-01",
        description: "Analyze the administrative machinery (Executive, Legislature, Judiciary, Foreign Policy) and administrative posts of the Rajarata civilization",
        requiredConcepts: ["his-g10-u4-001", "his-g10-u4-002"]
      },
      {
        id: "his-g10-u4-lo-02",
        description: "Explain ancient agricultural systems, livestock, cottage industries, guilds, and domestic/foreign trade networks",
        requiredConcepts: ["his-g10-u4-003", "his-g10-u4-004", "his-g10-u4-005"]
      },
      {
        id: "his-g10-u4-lo-03",
        description: "Assess cultural life, Pirivena educational curriculum, literature, and harmonious ethnic coexistence in ancient Sri Lanka",
        requiredConcepts: ["his-g10-u4-006", "his-g10-u4-007"]
      }
    ],
    concepts: [
      { id: "his-g10-u4-001", name: "Ancient Administrative Organs (Executive, Legislature, Judiciary, Foreign Policy)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["executive", "legislature", "judiciary", "foreign policy", "state administration", "royal council"] },
      { id: "his-g10-u4-002", name: "State Officials and Port/Customs Officers (Hathi Adeka, Bathagu, Nagaragutika, Kothurugena)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["hathi adeka", "bathagu", "nagaragutika", "kothurugena", "rupa adeka", "officer in charge of customs", "officer in charge of tuskers"] },
      { id: "his-g10-u4-003", name: "Agrarian Economy and Water Taxation (Paddy, Chena, Diyadada, Bojakapati)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["paddy cultivation", "chena farming", "livestock", "irrigation taxation", "diyadada", "bojakapati", "grain storage", "state sponsorship"] },
      { id: "his-g10-u4-004", name: "Ancient Cottage Industries, Guilds, and Occupational Villages", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["industry-based villages", "craftsmen", "hereditary craftsmanship", "guilds", "pottery villages", "metalworking villages"] },
      { id: "his-g10-u4-005", name: "Internal and Maritime Foreign Trade (Silk Route, Mathota, Godawaya, Rome, China)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["internal trade", "barter", "external trade", "silk route", "mathota harbour", "godawaya port", "romanuka desha", "trade regulations", "customs duties"] },
      { id: "his-g10-u4-006", name: "Pirivena Education and Comprehensive Curriculum (Logic, Astronomy, Warfare, Astrology)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["pirivena education", "temple education", "curriculum", "astrology", "warfare", "astronomy", "logic", "mathematics", "pali", "sanskrit", "sinhala prose and verse"] },
      { id: "his-g10-u4-007", name: "Ethnic Coexistence and Plural Society in Ancient Sri Lanka", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["ethnic coexistence", "plural society", "different ethnic groups", "foreign soldiers", "traders", "marital relations", "religious harmony"] }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 5,
    unitName: "Science and Technology in Ancient Sri Lanka",
    bookPageStart: 63,
    bookPageEnd: 76,
    pdfPageStart: 73,
    pdfPageEnd: 86,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 5: Science and Technology in Ancient Sri Lanka (Book Pages 63–76 | PDF Pages 73–86)",
    matchingKeywords: [
      "science and technology in ancient sri lanka", "the ancient science and technology in sri lanka",
      "applied science", "pre-historic technology", "construction", "clay bricks", "mortar", "stone houses",
      "potter's wheel", "water management", "tanks", "silt traps", "canals", "sigiriya sprinklers",
      "sigiriya fountains", "bisokotuwa", "ralapanawa", "sorowwa", "yoda ela", "kala wewa", "minneriya",
      "hygiene sanitation and medicine", "waste management", "latrines", "urinals", "surgical instruments",
      "medicinal baths", "hospitals", "mihintale", "medical books", "sarartha sangrahaya", "metallurgy",
      "monsoon furnaces", "samanalawewa", "gem industry", "jewellery", "lesson 5", "unit 5"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u5-lo-01",
        description: "Analyze the engineering principles of ancient hydraulic technology: tank bunds, Bisokotuwa, low-gradient canals (Yoda Ela), and Sigiriya water fountains",
        requiredConcepts: ["his-g10-u5-001", "his-g10-u5-002", "his-g10-u5-003"]
      },
      {
        id: "his-g10-u5-lo-02",
        description: "Explain ancient metallurgical innovations (Samanalawewa wind furnaces), architectural planning, and medical/sanitation achievements",
        requiredConcepts: ["his-g10-u5-004", "his-g10-u5-005", "his-g10-u5-006"]
      }
    ],
    concepts: [
      { id: "his-g10-u5-001", name: "Initial Stage of Applied Science and Prehistoric Construction", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["pre-historic technology", "clay structures", "clay bricks", "mortar", "stone houses", "potter's wheel", "pottery painting"] },
      { id: "his-g10-u5-002", name: "Hydraulic Technology: Tank Bunds, Silt Traps, Sluices, and Bisokotuwa", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["bisokotuwa", "valve pit", "water pressure regulation", "sluice gate", "sorowwa", "ralapanawa", "wave breaker", "tank bund", "silt traps"] },
      { id: "his-g10-u5-003", name: "Trans-Basin Canals and Low Gradient Engineering (Yoda Ela / Jaya Ganga)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["yoda ela", "jaya ganga", "low gradient", "trans-basin canal", "king dhatusena", "kala wewa to thisa wewa", "6 inches per mile slope"] },
      { id: "his-g10-u5-004", name: "Sigiriya Water Gardens, Underground Conduits, and Pressure Sprinklers/Fountains", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["sigiriya water gardens", "sigiriya sprinklers", "sigiriya fountains", "underground conduits", "gravity water pressure", "kashyapa"] },
      { id: "his-g10-u5-005", name: "Monsoon Wind Furnaces and Advanced Metallurgy (Samanalawewa Steel)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["monsoon wind furnaces", "samanalawewa", "iron smelting", "high carbon steel production", "swords export to damascus", "metallurgy"] },
      { id: "his-g10-u5-006", name: "Ancient Sanitation, Hospitals, Surgical Instruments, and Medicine (Mihintale, Sarartha Sangrahaya)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["ancient hospitals", "mihintale hospital", "medirigiriya", "medicinal trough", "surgical instruments", "latrines and urinals", "king buddhadasa", "sarartha sangrahaya"] }
    ],
    definitions: [
      { term: "Bisokotuwa (Valve Pit)", definition: "An ingenious ancient stone enclosure built inside a reservoir embankment to regulate and dissipate the immense water pressure before releasing it safely into the sluice." },
      { term: "Ralapanawa", definition: "A stone rip-rap lining placed along the inner face of a tank bund to protect the earthen dam from wave erosion." }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 6,
    unitName: "Historical Knowledge and Practical Application",
    bookPageStart: 77,
    bookPageEnd: 90,
    pdfPageStart: 87,
    pdfPageEnd: 100,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 6: Historical Knowledge and Practical Application (Book Pages 77–90 | PDF Pages 87–100)",
    matchingKeywords: [
      "historical knowledge and practical application", "historical knowledge & practical application",
      "social organization", "social hierarchy", "law and tradition", "courts", "environmental regulations",
      "agricultural regulations", "laws concerning crimes", "wewalkaetiya inscription", "badulla pillar inscription",
      "money and exchange", "beginning of coins", "kahapana", "women's contribution", "respect for women",
      "women as queens", "women as leaders", "environmental protection", "kuluwewa", "local food", "porridge",
      "yams", "healthy food habits", "nutritional value", "lesson 6", "unit 6"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u6-lo-01",
        description: "Evaluate ancient Sri Lankan social hierarchy, community legal codes (Wewalkaetiya decree), and market trade charters (Badulla inscription)",
        requiredConcepts: ["his-g10-u6-001", "his-g10-u6-002", "his-g10-u6-003"]
      },
      {
        id: "his-g10-u6-lo-02",
        description: "Assess the leadership status of women, indigenous food nutritional value, and traditional watershed/environmental conservation",
        requiredConcepts: ["his-g10-u6-004", "his-g10-u6-005", "his-g10-u6-006"]
      }
    ],
    concepts: [
      { id: "his-g10-u6-001", name: "Ancient Social Organization and Hierarchy (King → Sangha/Officials → Merchants → Public → Slaves)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["social hierarchy", "king", "maha sangha", "lay dignitaries", "merchants", "general public", "slaves", "horizontal and vertical relationships"] },
      { id: "his-g10-u6-002", name: "Judicial Decrees and Criminal Law (Wewalkaetiya Inscription & Dasagam Ettan)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["wewalkaetiya inscription", "king mihindu iv", "criminal law", "dasagam ettan", "punishments for theft and murder", "collective village responsibility"] },
      { id: "his-g10-u6-003", name: "Market Trade Regulations and Taxation Charters (Badulla Pillar Inscription / Hopitigama)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["badulla pillar inscription", "hopitigama trade market", "market regulations", "illegal tax prohibition", "traders protection", "king udaya iv"] },
      { id: "his-g10-u6-004", name: "Money, Coinage, and Units of Metal Exchange (Kahapana)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["beginning of coins", "kahapana", "metal as unit of exchange", "money systems", "coinage"] },
      { id: "his-g10-u6-005", name: "High Status and Leadership of Women in Ancient Society (Ruling Queens & Parumakalu)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["women's contribution", "respect for women", "women as queens", "queen anula", "queen leelawathi", "queen sugala", "queen kalyanawathi", "parumakalu"] },
      { id: "his-g10-u6-006", name: "Traditional Food Culture, Cereals, Porridge, and Nutritional Value", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["local food", "cereals", "porridge", "kola kenda", "yams", "vegetables", "healthy food habits", "nutritional value"] },
      { id: "his-g10-u6-007", name: "Traditional Environmental Practices and Watershed Conservation (Kuluwewa System)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["environmental protection", "traditional environmental practices", "kuluwewa", "catchment protection", "tree canopy", "water conservation today"] }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 7,
    unitName: "Decline of Ancient Cities in the Dry Zone",
    bookPageStart: 91,
    bookPageEnd: 105,
    pdfPageStart: 101,
    pdfPageEnd: 115,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 7: Decline of Ancient Cities in the Dry Zone (Book Pages 91–105 | PDF Pages 101–115)",
    matchingKeywords: [
      "decline of ancient cities in the dry zone", "decline of ancient cities", "first urbanization",
      "second urbanization", "downfall of polonnaruwa", "collapse of rajarata civilization", "shift of ruling centres",
      "kalinga magha", "dambadeniya", "yapahuwa", "kurunegala", "gampola", "kotte", "jaffna", "vanniyar areas",
      "vijayabahu iii", "parakramabahu ii", "bhuvanekabahu i", "parakramabahu vi", "south indian architectural influence",
      "ambakke devalaya", "sandesha literature", "totagamuwe sri rahula", "lesson 7", "unit 7"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u7-lo-01",
        description: "Analyze the internal and external causes (insecurity, trade route shifts, invasions, irrigation collapse) for the downfall of the Rajarata civilization",
        requiredConcepts: ["his-g10-u7-001", "his-g10-u7-002"]
      },
      {
        id: "his-g10-u7-lo-02",
        description: "Examine the political evolution of the South-Western kingdoms (Dambadeniya to Kotte) and the flourishing of Sandesha literature",
        requiredConcepts: ["his-g10-u7-003", "his-g10-u7-004", "his-g10-u7-005"]
      }
    ],
    concepts: [
      { id: "his-g10-u7-001", name: "First Urbanization and Emergence/Decline Factors of Ancient Cities", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["first urbanization", "emergence of cities", "trade route changes", "competition for trade", "decline of dry zone cities"] },
      { id: "his-g10-u7-002", name: "Causes for Downfall of Polonnaruwa and Rajarata Collapse (Kalinga Magha)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["downfall of polonnaruwa", "collapse of rajarata civilization", "kalinga magha invasion", "destruction of irrigation", "famine and malaria", "shift of capitals"] },
      { id: "his-g10-u7-003", name: "Second Urbanization and Shift to South-West (Dambadeniya, Yapahuwa, Kurunegala, Gampola)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["second urbanization", "dambadeniya kingdom", "king vijayabahu iii", "king parakramabahu ii", "yapahuwa rock fortress", "king bhuvanekabahu i", "kurunegala", "gampola", "jaffna", "vanniyar"] },
      { id: "his-g10-u7-004", name: "Kingdom of Kotte and Complete Political Unification (King Parakramabahu VI)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["kingdom of kotte", "king parakramabahu vi", "unification of sri lanka", "subjugation of jaffna", "sapumal kumaraya"] },
      { id: "his-g10-u7-005", name: "Economic/Cultural Changes, South Indian Architecture, and Sandesha Literature", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["sandesha literature", "totagamuwe sri rahula", "vidagama maithreya", "selalihini sandeshaya", "ambakke devalaya wood carvings", "south indian architectural influence"] }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 8,
    unitName: "Kandyan Kingdom",
    bookPageStart: 106,
    bookPageEnd: 117,
    pdfPageStart: 116,
    pdfPageEnd: 127,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 8: Kandyan Kingdom (Book Pages 106–117 | PDF Pages 116–127)",
    matchingKeywords: [
      "kandyan kingdom", "beginning and expansion", "administrative organization", "economic and social organization",
      "location of kandyan kingdom", "selection of kandy as capital", "wimaladharmasuriya i", "senarat",
      "rajasinghe ii", "wimaladharmasuriya ii", "sri veera parakrama narendra singhe", "powers of the king",
      "maha adikaram", "administrative divisions", "rata vasama", "disavani", "korale", "pattuwa", "village",
      "badde", "palace administration", "judicial system", "mahanaduwa", "gabadagamas", "nindagamas",
      "vihara and devalagamas", "paraveni lands", "rajakariya", "lesson 8", "unit 8"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u8-lo-01",
        description: "Trace the founding, mountain defense strategies, and major kings of the independent Kandyan Kingdom",
        requiredConcepts: ["his-g10-u8-001", "his-g10-u8-002"]
      },
      {
        id: "his-g10-u8-lo-02",
        description: "Analyze the Kandyan administrative hierarchy (King → Maha Adikaram → Disava), judicial courts (Mahanaduwa), and land tenure system (Rajakariya)",
        requiredConcepts: ["his-g10-u8-003", "his-g10-u8-004", "his-g10-u8-005"]
      }
    ],
    concepts: [
      { id: "his-g10-u8-001", name: "Establishment and Expansion of Kandy (Senasammatha Vikramabahu & Wimaladharmasuriya I)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["beginning and expansion", "selection of kandy as capital", "senasammatha vikramabahu", "king wimaladharmasuriya i", "sacred tooth relic in kandy", "battle of danture"] },
      { id: "his-g10-u8-002", name: "Great Kandyan Kings and Sovereignty Defense (Senarat, Rajasinghe II, Narendra Singhe)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["king rajasinghe ii", "king senarat", "king wimaladharmasuriya ii", "sri veera parakrama narendra singhe", "battle of gannoruwa", "treaty of 1638", "defending sovereignty"] },
      { id: "his-g10-u8-003", name: "Kandyan Administrative Hierarchy (King → Maha Adikaram → Rata Vasama / Disavani → Korale → Pattuwa)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["administrative organization", "powers of the king", "maha adikaram", "rata vasama", "disavani", "korale", "pattuwa", "village administration", "badde", "palace administration"] },
      { id: "his-g10-u8-004", name: "Kandyan Judicial System and Supreme Court (Mahanaduwa)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["judicial system", "mahanaduwa", "king as highest judicial authority", "regional judicial authorities", "disava courts"] },
      { id: "his-g10-u8-005", name: "Land Tenure, Rajakariya, and Rural Social Structure (Gabadagam, Nindagam, Viharagam)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["land-based organization", "king as owner of land", "gabadagamas", "nindagamas", "vihara and devalagamas", "paraveni lands", "rajakariya system", "caste-based occupations", "patriarchal family"] }
    ],
    definitions: [
      { term: "Maha Adikaram", definition: "The highest minister and second-in-command to the King in the administrative hierarchy of the Kandyan Kingdom." },
      { term: "Mahanaduwa", definition: "The Great Court of Justice and supreme judicial tribunal presided over by the King and chief ministers in the Kandyan Kingdom." },
      { term: "Rajakariya", definition: "The traditional system of compulsory service rendered to the King, state, or temple in exchange for the tenure and use of land." }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 9,
    unitName: "Renaissance in Europe",
    bookPageStart: 118,
    bookPageEnd: 126,
    pdfPageStart: 128,
    pdfPageEnd: 136,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 9: Renaissance in Europe (Book Pages 118–126 | PDF Pages 128–136)",
    matchingKeywords: [
      "renaissance in europe", "renaissance", "introduction to the renaissance", "historical background of renaissance",
      "meaning of renaissance", "fall of constantinople", "capture of constantinople by the turks", "development of trade",
      "growth of knowledge", "criticism of church authority", "humanism", "revival of learning", "leonardo da vinci",
      "michelangelo", "arts and crafts", "emergence of nation states", "rise of middle class", "gutenberg printing press",
      "advancement of science", "geographical discoveries", "new trade routes", "vasco da gama", "columbus",
      "impact of renaissance on sri lanka", "lesson 9", "unit 9"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u9-lo-01",
        description: "Explain the background, causes (Fall of Constantinople, trade, printing press), and humanist philosophy of the European Renaissance",
        requiredConcepts: ["his-g10-u9-001", "his-g10-u9-002"]
      },
      {
        id: "his-g10-u9-lo-02",
        description: "Analyze Renaissance achievements in arts, literature, science, and the Age of Geographical Discoveries",
        requiredConcepts: ["his-g10-u9-003", "his-g10-u9-004"]
      },
      {
        id: "his-g10-u9-lo-03",
        description: "Assess the global political, economic, and cultural impacts of the Renaissance on Sri Lanka",
        requiredConcepts: ["his-g10-u9-005"]
      }
    ],
    concepts: [
      { id: "his-g10-u9-001", name: "Meaning, Nature, and Causes of the Renaissance (Constantinople 1453 & Trade Expansion)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["meaning of renaissance", "awakening in politics economy religion", "capture of constantinople by the turks", "development of trade", "growth of knowledge", "criticism of church authority"] },
      { id: "his-g10-u9-002", name: "Humanism and Revival of Classical Learning", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["humanism", "revival of learning", "greek and roman classics", "florence italy", "patronage of medici family", "individual dignity"] },
      { id: "his-g10-u9-003", name: "Masterpieces of Renaissance Art, Literature, Printing Press, and Scientific Advancements", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["leonardo da vinci", "mona lisa", "michelangelo", "sistine chapel", "gutenberg printing press", "advancement of science", "copernicus", "galileo", "new ideas about universe"] },
      { id: "his-g10-u9-004", name: "Age of Exploration and New Maritime Trade Routes (Vasco da Gama & Columbus)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["geographical discoveries", "new trade routes", "exploration", "vasco da gama", "christopher columbus", "mariner compass", "sea route to india"] },
      { id: "his-g10-u9-005", name: "Impact of the Renaissance and Western Expansion on Sri Lanka (Political, Economic, Cultural)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["impact of renaissance on sri lanka", "political impact", "economic impact", "cultural impact", "commercial expansion", "spice trade", "preserving identity while facing global trends"] }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 10,
    unitName: "Sri Lanka and the Western World",
    bookPageStart: 127,
    bookPageEnd: 142,
    pdfPageStart: 137,
    pdfPageEnd: 152,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 10: Sri Lanka and the Western World (Book Pages 127–142 | PDF Pages 137–152)",
    matchingKeywords: [
      "sri lanka and the western world", "arrival of the portuguese", "arrival of the portuguese in asia",
      "reasons for european interest", "economic profits", "spread of religion", "political situation of sri lanka",
      "division of kotte", "kotte", "kandy", "jaffna", "competition for kotte throne", "portuguese capture of maritime areas",
      "establishment of portuguese power in kotte", "conquest of jaffna", "resistance to portuguese power", "mayadunne",
      "rajasinghe i", "battle of mulleriyawa", "kandyan opposition", "ousting of the portuguese", "arrival of the dutch",
      "rajasinghe ii's opposition", "dutch involvement", "capture of coastal areas", "diplomatic strategy towards kandy",
      "dutch control of coastal areas", "transfer to the british", "lourenco de almeida 1505", "vijayaba kollaya",
      "treaty of 1638", "dutch voc", "roman-dutch law", "lesson 10", "unit 10"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u10-lo-01",
        description: "Analyze the reasons for Portuguese arrival (1505), the internal political disunity in Sri Lanka, and the division of Kotte (Vijayaba Kollaya)",
        requiredConcepts: ["his-g10-u10-001", "his-g10-u10-002"]
      },
      {
        id: "his-g10-u10-lo-02",
        description: "Describe the military resistance against the Portuguese led by Mayadunne, King Rajasinghe I (Battle of Mulleriyawa), and Kandyan kings",
        requiredConcepts: ["his-g10-u10-003", "his-g10-u10-004"]
      },
      {
        id: "his-g10-u10-lo-03",
        description: "Examine the Dutch alliance with King Rajasinghe II (Treaty of 1638), the expulsion of the Portuguese, and Dutch VOC administrative/legal rule",
        requiredConcepts: ["his-g10-u10-005", "his-g10-u10-006"]
      }
    ],
    concepts: [
      { id: "his-g10-u10-001", name: "Reasons for European/Portuguese Arrival (Economic, Religious, Political, Maritime Position)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["reasons for european interest", "economic profits", "spread of religion", "political influence", "geographical position on east-west route", "lourenco de almeida 1505"] },
      { id: "his-g10-u10-002", name: "Political Disunity in Sri Lanka and the Partition of Kotte (Vijayaba Kollaya 1521)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["political situation of sri lanka", "division among kotte kandy jaffna", "competition for kotte throne", "vijayaba kollaya 1521", "bhuvanekabahu vii", "mayadunne", "rayigam bandara", "dharmapala"] },
      { id: "his-g10-u10-003", name: "Sitawaka Kingdom's Heroic Resistance and Battle of Mulleriyawa (Mayadunne & Rajasinghe I)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["resistance to portuguese power", "mayadunne", "king rajasinghe i", "battle of mulleriyawa 1562", "siege of colombo", "sitawaka military victories"] },
      { id: "his-g10-u10-004", name: "Portuguese Conquest of Maritime Areas, Jaffna (1619), and Kandyan Opposition", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["conquest of jaffna 1619", "portuguese expansion", "kandyan opposition", "battle of danture", "battle of randeniwela"] },
      { id: "his-g10-u10-005", name: "Arrival of the Dutch, Treaty of 1638, and Ousting of the Portuguese (1638–1658)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["arrival of the dutch", "rajasinghe ii's opposition", "treaty of 1638", "westerwold", "capture of coastal areas", "fall of colombo 1656", "ousting of the portuguese"] },
      { id: "his-g10-u10-006", name: "Dutch Administrative System, VOC Monopolies, Roman-Dutch Law, and Transfer to British (1796)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["dutch control of coastal areas", "dutch voc administration", "roman-dutch law", "cinnamon monopoly", "tombu registers", "canal network", "transfer to the british 1796"] }
    ]
  },
];

/**
 * Normalizes Python/SQLAlchemy or standard PostgreSQL connection strings
 * for use with node-postgres (pg).
 */
export function normalizePostgresUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  url = url.replace(/^postgresql\+[a-zA-Z0-9_-]+:\/\//i, "postgresql://");
  url = url.replace(/^postgres\+[a-zA-Z0-9_-]+:\/\//i, "postgres://");
  return url;
}

export class CurriculumDbService {
  private pool: Pool | null = null;
  private connectionString: string;

  constructor() {
    this.connectionString = normalizePostgresUrl(config.curriculumDb.url);
  }

  public isConfigured(): boolean {
    return this.connectionString.length > 0;
  }

  /**
   * Returns or initializes the PostgreSQL connection pool.
   */
  private getPool(): Pool {
    if (!this.isConfigured()) {
      throw new Error("CURRICULUM_DB_URL or DB_URL is not configured");
    }

    if (!this.pool) {
      const isNeonOrRemote =
        this.connectionString.includes("neon.tech") ||
        this.connectionString.includes("aws") ||
        this.connectionString.includes("sslmode=require");

      const poolConfig: PoolConfig = {
        connectionString: this.connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      };

      if (isNeonOrRemote) {
        poolConfig.ssl = { rejectUnauthorized: false };
      }

      this.pool = new Pool(poolConfig);

      this.pool.on("error", (err) => {
        console.warn("⚠️ Unexpected error on idle PostgreSQL client:", err.message);
      });
    }

    return this.pool;
  }

  /**
   * Health check for PostgreSQL database connection.
   */
  public async checkDatabaseHealth(): Promise<CurriculumDbHealth> {
    try {
      const pool = this.getPool();
      const countRes = await pool.query(
        `SELECT 
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE status = 'done') as done_count
         FROM jobs`
      );

      const totalJobs = parseInt(countRes.rows[0]?.total_count || "0", 10);
      const doneJobs = parseInt(countRes.rows[0]?.done_count || "0", 10);

      return {
        isConnected: true,
        totalJobs,
        doneJobs,
        database: "PostgreSQL (Neon)",
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn("⚠️ Curriculum PostgreSQL DB connection check failed:", msg);
      return {
        isConnected: false,
        totalJobs: 0,
        doneJobs: 0,
        database: "PostgreSQL (Neon)",
        error: msg,
      };
    }
  }

  /**
   * Returns authoritative Table of Contents page boundaries for a given subject, grade, and topic.
   */
  public getChapterPageBounds(
    subject: string,
    grade: number,
    topicHint: string
  ): ChapterPageBounds | null {
    const sLower = (subject || "").toLowerCase();
    const tLower = (topicHint || "").toLowerCase();

    // 1. Exact match on subject + grade + unit name / keywords
    const candidates = TEXTBOOK_TOC_REGISTRY.filter(
      (c) =>
        (c.subject.toLowerCase() === sLower ||
          (sLower === "biology" && c.subject === "Science") ||
          (sLower === "chemistry" && c.subject === "Science") ||
          (sLower === "physics" && c.subject === "Science")) &&
        (grade === 0 || c.grade === grade)
    );

    if (candidates.length === 0) {
      return this.matchChapterFromTopic(topicHint);
    }

    // Direct unit name match
    for (const c of candidates) {
      const uName = c.unitName.toLowerCase();
      if (uName === tLower || tLower.includes(uName) || uName.includes(tLower)) {
        return c;
      }
    }

    // Keyword match
    let bestMatch: ChapterPageBounds | null = null;
    let bestScore = 0;

    for (const c of candidates) {
      const hits = c.matchingKeywords.filter((kw) => tLower.includes(kw.toLowerCase())).length;
      if (hits > bestScore) {
        bestScore = hits;
        bestMatch = c;
      }
    }

    if (bestMatch && bestScore > 0) {
      return bestMatch;
    }

    return candidates[0] || null;
  }

  /**
   * Matches a chapter solely from topic text.
   */
  public matchChapterFromTopic(topic: string, subject?: string, grade?: number): ChapterPageBounds | null {
    const tLower = (topic || "").toLowerCase().trim();
    if (!tLower) return null;

    for (const c of TEXTBOOK_TOC_REGISTRY) {
      if (subject && c.subject.toLowerCase() !== subject.toLowerCase() && c.subject !== "Science") {
        continue;
      }
      if (grade && grade > 0 && c.grade !== grade) {
        continue;
      }
      const uName = c.unitName.toLowerCase();
      if (uName === tLower || tLower.includes(uName) || (tLower.length >= 5 && uName.includes(tLower))) {
        return c;
      }
      const hits = c.matchingKeywords.filter((kw) => tLower.includes(kw.toLowerCase())).length;
      if (hits >= 2) {
        return c;
      }
    }

    return null;
  }

  /**
   * Returns all available textbook chapters and page ranges registered in the system.
   */
  public getAvailableTextbookChapters(subject?: string, grade?: number): ChapterPageBounds[] {
    return TEXTBOOK_TOC_REGISTRY.filter((c) => {
      if (subject && c.subject.toLowerCase() !== subject.toLowerCase()) return false;
      if (grade && grade > 0 && c.grade !== grade) return false;
      return true;
    });
  }

  /**
   * Returns all available subject names from the database registry.
   */
  public getAllRegisteredSubjects(): string[] {
    const set = new Set<string>();
    for (const c of TEXTBOOK_TOC_REGISTRY) {
      set.add(c.subject);
    }
    return Array.from(set);
  }

  /**
   * Retrieves all completed ingestion jobs from PostgreSQL.
   */
  public async getCompletedCurriculumJobs(): Promise<CurriculumJob[]> {
    try {
      const pool = this.getPool();
      const res = await pool.query<CurriculumJob>(
        `SELECT 
          job_id,
          user_id,
          filename,
          minio_object_key,
          qdrant_collection,
          status,
          progress,
          current_stage,
          chunks_created,
          pages_processed,
          error_message,
          started_at,
          completed_at
         FROM jobs
         WHERE status = 'done'
         ORDER BY completed_at DESC NULLS LAST, started_at DESC`
      );

      return res.rows;
    } catch (error) {
      console.warn(
        "⚠️ Failed to fetch completed jobs from PostgreSQL:",
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Retrieves unique ingested textbooks directly from PostgreSQL.
   */
  public async getUniqueCurriculumTextbooks(): Promise<CurriculumTextbookInfo[]> {
    try {
      const pool = this.getPool();
      const res = await pool.query(
        `SELECT DISTINCT ON (filename)
          filename,
          job_id,
          COALESCE(chunks_created, 0) as chunks_created,
          COALESCE(pages_processed, 0) as pages_processed,
          status,
          completed_at
         FROM jobs
         WHERE status = 'done'
         ORDER BY filename, completed_at DESC NULLS LAST`
      );

      return res.rows.map((row) => ({
        filename: row.filename,
        job_id: String(row.job_id),
        chunks_created: parseInt(row.chunks_created, 10) || 0,
        pages_processed: parseInt(row.pages_processed, 10) || 0,
        status: row.status,
        completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      }));
    } catch (error) {
      console.warn(
        "⚠️ Failed to fetch unique curriculum textbooks from PostgreSQL:",
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Retrieves a single job by its UUID.
   */
  public async getJobById(jobId: string): Promise<CurriculumJob | null> {
    try {
      const pool = this.getPool();
      const res = await pool.query<CurriculumJob>(
        `SELECT 
          job_id,
          user_id,
          filename,
          minio_object_key,
          qdrant_collection,
          status,
          progress,
          current_stage,
          chunks_created,
          pages_processed,
          error_message,
          started_at,
          completed_at
         FROM jobs
         WHERE job_id = $1`,
        [jobId]
      );

      return res.rows[0] || null;
    } catch (error) {
      console.warn(`⚠️ Failed to fetch job ${jobId} from PostgreSQL:`, error);
      return null;
    }
  }

  /**
   * Closes the connection pool.
   */
  public async closePool(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export const curriculumDbService = new CurriculumDbService();
