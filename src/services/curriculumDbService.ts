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

// Chapter pages and topics from Sri Lankan school textbooks.
export const TEXTBOOK_TOC_REGISTRY: ChapterPageBounds[] = [
  // Grade 10 Science, units 1 to 12. PDF offset: 14.
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

  // Grade 11 Science Part 1, units 1 to 8. PDF offset: 10.
  {
    subject: "Science",
    grade: 11,
    unitNumber: 1,
    unitName: "Living Tissues",
    bookPageStart: 1,
    bookPageEnd: 19,
    pdfPageStart: 11,
    pdfPageEnd: 29,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-1.pdf",
    textbookReference: "Grade 11 Science (Part 1) — Unit 1: Living Tissues (Book Pages 1–19 | PDF Pages 11–29)",
    matchingKeywords: [
      "living tissues", "plant tissues", "animal tissues", "meristematic tissue", "permanent tissue",
      "simple permanent tissue", "complex permanent tissue", "parenchyma", "collenchyma", "sclerenchyma",
      "xylem", "phloem", "epithelial tissues", "connective tissue", "muscular tissue", "nervous tissue",
      "blood", "smooth muscle", "cardiac muscle", "skeletal muscle", "neuron", "nerve cell", "lesson 1", "unit 1"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-tis-lo-01",
        description: "Distinguish between meristematic and permanent plant tissues and describe simple permanent tissues (parenchyma, collenchyma, sclerenchyma)",
        requiredConcepts: ["sci-g11-tis-001", "sci-g11-tis-002", "sci-g11-tis-003"]
      },
      {
        id: "sci-g11-tis-lo-02",
        description: "Identify xylem and phloem as complex permanent tissues and explain their structural characteristics and functions",
        requiredConcepts: ["sci-g11-tis-004", "sci-g11-tis-005"]
      },
      {
        id: "sci-g11-tis-lo-03",
        description: "Describe the structure, functions, and locations of epithelial, connective (blood), muscular, and nervous animal tissues",
        requiredConcepts: ["sci-g11-tis-006", "sci-g11-tis-007", "sci-g11-tis-008", "sci-g11-tis-009"]
      }
    ],
    concepts: [
      { id: "sci-g11-tis-001", name: "Meristematic Tissues (Apical, Intercalary, Lateral)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["meristematic tissue", "apical meristem", "intercalary meristem", "lateral meristem", "actively dividing cells", "dense cytoplasm", "prominent nucleus"] },
      { id: "sci-g11-tis-002", name: "Simple Permanent Tissues (Parenchyma, Collenchyma, Sclerenchyma)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["simple permanent tissue", "parenchyma", "collenchyma", "sclerenchyma", "sclerenchyma fibres", "sclereids", "lignified cell wall", "pectin thickening"] },
      { id: "sci-g11-tis-003", name: "Functions of Simple Plant Tissues (Photosynthesis, Storage, Mechanical Support)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["parenchyma food storage", "chlorenchyma photosynthesis", "collenchyma mechanical support", "sclerenchyma rigidity", "tensile strength"] },
      { id: "sci-g11-tis-004", name: "Xylem Complex Permanent Tissue (Vessels, Tracheids, Parenchyma, Fibres)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["xylem tissue", "xylem vessels", "tracheids", "water transport", "mineral transport", "unidirectional conduction", "lignin thickening", "xylem parenchyma"] },
      { id: "sci-g11-tis-005", name: "Phloem Complex Permanent Tissue (Sieve Tubes, Companion Cells)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["phloem tissue", "sieve tube elements", "companion cells", "phloem parenchyma", "phloem fibres", "translocation of food", "sucrose conduction", "sieve plate"] },
      { id: "sci-g11-tis-006", name: "Epithelial Animal Tissues (Simple and Stratified)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["epithelial tissue", "simple epithelium", "stratified epithelium", "squamous epithelium", "cuboidal epithelium", "columnar epithelium", "ciliated epithelium", "basement membrane", "protective lining"] },
      { id: "sci-g11-tis-007", name: "Connective Tissues and Blood as a Fluid Connective Tissue", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["connective tissue", "blood tissue", "red blood cells", "white blood cells", "platelets", "blood plasma", "cartilage", "bone", "adipose tissue", "loose connective tissue"] },
      { id: "sci-g11-tis-008", name: "Muscular Tissues (Skeletal, Smooth, and Cardiac Muscles)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["muscular tissue", "skeletal muscle", "voluntary striated", "smooth muscle", "involuntary unstriated spindle shaped", "cardiac muscle", "branched intercalated discs"] },
      { id: "sci-g11-tis-009", name: "Nervous Tissue and Structure of a Neuron", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["nervous tissue", "neuron", "nerve cell", "cell body cyton", "dendrites", "axon", "myelin sheath", "schwann cell", "synapse", "nerve impulse transmission"] }
    ],
    definitions: [
      { term: "Meristematic Tissue", definition: "Plant tissue composed of undifferentiated, actively dividing cells responsible for plant growth.", conceptId: "sci-g11-tis-001" },
      { term: "Simple Permanent Tissue", definition: "Plant tissue made up of only one type of cell having a common origin, structure, and function (e.g., parenchyma, collenchyma, sclerenchyma).", conceptId: "sci-g11-tis-002" },
      { term: "Complex Permanent Tissue", definition: "Plant tissue composed of more than one type of cell working together as a functional unit to conduct substances (e.g., xylem and phloem).", conceptId: "sci-g11-tis-004" },
      { term: "Neuron", definition: "The structural and functional unit of nervous tissue specialized for conducting electrical nerve impulses.", conceptId: "sci-g11-tis-009" }
    ],
    expectedDiagrams: [
      "Parenchyma, collenchyma, and sclerenchyma cell structures (cross-section)",
      "Xylem vessel and phloem sieve tube with companion cell",
      "Structure of a motor neuron (Cyton, dendrites, axon, myelin sheath)",
      "Comparison of skeletal, smooth, and cardiac muscle fibres"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 2,
    unitName: "Photosynthesis",
    bookPageStart: 20,
    bookPageEnd: 29,
    pdfPageStart: 30,
    pdfPageEnd: 39,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-1.pdf",
    textbookReference: "Grade 11 Science (Part 1) — Unit 2: Photosynthesis (Book Pages 20–29 | PDF Pages 30–39)",
    matchingKeywords: [
      "photosynthesis", "factors that affect photosynthesis", "products of photosynthesis",
      "importance of photosynthesis", "carbon dioxide", "water", "light energy", "chlorophyll",
      "starch test", "glucose", "oxygen byproduct", "hydrilla experiment", "potassium hydroxide koh",
      "balanced chemical equation for photosynthesis", "lesson 2", "unit 2"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-pho-lo-01",
        description: "Explain what photosynthesis is, state the balanced chemical equation, and describe the internal and external factors required",
        requiredConcepts: ["sci-g11-pho-001", "sci-g11-pho-002", "sci-g11-pho-003"]
      },
      {
        id: "sci-g11-pho-lo-02",
        description: "Conduct and explain experimental activities proving the necessity of CO2, light energy, and chlorophyll, and identifying end products",
        requiredConcepts: ["sci-g11-pho-004", "sci-g11-pho-005", "sci-g11-pho-006"]
      },
      {
        id: "sci-g11-pho-lo-03",
        description: "Assess the ecological and economic importance of photosynthesis in maintaining atmospheric balance and energy flow",
        requiredConcepts: ["sci-g11-pho-007"]
      }
    ],
    concepts: [
      { id: "sci-g11-pho-001", name: "Concept and Definition of Photosynthesis", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["photosynthesis definition", "autotrophic nutrition", "radiant energy to chemical energy", "synthesis of organic food"] },
      { id: "sci-g11-pho-002", name: "Factors Essential for Photosynthesis (CO2, H2O, Light, Chlorophyll)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["factors affecting photosynthesis", "carbon dioxide concentration", "water supply", "light intensity", "chlorophyll pigment", "temperature optimum"] },
      { id: "sci-g11-pho-003", name: "Balanced Chemical Equation of Photosynthesis", weight: 5, isFrequentlyTested: true, category: "formula", keywords: ["photosynthesis chemical equation", "6co2 + 6h2o -> c6h12o6 + 6o2", "balanced equation", "glucose and oxygen"] },
      { id: "sci-g11-pho-004", name: "Proving the Necessity of CO2, Light, and Chlorophyll", weight: 5, isFrequentlyTested: true, category: "experiment", keywords: ["destarched plant", "koh absorbs co2", "bell jar experiment", "black paper light screen", "variegated leaf chlorophyll test", "croton coleus leaf"] },
      { id: "sci-g11-pho-005", name: "Identification of Products (Starch and Oxygen Gas)", weight: 5, isFrequentlyTested: true, category: "experiment", keywords: ["iodine test for starch in leaf", "boiling in water", "decolorizing with ethanol in water bath", "hydrilla funnel experiment", "oxygen glowing splint test"] },
      { id: "sci-g11-pho-006", name: "Storage and Translocation of Photosynthetic Products", weight: 4, isFrequentlyTested: true, category: "process", keywords: ["glucose converted to sucrose", "phloem translocation", "storage as starch", "fats and proteins synthesis"] },
      { id: "sci-g11-pho-007", name: "Ecological Importance of Photosynthesis", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["importance of photosynthesis", "o2 co2 balance", "carbon cycle primary productivity", "solar energy capture", "fossil fuels biomass"] }
    ],
    definitions: [
      { term: "Photosynthesis", definition: "The biochemical process by which green plants synthesize glucose and oxygen from carbon dioxide and water using radiant solar energy absorbed by chlorophyll.", conceptId: "sci-g11-pho-001" }
    ],
    formulae: [
      "6CO2 + 6H2O --(Light & Chlorophyll)--> C6H12O6 + 6O2"
    ],
    expectedDiagrams: [
      "Experimental setup showing necessity of light (black paper strip on destarched leaf)",
      "Experimental setup showing necessity of CO2 (KOH solution in bell jar/conical flask)",
      "Hydrilla funnel experiment collecting oxygen gas over water",
      "Steps in leaf starch testing (boiling water -> warm ethanol bath -> iodine test)"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 3,
    unitName: "Mixtures",
    bookPageStart: 30,
    bookPageEnd: 71,
    pdfPageStart: 40,
    pdfPageEnd: 81,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-1.pdf",
    textbookReference: "Grade 11 Science (Part 1) — Unit 3: Mixtures (Book Pages 30–71 | PDF Pages 40–81)",
    matchingKeywords: [
      "mixtures", "type of mixtures", "composition of mixtures", "separation of compounds in mixtures",
      "homogeneous mixtures", "heterogeneous mixtures", "solubility", "factors affecting solubility",
      "mass fraction", "volume fraction", "mole fraction", "concentration", "standard solution",
      "mechanical separation", "evaporation", "filtration", "crystallization", "recrystallization",
      "solvent extraction", "simple distillation", "fractional distillation", "steam distillation",
      "chromatography", "salt production from sea water", "extraction of essential oils", "cinnamon oil", "citronella oil", "lesson 3", "unit 3"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-mix-lo-01",
        description: "Classify mixtures into homogeneous and heterogeneous systems and investigate the factors affecting solubility",
        requiredConcepts: ["sci-g11-mix-001", "sci-g11-mix-002", "sci-g11-mix-003"]
      },
      {
        id: "sci-g11-mix-lo-02",
        description: "Express mixture composition using mass fraction, volume fraction, mole fraction, and molar concentration, and prepare standard solutions",
        requiredConcepts: ["sci-g11-mix-004", "sci-g11-mix-005", "sci-g11-mix-006"]
      },
      {
        id: "sci-g11-mix-lo-03",
        description: "Describe laboratory and industrial separation techniques (distillation, extraction, chromatography, sea salt harvesting, essential oil extraction)",
        requiredConcepts: ["sci-g11-mix-007", "sci-g11-mix-008", "sci-g11-mix-009", "sci-g11-mix-010"]
      }
    ],
    concepts: [
      { id: "sci-g11-mix-001", name: "Homogeneous and Heterogeneous Mixtures", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["homogeneous mixture", "heterogeneous mixture", "solutions", "suspensions", "colloids", "uniform composition"] },
      { id: "sci-g11-mix-002", name: "Solubility and Saturated Solutions", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["solubility definition", "maximum mass dissolved in 100g solvent", "saturated solution", "unsaturated solution", "supersaturated"] },
      { id: "sci-g11-mix-003", name: "Factors Affecting Solubility (Solute/Solvent Nature, Temperature)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["factors affecting solubility", "nature of solute", "nature of solvent", "temperature effect on solubility", "solubility curve"] },
      { id: "sci-g11-mix-004", name: "Composition by Mass Fraction, Volume Fraction, and Mole Fraction", weight: 5, isFrequentlyTested: true, category: "formula", keywords: ["mass fraction w/w", "volume fraction v/v", "mole fraction X", "percentage composition", "fraction calculation"] },
      { id: "sci-g11-mix-005", name: "Concentration of Solutions (m/v and n/v Molarity)", weight: 5, isFrequentlyTested: true, category: "calculation", keywords: ["concentration n/v", "molar concentration", "mol dm-3", "m/v composition", "g dm-3", "c = n/v", "n = m/M"] },
      { id: "sci-g11-mix-006", name: "Preparation of Standard Solutions", weight: 5, isFrequentlyTested: true, category: "experiment", keywords: ["standard solution preparation", "volumetric flask", "primary standard", "accurate weighing", "dissolution and dilution to meniscus"] },
      { id: "sci-g11-mix-007", name: "Basic Separation Techniques (Filtration, Evaporation, Crystallization, Recrystallization)", weight: 4, isFrequentlyTested: true, category: "process", keywords: ["mechanical separation", "filtration", "evaporation", "crystallization", "recrystallization", "purification of solids"] },
      { id: "sci-g11-mix-008", name: "Advanced Separation (Simple Distillation, Fractional Distillation, Steam Distillation, Solvent Extraction)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["simple distillation", "fractional distillation", "fractionating column", "steam distillation", "solvent extraction", "separating funnel", "immiscible liquids", "boiling point difference"] },
      { id: "sci-g11-mix-009", name: "Paper Chromatography and Separation of Pigments", weight: 4, isFrequentlyTested: true, category: "process", keywords: ["chromatography", "paper chromatography", "stationary phase", "mobile phase", "rf value", "separation of dyes"] },
      { id: "sci-g11-mix-010", name: "Industrial Applications: Sea Salt Production and Essential Oil Extraction", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["salt production from sea water", "salterns", "evaporation pans", "crystallization of nacl", "removal of caco3 and caso4", "extraction of essential oils", "cinnamon oil", "citronella oil steam distillation"] }
    ],
    definitions: [
      { term: "Solubility", definition: "The maximum mass of a solute that can dissolve completely in 100 g of a given solvent at a specified temperature to form a saturated solution.", conceptId: "sci-g11-mix-002" },
      { term: "Concentration (Molarity)", definition: "The amount of solute in moles dissolved in one cubic decimeter (1 dm³ or 1 L) of solution (mol dm⁻³).", conceptId: "sci-g11-mix-005" },
      { term: "Standard Solution", definition: "A solution whose exact concentration is accurately known and prepared using a volumetric flask.", conceptId: "sci-g11-mix-006" }
    ],
    formulae: [
      "Mass fraction = (Mass of component / Total mass of mixture)",
      "Volume fraction = (Volume of component / Total volume of mixture)",
      "Mole fraction (XA) = nA / (nA + nB + ...)",
      "Concentration c (mol dm⁻³) = n / V = (m / M) / V"
    ],
    expectedDiagrams: [
      "Simple distillation apparatus (Distillation flask, Liebig condenser, thermometer, receiving flask)",
      "Fractional distillation apparatus with fractionating column",
      "Steam distillation apparatus for essential oil extraction",
      "Separating funnel setup for solvent extraction",
      "Saltern layout showing reservoir, condenser pans, and crystallizer pans"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 4,
    unitName: "Waves and Their Applications",
    bookPageStart: 72,
    bookPageEnd: 104,
    pdfPageStart: 82,
    pdfPageEnd: 114,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-1.pdf",
    textbookReference: "Grade 11 Science (Part 1) — Unit 4: Waves and Their Applications (Book Pages 72–104 | PDF Pages 82–114)",
    matchingKeywords: [
      "waves and their applications", "mechanical waves", "electromagnetic waves", "sound",
      "transverse waves", "longitudinal waves", "frequency", "wavelength", "amplitude", "wave speed",
      "v=fλ", "electromagnetic spectrum", "radio waves", "microwaves", "infrared", "ultraviolet",
      "x-rays", "gamma rays", "speed of sound", "characteristics of sound", "pitch", "loudness",
      "quality", "timbre", "audible range", "infrasound", "ultrasound", "sonar", "lesson 4", "unit 4"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-wav-lo-01",
        description: "Distinguish between transverse and longitudinal mechanical waves and analyze wave parameters (frequency, wavelength, amplitude, wave equation v = fλ)",
        requiredConcepts: ["sci-g11-wav-001", "sci-g11-wav-002", "sci-g11-wav-003"]
      },
      {
        id: "sci-g11-wav-lo-02",
        description: "Explain the nature of electromagnetic waves and identify the order, properties, and applications of the electromagnetic spectrum",
        requiredConcepts: ["sci-g11-wav-004", "sci-g11-wav-005"]
      },
      {
        id: "sci-g11-wav-lo-03",
        description: "Analyze sound wave propagation, order of speed in media, characteristics of musical sounds (pitch, loudness, quality), and audible/ultrasound frequencies",
        requiredConcepts: ["sci-g11-wav-006", "sci-g11-wav-007", "sci-g11-wav-008", "sci-g11-wav-009"]
      }
    ],
    concepts: [
      { id: "sci-g11-wav-001", name: "Nature of Wave Motion and Energy Transfer", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["wave motion", "transfer of energy without matter", "oscillations", "periodic disturbance"] },
      { id: "sci-g11-wav-002", name: "Transverse vs Longitudinal Waves", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["transverse waves", "crests and troughs", "perpendicular vibration", "longitudinal waves", "compressions and rarefactions", "parallel vibration", "slinky spring"] },
      { id: "sci-g11-wav-003", name: "Wave Parameters and Wave Equation (v = fλ)", weight: 5, isFrequentlyTested: true, category: "formula", keywords: ["frequency f", "wavelength lambda", "wave speed v", "amplitude A", "period T", "v = fλ", "v=f lambda", "displacement distance graph", "displacement time graph"] },
      { id: "sci-g11-wav-004", name: "Electromagnetic Wave Propagation and Characteristics", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["electromagnetic waves", "oscillating electric and magnetic fields", "no medium required", "speed 3x10^8 m s-1", "transverse nature", "travels in vacuum"] },
      { id: "sci-g11-wav-005", name: "Electromagnetic Spectrum and Applications", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["electromagnetic spectrum", "radio waves telecommunication", "microwaves radar oven", "infrared thermal imaging", "visible light", "ultraviolet sterilization", "x-rays medical imaging", "gamma rays cancer therapy"] },
      { id: "sci-g11-wav-006", name: "Sound Waves as Longitudinal Mechanical Waves", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["sound waves", "longitudinal nature of sound", "requires material medium", "vacuum bell jar sound experiment"] },
      { id: "sci-g11-wav-007", name: "Speed of Sound in Solids, Liquids, and Gases", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["speed of sound", "speed in solids > liquids > gases", "330-340 ms-1 in air", "1500 ms-1 in water", "5000 ms-1 in steel"] },
      { id: "sci-g11-wav-008", name: "Characteristics of Sound (Pitch, Loudness, Quality/Timbre)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["pitch depends on frequency", "loudness depends on amplitude", "quality timbre depends on waveform and source", "musical instruments strings air membranes"] },
      { id: "sci-g11-wav-009", name: "Audible Range, Infrasound, and Ultrasound Applications", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["audible range 20hz to 20000hz", "infrasound below 20hz", "ultrasound above 20khz", "sonar depth finding", "echolocation bats", "medical ultrasound scan"] }
    ],
    definitions: [
      { term: "Transverse Wave", definition: "A wave in which the particles of the medium oscillate perpendicular to the direction of wave propagation.", conceptId: "sci-g11-wav-002" },
      { term: "Longitudinal Wave", definition: "A wave in which the particles of the medium oscillate parallel to the direction of wave propagation.", conceptId: "sci-g11-wav-002" },
      { term: "Pitch", definition: "The characteristic of sound that depends on frequency, determining how high or low a sound feels.", conceptId: "sci-g11-wav-008" },
      { term: "Ultrasound", definition: "Sound waves with frequencies greater than the upper limit of human hearing (above 20,000 Hz / 20 kHz).", conceptId: "sci-g11-wav-009" }
    ],
    formulae: [
      "Wave equation: v = f × λ",
      "Period-Frequency relation: T = 1 / f",
      "Speed of wave in vacuum: c = 3 × 10⁸ m s⁻¹"
    ],
    expectedDiagrams: [
      "Displacement-distance graph showing wavelength (λ) and amplitude (A)",
      "Displacement-time graph showing period (T) and amplitude (A)",
      "Longitudinal wave showing compressions and rarefactions",
      "Electromagnetic spectrum chart (Radio → Microwave → IR → Visible → UV → X-ray → Gamma)"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 5,
    unitName: "Geometrical Optics",
    bookPageStart: 105,
    bookPageEnd: 142,
    pdfPageStart: 115,
    pdfPageEnd: 152,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-1.pdf",
    textbookReference: "Grade 11 Science (Part 1) — Unit 5: Geometrical Optics (Book Pages 105–142 | PDF Pages 115–152)",
    matchingKeywords: [
      "geometrical optics", "reflection of light", "curved mirrors", "spherical mirrors",
      "concave mirror", "convex mirror", "pole", "centre of curvature", "principal focus", "focal length",
      "refraction of light", "laws of refraction", "snell's law", "refractive index", "critical angle",
      "total internal reflection", "lenses", "convex lens", "concave lens", "simple microscope", "ray diagrams", "lesson 5", "unit 5"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-opt-lo-01",
        description: "Apply the laws of reflection and construct ray diagrams for concave and convex spherical mirrors at various object positions",
        requiredConcepts: ["sci-g11-opt-001", "sci-g11-opt-002", "sci-g11-opt-003"]
      },
      {
        id: "sci-g11-opt-lo-02",
        description: "Explain the laws of refraction, refractive index, critical angle, and total internal reflection with real-world applications",
        requiredConcepts: ["sci-g11-opt-004", "sci-g11-opt-005", "sci-g11-opt-006"]
      },
      {
        id: "sci-g11-opt-lo-03",
        description: "Construct ray diagrams for convex and concave lenses, deduce image characteristics, and explain the action of a simple microscope",
        requiredConcepts: ["sci-g11-opt-007", "sci-g11-opt-008", "sci-g11-opt-009"]
      }
    ],
    concepts: [
      { id: "sci-g11-opt-001", name: "Laws of Reflection and Curved Mirror Geometry", weight: 4, isFrequentlyTested: true, category: "law", keywords: ["laws of reflection", "angle of incidence equals reflection", "curved mirrors", "pole P", "centre of curvature C", "radius of curvature r", "principal focus F", "f = r/2"] },
      { id: "sci-g11-opt-002", name: "Ray Tracing and Ray Diagrams for Concave Mirrors", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["concave mirror ray diagrams", "object at infinity", "object beyond C", "object at C", "object between C and F", "object at F", "object between F and P", "real inverted image", "virtual erect magnified image"] },
      { id: "sci-g11-opt-003", name: "Ray Diagrams and Practical Uses of Convex Mirrors", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["convex mirror", "virtual erect diminished image", "wide field of view", "vehicle rear view mirror", "security blind corner mirror"] },
      { id: "sci-g11-opt-004", name: "Refraction of Light and Snell's Law", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["refraction of light", "denser medium to rarer medium", "bending of light ray", "snell's law", "sin i / sin r = n", "refractive index"] },
      { id: "sci-g11-opt-005", name: "Refractive Index Calculations", weight: 4, isFrequentlyTested: true, category: "calculation", keywords: ["refractive index n", "n = c/v", "speed of light ratio", "real depth / apparent depth", "optical density"] },
      { id: "sci-g11-opt-006", name: "Critical Angle and Total Internal Reflection (TIR)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["critical angle C", "total internal reflection", "light from denser to rarer", "angle of incidence greater than critical angle", "optical fibres", "prisms in periscope binoculars", "mirage"] },
      { id: "sci-g11-opt-007", name: "Lenses Terminology and Ray Tracing Rules", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["convex lens converging", "concave lens diverging", "optical centre O", "principal axis", "principal focus F", "focal length f", "principle of reversibility"] },
      { id: "sci-g11-opt-008", name: "Ray Diagrams for Convex and Concave Lenses", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["convex lens ray diagrams", "u > 2f", "u = 2f", "f < u < 2f", "u = f", "u < f virtual magnified", "concave lens always virtual erect diminished"] },
      { id: "sci-g11-opt-009", name: "Action and Ray Diagram of a Simple Microscope", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["simple microscope", "magnifying glass", "object inside focal point u < f", "virtual erect magnified image on same side"] }
    ],
    definitions: [
      { term: "Snell's Law", definition: "The ratio of the sine of the angle of incidence to the sine of the angle of refraction is a constant for a given pair of media (sin i / sin r = constant).", conceptId: "sci-g11-opt-004" },
      { term: "Critical Angle", definition: "The angle of incidence in the optically denser medium for which the angle of refraction in the rarer medium is 90°.", conceptId: "sci-g11-opt-006" },
      { term: "Total Internal Reflection", definition: "The complete reflection of a light ray back into the denser medium when incident at an angle greater than the critical angle.", conceptId: "sci-g11-opt-006" }
    ],
    formulae: [
      "Curved mirror focal length: f = r / 2",
      "Snell's Law: n = sin(i) / sin(r)",
      "Refractive index from wave speed: n = c / v",
      "Critical angle relation: sin(C) = 1 / n",
      "Real and apparent depth: n = Real Depth / Apparent Depth"
    ],
    expectedDiagrams: [
      "Ray diagram: Concave mirror forming real image (object between C and F)",
      "Ray diagram: Concave mirror forming virtual magnified image (object between F and P)",
      "Ray diagram: Convex mirror showing wide field of view",
      "Refraction through glass slab showing lateral displacement",
      "Total internal reflection and critical angle demonstration",
      "Ray diagram: Convex lens as a simple microscope (object inside F)"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 6,
    unitName: "Biological Processes in Human Body",
    bookPageStart: 143,
    bookPageEnd: 189,
    pdfPageStart: 153,
    pdfPageEnd: 199,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-1.pdf",
    textbookReference: "Grade 11 Science (Part 1) — Unit 6: Biological Processes in Human Body (Book Pages 143–189 | PDF Pages 153–199)",
    matchingKeywords: [
      "biological processes in human body", "process of food digestion", "process of respiration",
      "process of excretion", "process of blood circulation", "coordination and homeostasis in human",
      "digestive system", "enzymes", "salivary amylase", "pepsin", "trypsin", "lipase", "liver", "pancreas",
      "breathing mechanism", "cellular respiration", "atp", "aerobic and anaerobic", "kidney", "nephron",
      "urine formation", "ultrafiltration", "heart", "pulmonary circulation", "systemic circulation",
      "blood pressure", "central nervous system", "reflex action", "reflex arc", "endocrine glands",
      "hormones", "homeostasis", "insulin", "lesson 6", "unit 6"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-bph-lo-01",
        description: "Describe the human digestive system, enzyme action, absorption of end products, and prevention of digestive disorders",
        requiredConcepts: ["sci-g11-bph-001", "sci-g11-bph-002", "sci-g11-bph-003"]
      },
      {
        id: "sci-g11-bph-lo-02",
        description: "Explain human breathing mechanisms, characteristics of respiratory surfaces, cellular respiration (aerobic vs anaerobic), and ATP energy storage",
        requiredConcepts: ["sci-g11-bph-004", "sci-g11-bph-005", "sci-g11-bph-006"]
      },
      {
        id: "sci-g11-bph-lo-03",
        description: "Describe the urinary system, nephron structure, urine formation stages (ultrafiltration, reabsorption, secretion), and kidney health",
        requiredConcepts: ["sci-g11-bph-007", "sci-g11-bph-008", "sci-g11-bph-009"]
      },
      {
        id: "sci-g11-bph-lo-04",
        description: "Explain the human circulatory and lymphatic systems, double circulation, cardiac cycle, blood pressure, and cardiovascular diseases",
        requiredConcepts: ["sci-g11-bph-010", "sci-g11-bph-011", "sci-g11-bph-012"]
      },
      {
        id: "sci-g11-bph-lo-05",
        description: "Analyze nervous and hormonal coordination, reflex arcs, autonomic responses, and homeostasis (temperature, blood glucose, water balance)",
        requiredConcepts: ["sci-g11-bph-013", "sci-g11-bph-014", "sci-g11-bph-015", "sci-g11-bph-016"]
      }
    ],
    concepts: [
      { id: "sci-g11-bph-001", name: "Human Digestive System Organs and Peristalsis", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["human digestive system", "mouth esophagus stomach small intestine large intestine rectum", "peristalsis", "alimentary canal"] },
      { id: "sci-g11-bph-002", name: "Enzymatic Digestion and Secretions (Liver, Pancreas, Glands)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["salivary amylase ptyalin", "gastric juice pepsin hcl", "bile liver emulsification", "pancreatic juice trypsin amylase lipase", "intestinal enzymes", "end products glucose amino acids fatty acids glycerol"] },
      { id: "sci-g11-bph-003", name: "Absorption in Villi and Digestive Disorders", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["villi microvilli lacteals", "absorption in ileum", "digestive diseases", "diarrhea", "constipation", "gastritis", "typhoid"] },
      { id: "sci-g11-bph-004", name: "Mechanics of Breathing (Inspiration and Expiration)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["breathing mechanism", "inspiration inhaling", "expiration exhaling", "diaphragm movement", "intercostal muscles", "thoracic cavity volume and pressure", "bell jar model"] },
      { id: "sci-g11-bph-005", name: "Respiratory Surface and Cellular Respiration (Aerobic vs Anaerobic)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["respiratory surface alveoli", "large surface area thin moist vascularized", "mucous membranes cilia", "aerobic respiration", "c6h12o6 + 6o2 -> 6co2 + 6h2o + atp", "anaerobic respiration lactic acid fermentation"] },
      { id: "sci-g11-bph-006", name: "Role of ATP and Respiratory Diseases", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["atp adenosine triphosphate", "energy currency", "common cold", "tuberculosis", "pneumonia", "asthma", "bronchitis"] },
      { id: "sci-g11-bph-007", name: "Human Excretory Organs and Excretory Products", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["excretion vs defecation", "excretory organs", "kidneys urea", "skin sweat", "lungs carbon dioxide", "liver bile pigments"] },
      { id: "sci-g11-bph-008", name: "Structure of Kidney and Nephron", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["kidney cortex medulla pelvis", "nephron", "bowman's capsule", "glomerulus", "proximal convoluted tubule", "loop of henle", "distal convoluted tubule", "collecting duct"] },
      { id: "sci-g11-bph-009", name: "Process of Urine Formation and Kidney Disorders", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["urine formation", "ultrafiltration glomerulus", "selective reabsorption", "tubular secretion", "kidney failure", "nephritis", "kidney stones", "dialysis"] },
      { id: "sci-g11-bph-010", name: "Heart Structure and Double Blood Circulation", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["heart 4 chambers atria ventricles", "bicuspid tricuspid semilunar valves", "pulmonary circulation", "systemic circulation", "deoxygenated and oxygenated blood", "aorta vena cava"] },
      { id: "sci-g11-bph-011", name: "Cardiac Cycle, Heart Sounds, Blood Pressure, and Lymph", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["cardiac cycle", "heart sounds lub dub", "systolic pressure 120", "diastolic pressure 80", "sphygmomanometer", "lymphatic circulation tissue fluid"] },
      { id: "sci-g11-bph-012", name: "Cardiovascular Diseases and Prevention", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["atherosclerosis plaque", "cardiac arrest heart attack", "hypertension high bp", "thrombosis blood clot"] },
      { id: "sci-g11-bph-013", name: "Central and Peripheral Nervous Systems", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["central nervous system cns", "brain cerebrum cerebellum medulla oblongata", "spinal cord", "peripheral nervous system pns", "autonomic nervous system ans", "sympathetic and parasympathetic"] },
      { id: "sci-g11-bph-014", name: "Reflex Action and Reflex Arc", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["reflex action", "involuntary immediate response", "reflex arc", "sensory receptor", "sensory neuron afferent", "interneuron relay", "motor neuron efferent", "effector muscle gland"] },
      { id: "sci-g11-bph-015", name: "Endocrine Glands and Chemical Coordination", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["endocrine glands", "hormones", "pituitary gland growth hormone", "thyroid thyroxin", "pancreas islets insulin glucagon", "adrenal gland adrenaline", "testes testosterone", "ovaries estrogen progesterone"] },
      { id: "sci-g11-bph-016", name: "Homeostasis (Thermoregulation, Blood Glucose, Osmoregulation)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["homeostasis definition", "negative feedback", "thermoregulation body temperature sweating shivering", "blood glucose regulation insulin glucagon", "water content regulation adh"] }
    ],
    definitions: [
      { term: "Excretion", definition: "The elimination of toxic metabolic waste products produced within cells from the body.", conceptId: "sci-g11-bph-007" },
      { term: "Reflex Arc", definition: "The shortest neural pathway traversed by nerve impulses during a reflex action (Receptor → Sensory Neuron → Interneuron → Motor Neuron → Effector).", conceptId: "sci-g11-bph-014" },
      { term: "Homeostasis", definition: "The maintenance of a relatively stable, constant internal physical and chemical environment within an organism despite external changes.", conceptId: "sci-g11-bph-016" }
    ],
    formulae: [
      "Aerobic cellular respiration: C6H12O6 + 6O2 → 6CO2 + 6H2O + 38 ATP",
      "Anaerobic respiration in yeast: C6H12O6 → 2C2H5OH + 2CO2 + 2 ATP",
      "Anaerobic respiration in human muscle: C6H12O6 → 2 Lactic Acid + 2 ATP"
    ],
    expectedDiagrams: [
      "Human digestive system with liver, stomach, pancreas, and intestines labeled",
      "Bell jar and balloon model of human breathing mechanism",
      "Detailed structure of a Nephron (Bowman's capsule, Glomerulus, Loop of Henle, Collecting duct)",
      "Internal anatomy of the human heart showing 4 chambers, valves, and major blood vessels",
      "Reflex arc cross-section showing spinal cord, sensory, relay, and motor neurons",
      "Negative feedback loop for blood glucose regulation (Insulin / Glucagon)"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 7,
    unitName: "Acids, Bases and Salts",
    bookPageStart: 190,
    bookPageEnd: 201,
    pdfPageStart: 200,
    pdfPageEnd: 211,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-1.pdf",
    textbookReference: "Grade 11 Science (Part 1) — Unit 7: Acids, Bases and Salts (Book Pages 190–201 | PDF Pages 200–211)",
    matchingKeywords: [
      "acids, bases and salts", "acids bases and salts", "acids", "bases", "salts", "neutralisation",
      "neutralization", "strong acids", "weak acids", "strong bases", "weak bases", "litmus paper",
      "ph paper", "indicators", "phenolphthalein", "methyl orange", "hydrogen ions h+", "hydroxyl ions oh-",
      "neutralization reaction", "applications of acids bases and salts", "lesson 7", "unit 7"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-abs-lo-01",
        description: "Distinguish between acids and bases as sources of H⁺ and OH⁻ ions, classify strong and weak acids/bases, and test using indicators and pH scale",
        requiredConcepts: ["sci-g11-abs-001", "sci-g11-abs-002", "sci-g11-abs-003"]
      },
      {
        id: "sci-g11-abs-lo-02",
        description: "Explain chemical reactions of acids (with metals, carbonates, bases) and the neutralization reaction forming salts and water",
        requiredConcepts: ["sci-g11-abs-004", "sci-g11-abs-005"]
      },
      {
        id: "sci-g11-abs-lo-03",
        description: "Classify salts and investigate practical applications of acids, bases, and salts in agriculture, industry, medicine, and daily life",
        requiredConcepts: ["sci-g11-abs-006", "sci-g11-abs-007"]
      }
    ],
    concepts: [
      { id: "sci-g11-abs-001", name: "Acids as H⁺ Ion Donors (Strong vs Weak Acids)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["acids", "source of h+ ions", "hydronium h3o+", "strong acids hcl hno3 h2so4", "weak acids ch3cooh h2co3", "complete and partial ionization"] },
      { id: "sci-g11-abs-002", name: "Bases as OH⁻ Ion Donors (Strong vs Weak Bases)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["bases and alkalis", "source of oh- ions", "strong bases naoh koh", "weak bases nh4oh mg(oh)2", "bitter taste slippery feel"] },
      { id: "sci-g11-abs-003", name: "Acid-Base Indicators and pH Scale", weight: 5, isFrequentlyTested: true, category: "experiment", keywords: ["litmus paper red blue", "ph paper ph scale 0 to 14", "phenolphthalein colorless pink", "methyl orange red yellow", "universal indicator"] },
      { id: "sci-g11-abs-004", name: "Chemical Reactions of Acids (Metals, Bases, Carbonates)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["acid + metal -> salt + hydrogen", "acid + carbonate -> salt + water + co2", "acid + base -> salt + water", "effervescence of h2 and co2"] },
      { id: "sci-g11-abs-005", name: "Neutralization Reaction and Ionic Equation", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["neutralization", "h+ + oh- -> h2o", "acid base reaction", "exothermic neutralization"] },
      { id: "sci-g11-abs-006", name: "Types of Salts (Normal, Acid, Basic Salts)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["salts", "normal salt nacl k2so4", "acid salt nahco3 nahso4", "basic salt mg(oh)cl"] },
      { id: "sci-g11-abs-007", name: "Everyday Applications of Neutralization and Salts", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["applications of neutralization", "antacids for gastritis", "liming acidic soil cao ca(oh)2", "treatment of wasp stings vinegar", "bee stings baking soda", "industrial uses of salts"] }
    ],
    definitions: [
      { term: "Acid", definition: "A chemical substance that dissolves in water to release hydrogen ions (H⁺ / H₃O⁺), having a pH less than 7.", conceptId: "sci-g11-abs-001" },
      { term: "Base", definition: "A substance that reacts with an acid to produce salt and water, releasing hydroxide ions (OH⁻) when dissolved in water (alkali).", conceptId: "sci-g11-abs-002" },
      { term: "Neutralization", definition: "The chemical reaction between hydrogen ions of an acid and hydroxide ions of a base to form water and a salt (H⁺ + OH⁻ → H₂O).", conceptId: "sci-g11-abs-005" }
    ],
    formulae: [
      "Neutralization ionic equation: H⁺(aq) + OH⁻(aq) → H₂O(l)",
      "Acid + Metal: 2HCl + Mg → MgCl₂ + H₂",
      "Acid + Carbonate: 2HCl + CaCO₃ → CaCl₂ + H₂O + CO₂"
    ],
    expectedDiagrams: [
      "pH scale color chart from 0 to 14",
      "Testing gas produced from acid + carbonate (limewater turns milky)"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 8,
    unitName: "Heat Changes Associated with Chemical Reactions",
    bookPageStart: 202,
    bookPageEnd: 215,
    pdfPageStart: 212,
    pdfPageEnd: 225,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-1.pdf",
    textbookReference: "Grade 11 Science (Part 1) — Unit 8: Heat Changes Associated with Chemical Reactions (Book Pages 202–215 | PDF Pages 212–225)",
    matchingKeywords: [
      "heat changes associated with chemical reactions", "heat changes in reactions", "exothermic reactions",
      "endothermic reactions", "heat of reaction", "determination of heat changes", "enthalpy change",
      "calorimeter", "energy level diagrams", "lesson 8", "unit 8"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-hcr-lo-01",
        description: "Explain exothermic and endothermic reactions based on energy of reactants/products and illustrate with energy level diagrams",
        requiredConcepts: ["sci-g11-hcr-001", "sci-g11-hcr-002", "sci-g11-hcr-003"]
      },
      {
        id: "sci-g11-hcr-lo-02",
        description: "Determine the heat of a reaction experimentally using Q = mcΔθ and state experimental assumptions and applications",
        requiredConcepts: ["sci-g11-hcr-004", "sci-g11-hcr-005"]
      }
    ],
    concepts: [
      { id: "sci-g11-hcr-001", name: "Exothermic Reactions and Energy Release", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["exothermic reaction", "heat released to surroundings", "temperature increases", "combustion of fuels", "neutralization of acid and base", "cao with water", "respiration", "delta H negative"] },
      { id: "sci-g11-hcr-002", name: "Endothermic Reactions and Heat Absorption", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["endothermic reaction", "heat absorbed from surroundings", "temperature drops", "dissolving nh4cl in water", "dissolving urea in water", "photosynthesis", "thermal decomposition caco3", "delta H positive"] },
      { id: "sci-g11-hcr-003", name: "Energy Level Diagrams for Exothermic and Endothermic Reactions", weight: 5, isFrequentlyTested: true, category: "diagram", keywords: ["energy level diagram", "reactants energy higher than products exothermic", "products energy higher than reactants endothermic", "activation energy"] },
      { id: "sci-g11-hcr-004", name: "Experimental Determination of Heat of Reaction (Q = mcΔθ)", weight: 5, isFrequentlyTested: true, category: "calculation", keywords: ["heat of reaction determination", "q = mc theta", "q = mc delta t", "calorimetry", "specific heat capacity of water 4.2 j g-1 k-1", "molar heat of neutralization"] },
      { id: "sci-g11-hcr-005", name: "Assumptions and Applications of Heat Changes in Industry and Daily Life", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["calorimeter assumptions", "density of dilute solution 1 g cm-3", "no heat loss to surroundings", "adding acid to water safety", "applications in hot packs and cold packs"] }
    ],
    definitions: [
      { term: "Exothermic Reaction", definition: "A chemical reaction that releases thermal energy to the surroundings, causing a temperature rise (energy of reactants > energy of products).", conceptId: "sci-g11-hcr-001" },
      { term: "Endothermic Reaction", definition: "A chemical reaction that absorbs thermal energy from the surroundings, causing a temperature decrease (energy of products > energy of reactants).", conceptId: "sci-g11-hcr-002" },
      { term: "Heat of Reaction", definition: "The quantity of heat absorbed or evolved when molar quantities of reactants react completely as shown in the balanced chemical equation.", conceptId: "sci-g11-hcr-004" }
    ],
    formulae: [
      "Heat exchange equation: Q = mcΔθ",
      "Enthalpy change of reaction: ΔH = -Q / n"
    ],
    expectedDiagrams: [
      "Energy profile / energy level diagram for an exothermic reaction",
      "Energy profile / energy level diagram for an endothermic reaction",
      "Simple calorimeter setup for measuring heat of neutralization"
    ]
  },

  // Grade 11 Science Part 2, units 9 to 15. PDF offset: 10.
  {
    subject: "Science",
    grade: 11,
    unitNumber: 9,
    unitName: "Heat",
    bookPageStart: 1,
    bookPageEnd: 31,
    pdfPageStart: 11,
    pdfPageEnd: 41,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-2.pdf",
    textbookReference: "Grade 11 Science (Part 2) — Unit 9: Heat (Book Pages 1–31 | PDF Pages 11–41)",
    matchingKeywords: [
      "heat", "temperature", "change of state of matter", "thermal expansion", "heat transfer",
      "thermometers", "celsius and kelvin scale", "heat capacity", "specific heat capacity",
      "q=mcΔθ", "latent heat of fusion", "latent heat of vaporization", "expansion of solids liquids gases",
      "conduction", "convection", "radiation", "bimetallic strip", "lesson 9", "unit 9"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-hea-lo-01",
        description: "Explain temperature scales (Celsius and Kelvin), thermometer mechanisms, and solve heat exchange problems using Q = mcΔθ",
        requiredConcepts: ["sci-g11-hea-001", "sci-g11-hea-002", "sci-g11-hea-003"]
      },
      {
        id: "sci-g11-hea-lo-02",
        description: "Distinguish between boiling and evaporation, and calculate heat involved in phase changes using latent heat (fusion and vaporization)",
        requiredConcepts: ["sci-g11-hea-004", "sci-g11-hea-005"]
      },
      {
        id: "sci-g11-hea-lo-03",
        description: "Demonstrate thermal expansion in solids, liquids, and gases, and describe methods of heat transfer (conduction, convection, radiation) with applications",
        requiredConcepts: ["sci-g11-hea-006", "sci-g11-hea-007", "sci-g11-hea-008"]
      }
    ],
    concepts: [
      { id: "sci-g11-hea-001", name: "Temperature Scales and Thermometers (Celsius and Kelvin)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["temperature definition", "degree of hotness", "mercury glass thermometer", "alcohol thermometer", "celsius scale", "kelvin scale absolute", "T = theta + 273.15"] },
      { id: "sci-g11-hea-002", name: "Heat Capacity and Specific Heat Capacity", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["heat capacity C", "specific heat capacity c", "j kg-1 k-1", "high specific heat capacity of water", "coolant climate moderator"] },
      { id: "sci-g11-hea-003", name: "Heat Exchange Calculations (Q = mcΔθ)", weight: 5, isFrequentlyTested: true, category: "calculation", keywords: ["heat exchange formula", "q = mc theta", "q = mc delta t", "thermal equilibrium", "heat lost equals heat gained"] },
      { id: "sci-g11-hea-004", name: "Change of State, Melting, Freezing, and Boiling Points", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["change of state of matter", "melting point", "freezing point", "boiling point", "temperature remains constant during phase change"] },
      { id: "sci-g11-hea-005", name: "Latent Heat of Fusion and Vaporization vs Evaporation", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["specific latent heat of fusion Lf", "specific latent heat of vaporization Lv", "q = ml", "vaporization vs evaporation", "cooling effect of evaporation"] },
      { id: "sci-g11-hea-006", name: "Thermal Expansion of Solids, Liquids, and Gases", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["thermal expansion", "expansion of solids", "bimetallic strip thermostat", "railway track gaps", "anomalous expansion of water 0 to 4 c", "expansion of gases"] },
      { id: "sci-g11-hea-007", name: "Heat Transfer by Conduction and Convection", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["conduction in solids", "free electron transfer", "thermal conductors and insulators", "convection in fluids", "convection currents", "land breeze and sea breeze"] },
      { id: "sci-g11-hea-008", name: "Heat Transfer by Radiation and Vacuum Flask Design", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["thermal radiation", "electromagnetic waves", "absorption and emission by dull black vs shiny white surfaces", "vacuum flask dewar flask", "silvered glass walls vacuum stopper"] }
    ],
    definitions: [
      { term: "Specific Heat Capacity", definition: "The quantity of heat energy required to raise the temperature of 1 kg mass of a substance by 1 K (or 1 °C).", conceptId: "sci-g11-hea-002" },
      { term: "Specific Latent Heat of Fusion", definition: "The quantity of heat required to change 1 kg of a substance from solid state to liquid state at its melting point without any change in temperature.", conceptId: "sci-g11-hea-005" },
      { term: "Specific Latent Heat of Vaporization", definition: "The quantity of heat required to change 1 kg of a substance from liquid state to gaseous state at its boiling point without any change in temperature.", conceptId: "sci-g11-hea-005" }
    ],
    formulae: [
      "Temperature conversion: T(K) = θ(°C) + 273.15",
      "Heat exchange: Q = m × c × Δθ",
      "Heat capacity: C = m × c = Q / Δθ",
      "Latent heat: Q = m × L"
    ],
    expectedDiagrams: [
      "Heating curve of water showing temperature plateaus at melting (0°C) and boiling (100°C)",
      "Bimetallic strip bending under heat",
      "Vacuum flask (Dewar flask) construction labeling all heat prevention features",
      "Sea breeze and land breeze convection currents"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 10,
    unitName: "Power and Energy of Electric Appliances",
    bookPageStart: 32,
    bookPageEnd: 49,
    pdfPageStart: 42,
    pdfPageEnd: 59,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-2.pdf",
    textbookReference: "Grade 11 Science (Part 2) — Unit 10: Power and Energy of Electric Appliances (Book Pages 32–49 | PDF Pages 42–59)",
    matchingKeywords: [
      "power and energy of electric appliances", "power output of an electric appliance",
      "electric energy consumed by electric appliances", "efficiency of electric appliances and conserving power",
      "home electric circuits", "measuring electric energy in kilowatt hours", "p=vi", "e=vit", "kwh",
      "kilowatt hour", "house wiring circuit", "live neutral earth", "fuse", "mcb", "rcd", "trip switch", "lesson 10", "unit 10"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-pea-lo-01",
        description: "Define electrical power (P = VI) and electrical energy dissipation (E = VIt), and solve numerical problems in Joules and kilowatt-hours (kWh)",
        requiredConcepts: ["sci-g11-pea-001", "sci-g11-pea-002", "sci-g11-pea-003"]
      },
      {
        id: "sci-g11-pea-lo-02",
        description: "Compare power ratings, evaluate electrical appliance efficiency, and formulate domestic energy conservation strategies",
        requiredConcepts: ["sci-g11-pea-004", "sci-g11-pea-005"]
      },
      {
        id: "sci-g11-pea-lo-03",
        description: "Explain the components, connections, and safety precautions of domestic house wiring circuits (fuses, MCB, RCD/RCCB, earthing)",
        requiredConcepts: ["sci-g11-pea-006", "sci-g11-pea-007"]
      }
    ],
    concepts: [
      { id: "sci-g11-pea-001", name: "Electrical Power of Appliances (P = VI)", weight: 5, isFrequentlyTested: true, category: "formula", keywords: ["power of electrical appliance", "p = vi", "p = i2r", "p = v2/r", "watt w", "kilowatt kw", "rate of electrical energy consumption"] },
      { id: "sci-g11-pea-002", name: "Electrical Energy Dissipation (E = VIt = Pt)", weight: 5, isFrequentlyTested: true, category: "formula", keywords: ["electrical energy consumed", "e = vit", "e = pt", "joules j", "energy dissipation"] },
      { id: "sci-g11-pea-003", name: "Kilowatt-Hour (kWh) as Commercial Energy Unit", weight: 5, isFrequentlyTested: true, category: "calculation", keywords: ["kilowatt hour kwh", "1 kwh = 3.6 mj", "electricity meter unit", "electricity bill calculation", "power in kw x time in hours"] },
      { id: "sci-g11-pea-004", name: "Energy Efficiency and Conservation in Electrical Appliances", weight: 4, isFrequentlyTested: true, category: "calculation", keywords: ["efficiency of electric appliances", "useful output energy / input energy", "led vs cfl vs incandescent bulb", "conserving power", "energy star rating"] },
      { id: "sci-g11-pea-005", name: "National Electricity Grid Supply in Sri Lanka (230 V, 50 Hz AC)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["national grid", "230 v ac", "50 hz frequency", "alternating current mains"] },
      { id: "sci-g11-pea-006", name: "Components of Domestic House Wiring Circuit", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["house wiring circuit", "live wire brown", "neutral wire blue", "earth wire green yellow", "service fuse", "electric meter", "main switch", "lighting circuit 5a", "ring power circuit 13a 15a"] },
      { id: "sci-g11-pea-007", name: "Safety Devices in House Wiring (Fuse, MCB, RCD/RCCB, Earthing)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["fuse wire melting", "mcb miniature circuit breaker overload protection", "rcd residual current device", "rccb trip switch earth leakage detection", "safety earthing 3-pin plug"] }
    ],
    definitions: [
      { term: "Electrical Power", definition: "The rate at which electrical energy is transferred, consumed, or converted into other forms of energy by an electrical circuit or appliance (P = VI).", conceptId: "sci-g11-pea-001" },
      { term: "Kilowatt-Hour (kWh)", definition: "The commercial unit of electrical energy consumed by a 1-kilowatt (1000 W) appliance operating continuously for 1 hour (1 kWh = 3.6 × 10⁶ J).", conceptId: "sci-g11-pea-003" },
      { term: "Residual Current Device (RCD / Trip Switch)", definition: "A safety device that quickly disconnects the electrical supply when it detects an imbalance between the live and neutral currents due to current leaking to earth.", conceptId: "sci-g11-pea-007" }
    ],
    formulae: [
      "Power: P = V × I = I² × R = V² / R",
      "Energy: E = P × t = V × I × t",
      "Energy in units (kWh) = (Power in Watts × Time in hours) / 1000",
      "Efficiency (%) = (Useful Power Output / Total Power Input) × 100%"
    ],
    expectedDiagrams: [
      "Domestic house wiring schematic diagram (Mains → Service fuse → Meter → Main switch → RCD → MCBs → Circuits)",
      "3-pin plug internal wiring diagram (Live, Neutral, Earth pin connections)"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 11,
    unitName: "Electronics",
    bookPageStart: 50,
    bookPageEnd: 78,
    pdfPageStart: 60,
    pdfPageEnd: 88,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-2.pdf",
    textbookReference: "Grade 11 Science (Part 2) — Unit 11: Electronics (Book Pages 50–78 | PDF Pages 60–88)",
    matchingKeywords: [
      "electronics", "semiconductors", "intrinsic semiconductor", "extrinsic semiconductors",
      "p-type", "n-type", "p-n junction", "p-n junction diode", "junction diode",
      "rectification of alternating currents", "rectifier diodes", "half wave rectification",
      "full wave rectification", "smoothing", "led", "photo diode", "solar cell",
      "transistor", "npn", "pnp", "signal amplification", "switching", "lesson 11", "unit 11"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-ele-lo-01",
        description: "Distinguish between conductors, insulators, and semiconductors, and explain intrinsic vs extrinsic (p-type and n-type) doping",
        requiredConcepts: ["sci-g11-ele-001", "sci-g11-ele-002"]
      },
      {
        id: "sci-g11-ele-lo-02",
        description: "Explain the action of p-n junction diodes in forward and reverse bias, and demonstrate half-wave/full-wave rectification and smoothing",
        requiredConcepts: ["sci-g11-ele-003", "sci-g11-ele-004", "sci-g11-ele-005"]
      },
      {
        id: "sci-g11-ele-lo-03",
        description: "Describe special diodes (LED, photodiode, solar cell) and their practical electronic applications",
        requiredConcepts: ["sci-g11-ele-006", "sci-g11-ele-007"]
      },
      {
        id: "sci-g11-ele-lo-04",
        description: "Explain the structure of npn/pnp transistors, and construct circuit applications as an amplifier and as an automatic electronic switch",
        requiredConcepts: ["sci-g11-ele-008", "sci-g11-ele-009", "sci-g11-ele-010"]
      }
    ],
    concepts: [
      { id: "sci-g11-ele-001", name: "Conductors, Insulators, and Intrinsic Semiconductors (Si, Ge)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["semiconductors", "intrinsic semiconductor silicon germanium", "free electrons and holes", "temperature effect on conductivity"] },
      { id: "sci-g11-ele-002", name: "Extrinsic Semiconductors (p-type and n-type Doping)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["extrinsic semiconductors", "doping", "p-type trivalent boron majority holes", "n-type pentavalent phosphorus majority electrons"] },
      { id: "sci-g11-ele-003", name: "The p-n Junction Diode and Biasing", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["p-n junction", "depletion layer", "barrier potential", "forward bias conducting", "reverse bias blocking", "diode circuit symbol", "iv characteristic curve"] },
      { id: "sci-g11-ele-004", name: "Half-Wave and Full-Wave (Bridge) Rectification", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["rectification of alternating current", "half-wave rectification single diode", "full-wave rectification bridge circuit 4 diodes", "ac to dc conversion", "waveform diagrams"] },
      { id: "sci-g11-ele-005", name: "Capacitor Smoothing Circuits", weight: 4, isFrequentlyTested: true, category: "process", keywords: ["smoothing circuit", "filter capacitor in parallel", "reducing ripple voltage", "smooth direct current"] },
      { id: "sci-g11-ele-006", name: "Light Emitting Diodes (LED) and Applications", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["led light emitting diode", "forward biased emission of light", "energy efficient lighting", "signaling displays", "protective resistor"] },
      { id: "sci-g11-ele-007", name: "Photodiodes and Solar Cells", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["photodiode reverse biased light detector", "solar cell photovoltaic effect", "direct conversion of light to electrical emf", "renewable energy"] },
      { id: "sci-g11-ele-008", name: "Structure and Symbols of Bipolar Junction Transistors (npn and pnp)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["transistor structure", "npn transistor", "pnp transistor", "emitter base collector", "circuit symbols", "arrowhead indicates current direction"] },
      { id: "sci-g11-ele-009", name: "Transistor as a Signal Amplifier", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["transistor amplifier", "common emitter configuration", "small base current controls large collector current", "current gain beta = Ic/Ib", "signal amplification"] },
      { id: "sci-g11-ele-010", name: "Transistor as an Electronic Switch (LDR and Thermistor)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["transistor switch", "automatic light switch with ldr", "automatic fire temperature alarm with thermistor", "cutoff and saturation regions", "potential divider circuit"] }
    ],
    definitions: [
      { term: "Semiconductor", definition: "A material whose electrical conductivity lies between that of a conductor and an insulator, increasing with temperature.", conceptId: "sci-g11-ele-001" },
      { term: "Rectification", definition: "The process of converting alternating current (AC) into direct current (DC) using one or more diodes.", conceptId: "sci-g11-ele-004" },
      { term: "Transistor", definition: "A three-terminal semiconductor device (Emitter, Base, Collector) used for amplifying electrical signals or acting as an electronically controlled switch.", conceptId: "sci-g11-ele-008" }
    ],
    formulae: [
      "Transistor current relation: I_E = I_B + I_C",
      "Transistor current gain: β = I_C / I_B"
    ],
    expectedDiagrams: [
      "p-n junction diode forward and reverse bias circuit diagrams",
      "Bridge rectifier circuit diagram with 4 diodes",
      "Input AC vs Half-wave and Full-wave rectified output waveforms (with/without smoothing)",
      "npn and pnp transistor standard circuit symbols (E, B, C labeled)",
      "Transistor automatic light-sensor switch circuit with LDR and potential divider"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 12,
    unitName: "Electrochemistry",
    bookPageStart: 79,
    bookPageEnd: 114,
    pdfPageStart: 89,
    pdfPageEnd: 124,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-2.pdf",
    textbookReference: "Grade 11 Science (Part 2) — Unit 12: Electrochemistry (Book Pages 79–114 | PDF Pages 89–124)",
    matchingKeywords: [
      "electrochemistry", "electrochemical cells", "electrolysis", "corrosion of metals",
      "anode and cathode", "oxidation and reduction", "cathodic reaction", "anodic reaction",
      "overall reaction", "zn/cu cell", "electrolytes and non electrolytes",
      "electrolysis of acidulated water", "electrolysis of aqueous copper sulphate",
      "electrolysis of aqueous sodium chloride", "down's cell", "extraction of sodium",
      "electroplating", "rusting of iron", "controlling rusting", "cathodic protection",
      "sacrificial protection", "lesson 12", "unit 12"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-ech-lo-01",
        description: "Construct simple electrochemical cells (Zn/Cu, Fe/Cu, Zn/Fe), identify anode and cathode using the activity series, and write electrode and overall reactions",
        requiredConcepts: ["sci-g11-ech-001", "sci-g11-ech-002", "sci-g11-ech-003"]
      },
      {
        id: "sci-g11-ech-lo-02",
        description: "Demonstrate electrolysis of acidulated water, aqueous NaCl, and aqueous CuSO4, and describe industrial Down's cell sodium extraction and electroplating",
        requiredConcepts: ["sci-g11-ech-004", "sci-g11-ech-005", "sci-g11-ech-006", "sci-g11-ech-007"]
      },
      {
        id: "sci-g11-ech-lo-03",
        description: "Explain the electrochemical mechanism of metal corrosion (rusting of iron) and evaluate rust prevention methods including sacrificial cathodic protection",
        requiredConcepts: ["sci-g11-ech-008", "sci-g11-ech-009", "sci-g11-ech-010"]
      }
    ],
    concepts: [
      { id: "sci-g11-ech-001", name: "Electrochemical Cells and Principles of Electricity Generation", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["electrochemical cell", "chemical energy to electrical energy", "redox reaction", "electron flow from anode to cathode", "conventional current cathode to anode"] },
      { id: "sci-g11-ech-002", name: "Oxidation (Anode) and Reduction (Cathode) in Primary Cells", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["oxidation loss of electrons", "reduction gain of electrons", "anode is negative in primary cell", "cathode is positive in primary cell", "activity series position"] },
      { id: "sci-g11-ech-003", name: "Simple Cells Reactions (Zn/Cu, Fe/Cu, Zn/Fe)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["zn/cu cell", "anodic reaction zn -> zn2+ + 2e-", "cathodic reaction 2h+ + 2e- -> h2", "overall reaction zn + 2h+ -> zn2+ + h2", "fe/cu cell", "zn/fe cell"] },
      { id: "sci-g11-ech-004", name: "Electrolytes vs Non-Electrolytes and Principles of Electrolysis", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["electrolytes and non-electrolytes", "electrical conductivity of ionic solutions", "electrolysis", "anode positive in electrolytic cell", "cathode negative in electrolytic cell"] },
      { id: "sci-g11-ech-005", name: "Electrolysis of Acidulated Water, Aqueous NaCl, and CuSO4", weight: 5, isFrequentlyTested: true, category: "experiment", keywords: ["electrolysis of acidulated water", "hoffman voltameter", "2h2 to 1o2 gas volume ratio", "electrolysis of aqueous nacl brine", "chlorine at anode hydrogen at cathode naoh solution", "electrolysis of aqueous cuso4"] },
      { id: "sci-g11-ech-006", name: "Extraction of Sodium Metal Using Down's Cell", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["down's cell", "extraction of sodium", "electrolysis of molten fused nacl", "carbon graphite anode produces cl2", "iron cylindrical cathode produces liquid na", "uses of sodium and chlorine"] },
      { id: "sci-g11-ech-007", name: "Electroplating of Copper on Iron", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["electroplating", "copper plating on iron", "object at cathode", "pure copper at anode", "cuso4 electrolyte solution", "decorative and protective uses"] },
      { id: "sci-g11-ech-008", name: "Corrosion and Electrochemical Process of Rusting of Iron", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["corrosion of metals", "rusting of iron", "conditions for rusting oxygen and water", "anode fe -> fe2+ + 2e-", "cathode o2 + 2h2o + 4e- -> 4oh-", "hydrated iron iii oxide fe2o3.xh2o"] },
      { id: "sci-g11-ech-009", name: "Factors Accelerating Rusting (Salts, Acids)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["factors accelerating rusting", "saline coastal conditions", "acidic environment", "bimetallic contact"] },
      { id: "sci-g11-ech-010", name: "Corrosion Prevention (Barrier Methods, Galvanizing, Sacrificial Protection)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["controlling rusting", "painting greasing plastic coating", "galvanizing zinc coating", "sacrificial protection attaching mg or zn", "cathodic protection of pipelines and ships"] }
    ],
    definitions: [
      { term: "Electrochemical Cell", definition: "A device that converts stored chemical energy into electrical energy through spontaneous redox reactions.", conceptId: "sci-g11-ech-001" },
      { term: "Electrolysis", definition: "The chemical decomposition of an electrolyte solution or molten ionic compound driven by the passage of a direct electric current.", conceptId: "sci-g11-ech-004" },
      { term: "Sacrificial Protection", definition: "A method of corrosion prevention where a more reactive metal (e.g., zinc or magnesium) is attached to iron and preferentially oxidizes to protect the iron.", conceptId: "sci-g11-ech-010" }
    ],
    formulae: [
      "Zn/Cu Cell Anode: Zn(s) → Zn²⁺(aq) + 2e⁻",
      "Zn/Cu Cell Cathode: 2H⁺(aq) + 2e⁻ → H₂(g)",
      "Electrolysis of Water: 2H₂O(l) → 2H₂(g) + O₂(g)",
      "Down's Cell: 2NaCl(l) → 2Na(l) + Cl₂(g)",
      "Rust formation: 4Fe + 3O₂ + 2xH₂O → 2Fe₂O₃·xH₂O"
    ],
    expectedDiagrams: [
      "Simple Zn/Cu cell with voltmeter and dilute H2SO4",
      "Hoffman voltameter setup for electrolysis of water",
      "Down's cell schematic cross-section for molten NaCl electrolysis",
      "Copper electroplating on an iron spoon circuit setup",
      "Test tubes experiment showing conditions needed for rusting (air + water, dry air, boiled water without air)"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 13,
    unitName: "Electromagnetism and Electromagnetic Induction",
    bookPageStart: 115,
    bookPageEnd: 150,
    pdfPageStart: 125,
    pdfPageEnd: 160,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-2.pdf",
    textbookReference: "Grade 11 Science (Part 2) — Unit 13: Electromagnetism and Electromagnetic Induction (Book Pages 115–150 | PDF Pages 125–160)",
    matchingKeywords: [
      "electromagnetism and electromagnetic induction", "magnetism", "magnetic effect of a current",
      "electromagnetic induction", "magnetic force on conductor", "fleming's left hand rule",
      "loud speaker", "dc motor", "induced emf", "fleming's right hand rule", "bicycle dynamo",
      "dynamic microphone", "alternating current generator", "transformer", "step-up transformer",
      "step-down transformer", "vs/vp = ns/np", "lesson 13", "unit 13"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-emi-lo-01",
        description: "Demonstrate the magnetic force on a current-carrying conductor in a magnetic field, apply Fleming's Left-Hand Rule, and describe the action of DC motors and loudspeakers",
        requiredConcepts: ["sci-g11-emi-001", "sci-g11-emi-002", "sci-g11-emi-003", "sci-g11-emi-004"]
      },
      {
        id: "sci-g11-emi-lo-02",
        description: "Demonstrate electromagnetic induction, determine direction using Fleming's Right-Hand Rule, and explain the action of dynamos, microphones, and AC generators",
        requiredConcepts: ["sci-g11-emi-005", "sci-g11-emi-006", "sci-g11-emi-007"]
      },
      {
        id: "sci-g11-emi-lo-03",
        description: "Explain the construction and operation of step-up and step-down transformers, and solve calculations relating turns ratio, voltage, and power",
        requiredConcepts: ["sci-g11-emi-008", "sci-g11-emi-009"]
      }
    ],
    concepts: [
      { id: "sci-g11-emi-001", name: "Magnetic Effect of an Electric Current and Solenoids", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["magnetic effect of current", "magnetic field lines", "right hand grip rule", "solenoid electromagnet"] },
      { id: "sci-g11-emi-002", name: "Magnetic Force on a Current-Carrying Conductor in a Field", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["force on conductor in magnetic field", "f = bil sin theta", "factors affecting force current field strength length", "current balance"] },
      { id: "sci-g11-emi-003", name: "Fleming's Left-Hand Rule (Motor Rule)", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["fleming's left hand rule", "motor rule", "thumb force motion", "first finger magnetic field", "second finger current"] },
      { id: "sci-g11-emi-004", name: "Direct Current (DC) Motor and Moving Coil Loudspeaker", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["dc motor", "armature coil", "split ring commutator", "carbon brushes", "electrical to mechanical energy", "moving coil loudspeaker"] },
      { id: "sci-g11-emi-005", name: "Electromagnetic Induction and Induced EMF", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["electromagnetic induction", "induced emf", "relative motion between magnet and coil", "rate of change of magnetic flux", "factors affecting induced emf"] },
      { id: "sci-g11-emi-006", name: "Fleming's Right-Hand Rule (Dynamo Rule)", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["fleming's right hand rule", "dynamo rule", "induced current direction", "thumb motion", "first finger field", "second finger induced current"] },
      { id: "sci-g11-emi-007", name: "AC Generators (Alternators), Dynamos, and Microphones", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["alternating current generator ac", "slip rings", "sinusoidal voltage waveform v vs t", "difference between ac and dc", "bicycle dynamo", "dynamic microphone"] },
      { id: "sci-g11-emi-008", name: "Transformers Structure and Action (Mutual Induction)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["transformer", "mutual induction", "primary and secondary coils", "laminated soft iron core", "changing ac magnetic flux", "does not work with dc"] },
      { id: "sci-g11-emi-009", name: "Step-Up vs Step-Down Transformers and Calculations", weight: 5, isFrequentlyTested: true, category: "calculation", keywords: ["step-up transformer ns > np vs > vp", "step-down transformer ns < np vs < vp", "transformer formula vs/vp = ns/np = ip/is", "power equality pin = pout", "national grid electricity transmission"] }
    ],
    definitions: [
      { term: "Electromagnetic Induction", definition: "The production of an electromotive force (EMF) across an electrical conductor situated in a changing magnetic field or moving relative to a magnetic field.", conceptId: "sci-g11-emi-005" },
      { term: "Transformer", definition: "A static electrical device that transfers alternating electrical energy between two circuits through mutual electromagnetic induction, changing alternating voltage levels.", conceptId: "sci-g11-emi-008" },
      { term: "Commutator (Split-ring)", definition: "A device in a DC motor that reverses the direction of current in the armature coil every half rotation to maintain continuous unidirectional rotation.", conceptId: "sci-g11-emi-004" }
    ],
    formulae: [
      "Magnetic Force: F = B × I × l (perpendicular field)",
      "Transformer Turns-Voltage relation: V_s / V_p = N_s / N_p",
      "Ideal Transformer Power relation: P_in = P_out => V_p × I_p = V_s × I_s",
      "Current-Turns relation: I_s / I_p = N_p / N_s"
    ],
    expectedDiagrams: [
      "Fleming's Left-Hand Rule hand configuration",
      "DC Motor cross-section showing armature, magnetic poles, split-ring commutator, and brushes",
      "AC Generator showing coil, slip rings, brushes, and sinusoidal output voltage curve",
      "Step-up and Step-down Transformer construction with primary and secondary coils on core"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 14,
    unitName: "Hydrocarbons and Their Derivatives",
    bookPageStart: 151,
    bookPageEnd: 166,
    pdfPageStart: 161,
    pdfPageEnd: 176,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-2.pdf",
    textbookReference: "Grade 11 Science (Part 2) — Unit 14: Hydrocarbons and Their Derivatives (Book Pages 151–166 | PDF Pages 161–176)",
    matchingKeywords: [
      "hydrocarbons and their derivatives", "hydrocarbons", "alkane series", "alkanes", "ethene",
      "ethylene", "derivatives of ethene", "chloroethene", "vinyl chloride", "tetrafluoroethene",
      "polymers", "monomers", "polymerization", "repeating units", "natural polymers", "synthetic polymers",
      "linear polymers", "branched polymers", "cross linked polymers", "lesson 14", "unit 14"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-hyd-lo-01",
        description: "Describe hydrocarbons, write general and structural formulas of alkanes (C1–C5), and describe ethene and its derivatives (chloroethene, tetrafluoroethene)",
        requiredConcepts: ["sci-g11-hyd-001", "sci-g11-hyd-002", "sci-g11-hyd-003"]
      },
      {
        id: "sci-g11-hyd-lo-02",
        description: "Explain monomers, polymers, polymerization, and classify polymers by origin (natural vs synthetic) and structure (linear, branched, cross-linked)",
        requiredConcepts: ["sci-g11-hyd-004", "sci-g11-hyd-005", "sci-g11-hyd-006"]
      }
    ],
    concepts: [
      { id: "sci-g11-hyd-001", name: "Definition of Hydrocarbons and Fuels", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["hydrocarbons containing only carbon and hydrogen", "combustion of fuels", "presence of carbon and hydrogen testing"] },
      { id: "sci-g11-hyd-002", name: "Alkane Homologous Series (General Formula CnH2n+2, C1 to C5)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["alkanes saturated hydrocarbons", "c-c single bonds and c-h bonds", "cn h2n+2", "methane ch4", "ethane c2h6", "propane c3h8", "butane c4h10", "pentane c5h12", "structural formulas"] },
      { id: "sci-g11-hyd-003", name: "Ethene (Ethylene) and Derivatives (Chloroethene & Tetrafluoroethene)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["ethene c2h4 c=c double bond", "unsaturated hydrocarbon alkene", "chloroethene vinyl chloride ch2=chcl", "tetrafluoroethene cf2=cf2", "derivatives of ethene"] },
      { id: "sci-g11-hyd-004", name: "Monomers, Polymers, and Addition Polymerization", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["monomers", "polymers", "polymerization process", "repeating units", "addition polymerization of alkenes"] },
      { id: "sci-g11-hyd-005", name: "Classification of Polymers by Origin (Natural vs Synthetic)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["natural polymers rubber protein starch glycogen cellulose", "synthetic polymers polythene pvc teflon polystyrene", "uses of synthetic polymers"] },
      { id: "sci-g11-hyd-006", name: "Classification by Structure (Linear, Branched, Cross-Linked)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["linear polymers hdpe", "branched polymers ldpe", "cross linked polymers vulcanized rubber bakelite thermosetting"] }
    ],
    definitions: [
      { term: "Hydrocarbon", definition: "An organic chemical compound composed exclusively of the elements hydrogen and carbon.", conceptId: "sci-g11-hyd-001" },
      { term: "Alkane", definition: "A saturated hydrocarbon containing only single covalent bonds between carbon atoms and having the general molecular formula CnH2n+2.", conceptId: "sci-g11-hyd-002" },
      { term: "Polymerization", definition: "The chemical process of linking a large number of small repeating units (monomers) together to form a high molecular mass macromolecule (polymer).", conceptId: "sci-g11-hyd-004" }
    ],
    formulae: [
      "General formula of Alkanes: CnH2n+2 (n = 1, 2, 3, ...)",
      "Methane: CH4, Ethane: C2H6, Propane: C3H8, Butane: C4H10, Pentane: C5H12",
      "Ethene: C2H4 (CH2=CH2)",
      "Polymerization of ethene: n(CH2=CH2) → -[CH2-CH2]-n (Polyethylene)",
      "Polymerization of vinyl chloride: n(CH2=CHCl) → -[CH2-CHCl]-n (PVC)",
      "Polymerization of tetrafluoroethene: n(CF2=CF2) → -[CF2-CF2]-n (Teflon / PTFE)"
    ],
    expectedDiagrams: [
      "Linear structural formulas of first 5 alkanes (Methane to Pentane)",
      "Structural formula of Ethene, Chloroethene (Vinyl Chloride), and Tetrafluoroethene",
      "Monomer to polymer chain diagram (Ethene → Polythene, Chloroethene → PVC)",
      "Diagrammatic representation of Linear, Branched, and Cross-linked polymer chains"
    ]
  },
  {
    subject: "Science",
    grade: 11,
    unitNumber: 15,
    unitName: "Biosphere",
    bookPageStart: 167,
    bookPageEnd: 215,
    pdfPageStart: 177,
    pdfPageEnd: 225,
    pdfOffset: 10,
    textbookFilename: "grade-11-science-part-2.pdf",
    textbookReference: "Grade 11 Science (Part 2) — Unit 15: Biosphere (Book Pages 167–215 | PDF Pages 177–225)",
    matchingKeywords: [
      "biosphere", "organizational levels and interactions of biosphere",
      "mechanisms involve in maintaining the equilibrium of ecosystems",
      "different environmental pollutants and their effects",
      "the factors that affect the life style of human and problems created",
      "sustainable development and environmental management", "individual", "population",
      "community", "ecosystem", "population growth curve", "energy flow", "food chains", "food webs",
      "ecological pyramids", "carbon cycle", "nitrogen cycle", "global warming", "acid rain",
      "ozone layer depletion", "eutrophication", "biological magnification", "non-communicable diseases",
      "chronic kidney disease", "sustainable development", "polyculture", "wewa cascade", "carbon footprint",
      "water footprint", "food miles", "waste management", "renewable energy", "lesson 15", "unit 15"
    ],
    learningOutcomes: [
      {
        id: "sci-g11-bio-lo-01",
        description: "State the hierarchical organizational levels of the biosphere and analyze typical vs human population growth curves",
        requiredConcepts: ["sci-g11-bio-001", "sci-g11-bio-002"]
      },
      {
        id: "sci-g11-bio-lo-02",
        description: "Analyze unidirectional energy flow, ecological pyramids (numbers, biomass, energy), and biogeochemical cycles (Carbon, Nitrogen cycles)",
        requiredConcepts: ["sci-g11-bio-003", "sci-g11-bio-004", "sci-g11-bio-005"]
      },
      {
        id: "sci-g11-bio-lo-03",
        description: "Explore soil, water, and air pollution, and analyze adverse direct/indirect effects (global warming, acid rain, ozone depletion, eutrophication, biomagnification)",
        requiredConcepts: ["sci-g11-bio-006", "sci-g11-bio-007"]
      },
      {
        id: "sci-g11-bio-lo-04",
        description: "Assess the effects of lifestyle changes on the surge of non-communicable diseases (CKDu, diabetes, cardiovascular diseases, cancer)",
        requiredConcepts: ["sci-g11-bio-008", "sci-g11-bio-009"]
      },
      {
        id: "sci-g11-bio-lo-05",
        description: "Propose sustainable development strategies, indigenous knowledge applications (wewa cascade, herbal medicine), ecological footprints (carbon, water, food miles), and energy management",
        requiredConcepts: ["sci-g11-bio-010", "sci-g11-bio-011", "sci-g11-bio-012", "sci-g11-bio-013"]
      }
    ],
    concepts: [
      { id: "sci-g11-bio-001", name: "Organizational Levels of the Biosphere (Individual → Population → Community → Ecosystem → Biosphere)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["organizational levels of biosphere", "individual species", "population", "community", "ecosystem", "biosphere"] },
      { id: "sci-g11-bio-002", name: "Population Growth Curves (Sigmoid vs Human Exponential)", weight: 5, isFrequentlyTested: true, category: "diagram", keywords: ["population growth curve", "sigmoid s-curve", "lag log deceleration stationary phases", "carrying capacity", "human population explosion j-curve"] },
      { id: "sci-g11-bio-003", name: "Energy and Nutrient Flow in Ecosystems (Food Chains and Food Webs)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["energy flow in ecosystem", "unidirectional energy flow", "producers consumers decomposers", "trophic levels", "food chain", "food web"] },
      { id: "sci-g11-bio-004", name: "Ecological Pyramids (Number, Biomass, and Energy)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["ecological pyramids", "pyramid of numbers", "pyramid of biomass", "pyramid of energy always upright", "10 percent energy rule"] },
      { id: "sci-g11-bio-005", name: "Biogeochemical Cycles (Carbon Cycle and Nitrogen Cycle)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["bio-geo chemical cycles", "carbon cycle photosynthesis respiration", "nitrogen cycle nitrogen fixation nitrification denitrification", "rhizobium nitrosomonas nitrobacter"] },
      { id: "sci-g11-bio-006", name: "Soil, Water, and Air Pollution and Sources", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["environmental pollution", "soil water air pollution", "agrochemicals fertilizers", "industrial effluents", "e-waste nuclear waste", "greenhouse gases heavy metals"] },
      { id: "sci-g11-bio-007", name: "Adverse Effects of Pollution (Global Warming, Acid Rain, Ozone Depletion, Eutrophication, Biomagnification)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["global warming greenhouse effect", "acid rain so2 no2", "ozone layer depletion cfcs", "eutrophication algal bloom bod", "biological magnification ddt heavy metals", "photochemical smog"] },
      { id: "sci-g11-bio-008", name: "Lifestyle Changes (Urbanization, Industrialization, Commercial Agriculture)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["lifestyle changes", "urbanization", "industrialization", "commercialized agriculture", "excessive resource consumption"] },
      { id: "sci-g11-bio-009", name: "Non-Communicable Diseases (NCDs) and Chronic Kidney Disease (CKDu)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["non-communicable diseases ncds", "chronic kidney disease unknown etiology ckdu", "diabetes mellitus", "cardiovascular heart disease", "cancer hypertension", "environmental causes of ncds"] },
      { id: "sci-g11-bio-010", name: "Sustainable Agriculture and Ecological Restoration (Polyculture, Biocontrol, Reforestation)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["sustainable development", "polyculture vs monoculture", "biological pest control", "organic fertilizers", "reforestation"] },
      { id: "sci-g11-bio-011", name: "Indigenous Knowledge and Sri Lankan 'Wewa' Cascade System", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["indigenous knowledge and technology", "sri lankan wewa water management", "tank cascade system ellangawa", "indigenous medicine ayurveda hela wedakama", "traditional food culture"] },
      { id: "sci-g11-bio-012", name: "Ecological Footprints (Carbon Footprint, Water Footprint, Food Miles) and 3R Waste Management", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["carbon footprint", "water footprint", "food miles", "waste management reduce reuse recycle", "solid water gas waste disposal"] },
      { id: "sci-g11-bio-013", name: "Energy Management and Renewable Energy Resources", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["energy crisis remedies", "energy efficiency", "energy conservation", "renewable energy", "hydro power", "wind power", "solar power", "sustainable architecture"] }
    ],
    definitions: [
      { term: "Biosphere", definition: "The global ecological system integrating all living beings and their relationships with the lithosphere, hydrosphere, and atmosphere.", conceptId: "sci-g11-bio-001" },
      { term: "Biological Magnification", definition: "The progressive increase in the concentration of persistent, non-biodegradable toxic substances (e.g., heavy metals, DDT) in the tissues of organisms at successively higher trophic levels.", conceptId: "sci-g11-bio-007" },
      { term: "Eutrophication", definition: "The enrichment of water bodies with mineral nutrients (nitrates and phosphates), leading to excessive algal growth, oxygen depletion, and aquatic death.", conceptId: "sci-g11-bio-007" },
      { term: "Sustainable Development", definition: "Development that meets the needs of the present without compromising the ability of future generations to meet their own needs.", conceptId: "sci-g11-bio-010" },
      { term: "Carbon Footprint", definition: "The total amount of greenhouse gases (primarily carbon dioxide) emitted directly or indirectly by human activities, measured in equivalent tonnes of CO₂.", conceptId: "sci-g11-bio-012" }
    ],
    expectedDiagrams: [
      "Typical Sigmoid (S-shaped) population growth curve showing all phases",
      "Ecological pyramids comparison (Upright Energy Pyramid vs Numbers/Biomass)",
      "The Carbon Cycle diagram (Atmospheric CO2 ↔ Photosynthesis, Respiration, Combustion)",
      "The Nitrogen Cycle diagram (Fixation → Nitrification → Assimilation → Ammonification → Denitrification)",
      "Sri Lankan traditional tank cascade system (Ellangawa / Wewa system) layout"
    ]
  },

  // Grade 11 Geography. PDF offset: 12.
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

  // Grade 11 ICT. PDF offset: 10.
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

  // Grade 10 History from the NIE teacher guide. PDF offset: 10.
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

  // Grade 11 History from the NIE teacher guide. PDF offset: 10.
  {
    subject: "History",
    grade: 11,
    unitNumber: 1,
    unitName: "Industrial Revolution",
    bookPageStart: 1,
    bookPageEnd: 18,
    pdfPageStart: 11,
    pdfPageEnd: 28,
    pdfOffset: 10,
    textbookFilename: "grade-11-history-text-book.pdf",
    textbookReference: "Grade 11 History — Unit 1: Industrial Revolution (Book Pages 1–18 | PDF Pages 11–28)",
    matchingKeywords: [
      "industrial revolution", "origin in great britain", "causes for industrial revolution",
      "textile industry", "flying shuttle james kay", "spinning jenny james hargreaves",
      "iron and steel industry", "henry cort", "henry bessemer", "coal industry", "steam engine thomas newcomen",
      "james watt steam engine", "safety lamp humphry davy", "transport revolution", "macadam road system",
      "steam locomotive george stephenson", "steamboat robert fulton", "steamship henry bell",
      "communication revolution", "telegraph samuel morse", "wireless marconi", "television john logie baird",
      "expansion to europe and asia", "political effects middle class socialism", "economic effects capitalism",
      "social effects urbanization child labour", "environmental pollution", "lesson 1", "unit 1"
    ],
    learningOutcomes: [
      {
        id: "his-g11-u1-lo-01",
        description: "Explain the origin and causes of the Industrial Revolution in Great Britain, and analyze breakthroughs in the textile, iron/steel, and coal industries",
        requiredConcepts: ["his-g11-u1-001", "his-g11-u1-002", "his-g11-u1-003", "his-g11-u1-004"]
      },
      {
        id: "his-g11-u1-lo-02",
        description: "Describe the expansion of the Industrial Revolution into agriculture, transport, and communication, and its diffusion across Europe, USA, and Japan",
        requiredConcepts: ["his-g11-u1-005", "his-g11-u1-006"]
      },
      {
        id: "his-g11-u1-lo-03",
        description: "Assess the multidimensional political, economic, and social consequences of industrialization (capitalism, working class, trade unions, urbanization, pollution)",
        requiredConcepts: ["his-g11-u1-007", "his-g11-u1-008", "his-g11-u1-009"]
      }
    ],
    concepts: [
      { id: "his-g11-u1-001", name: "Concept and Definition of Industrial Revolution", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["industrial revolution definition", "transition from manual labour to machinery", "large-scale factory production", "mechanical power", "18th century great britain"] },
      { id: "his-g11-u1-002", name: "Causes for the Origin of Industrial Revolution in Great Britain", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["causes in great britain", "political stability", "decline of feudalism", "capital investment and rich merchant class", "banking and financial system", "raw material availability coal iron", "transport network", "colonies and market demand", "population growth"] },
      { id: "his-g11-u1-003", name: "Revolution in the Textile Industry (Flying Shuttle, Spinning Jenny, Sewing Machines)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["textile industry", "flying shuttle james kay 1730", "spinning jenny james hargreaves", "cylinder sewing thomas bell", "sewing machine elias howe", "cottage industry to factory system"] },
      { id: "his-g11-u1-004", name: "Iron, Steel, and Coal Power Innovations (Henry Cort, Bessemer, Newcomen, James Watt)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["iron and steel industry", "puddling process henry cort", "bessemer converter henry bessemer", "open hearth system", "electric oven william siemens", "coal mining", "newcomen atmospheric engine", "james watt steam engine", "humphry davy security lamp", "coal byproducts tar dye medicine"] },
      { id: "his-g11-u1-005", name: "Expansion into Agriculture, Transport, and Communication", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["agricultural machinery animal husbandry", "transport revolution", "macadamized roads john macadam", "steamboat robert fulton", "steamship henry bell", "steam locomotive rocket george stephenson", "motor car daimler", "aircraft wright brothers", "communication revolution", "penny post", "electric telegraph samuel morse", "wireless radio marconi", "television john logie baird"] },
      { id: "his-g11-u1-006", name: "Geographical Expansion of Industrialization (France, Germany, Belgium, USA, Japan)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["expansion to continental europe", "france germany heavy industry", "belgium austria prussia", "switzerland textiles", "united states of america", "japan industrialization in asia"] },
      { id: "his-g11-u1-007", name: "Political Effects: Rise of Middle Class, Socialism, Trade Unions, and Imperialist Colonialism", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["political consequences", "rise of industrial middle class bourgeoisie", "socialist and liberal philosophies karl marx", "formation of trade unions", "competition for colonial markets and raw materials"] },
      { id: "his-g11-u1-008", name: "Economic Effects: Industrial Capitalism, Wage Labour, Banking, and Import-Export Trade", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["economic consequences", "industrial capitalism", "factory owners vs wage-earning proletariat", "expansion of banking and insurance", "joint-stock companies", "global import-export network"] },
      { id: "his-g11-u1-009", name: "Social and Environmental Effects: Urbanization, Class Stratification, Child Labour, and Pollution", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["social consequences", "rapid urbanization factory towns", "class division", "factory working conditions child and female labour", "labour welfare legislation", "environmental pollution"] }
    ],
    definitions: [
      { term: "Industrial Revolution", definition: "A fundamental transformation in economic and social structure beginning in 18th-century Britain, marked by the replacement of manual cottage craftsmanship with machine-driven factory mass production powered by steam, coal, and iron.", conceptId: "his-g11-u1-001" },
      { term: "Capitalism", definition: "An economic system characterized by private ownership of capital goods, investments determined by private decision, and prices, production, and distribution determined mainly by competition in a free market.", conceptId: "his-g11-u1-008" }
    ]
  },
  {
    subject: "History",
    grade: 11,
    unitNumber: 2,
    unitName: "Establishment of British Power in Sri Lanka",
    bookPageStart: 19,
    bookPageEnd: 40,
    pdfPageStart: 29,
    pdfPageEnd: 50,
    pdfOffset: 10,
    textbookFilename: "grade-11-history-text-book.pdf",
    textbookReference: "Grade 11 History — Unit 2: Establishment of British Power in Sri Lanka (Book Pages 19–40 | PDF Pages 29–50)",
    matchingKeywords: [
      "establishment of british power in sri lanka", "arrival of british in asia", "strategic importance of sri lanka",
      "trincomalee harbour", "pybus mission 1762", "hugh boyd mission 1782", "robert andrews mission 1795",
      "kew letter 1795", "capture of maritime provinces 1796", "treaty of capitulation 1796", "madras dual administration",
      "crown colony 1802", "fall of the kandyan kingdom 1815", "king sri vikrama rajasinha", "pilimathalawwe",
      "ehelepola", "d'oyly", "kandyan convention 2 march 1815", "1818 uva-wellassa liberation struggle",
      "keppetipola disawa", "madugalle", "duraisamy", "causes nature failure of 1818 struggle",
      "proclamation of 1818", "1848 rebellion", "governor torrington taxes", "weera puran appu",
      "gongalegoda banda", "hanguranketha dingirala", "effects of 1848 rebellion", "lesson 2", "unit 2"
    ],
    learningOutcomes: [
      {
        id: "his-g11-u2-lo-01",
        description: "Analyze the strategic and economic factors that led to British interest in Sri Lanka, British diplomatic missions (1762–1795), and the capture of Maritime provinces (1796)",
        requiredConcepts: ["his-g11-u2-001", "his-g11-u2-002", "his-g11-u2-003"]
      },
      {
        id: "his-g11-u2-lo-02",
        description: "Examine the political downfall of the Kandyan Kingdom (1815) and the signing and terms of the Kandyan Convention of 2 March 1815",
        requiredConcepts: ["his-g11-u2-004", "his-g11-u2-005"]
      },
      {
        id: "his-g11-u2-lo-03",
        description: "Critically evaluate the 1818 Uva-Wellassa War of Liberation, the 1818 Proclamation, and the 1848 Anti-Tax Rebellion (causes, leaders, suppression, and historical impact)",
        requiredConcepts: ["his-g11-u2-006", "his-g11-u2-007", "his-g11-u2-008", "his-g11-u2-009"]
      }
    ],
    concepts: [
      { id: "his-g11-u2-001", name: "British Commercial & Strategic Expansion in Asia and Interest in Sri Lanka", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["british in asia", "east india company eic", "strategic location on indian ocean sea routes", "natural shelter trincomalee harbour", "naval control of bay of bengal and coromandel coast", "cinnamon merchandise"] },
      { id: "his-g11-u2-002", name: "Early British Diplomatic Missions to Kandy (Pybus 1762, Boyd 1782, Andrews 1795)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["diplomatic missions", "john pybus 1762 king kirti sri rajasinha", "hugh boyd 1782", "robert andrews 1795", "attempts to secure trade and military treaties"] },
      { id: "his-g11-u2-003", name: "Capture of Maritime Provinces (1796), Kew Letter, and Dual Administration (1796–1802)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["french invasion of holland 1794", "prince william v kew letter", "dutch governor van angelbeek", "capture of trincomalee jaffna colombo galle 1796", "treaty of capitulation 1796", "madras dual administration madras civil servants", "rebellion against coconut tax", "crown colony status 1802 governor frederick north"] },
      { id: "his-g11-u2-004", name: "Fall of the Kandyan Kingdom (1815) and Internal Conspiracies", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["fall of kandyan kingdom 1815", "king sri vikrama rajasinha nayakkar dynasty", "pilimathalawwe maha adikaram", "ehelepola maha adikaram tragedy", "john d'oyly espionage intelligence", "governor robert brownrigg", "mutilation of coastal traders pretense for invasion", "capture of the king at meda mahanuwara"] },
      { id: "his-g11-u2-005", name: "The Kandyan Convention of 2 March 1815 and Terms of British Subjugation", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["kandyan convention 2 march 1815", "audience hall magul maduwa", "dethronement of nayakkar king", "vesting power in the british sovereign", "protection of buddhism sangha and viharas", "preservation of customs laws and privileges of chiefs"] },
      { id: "his-g11-u2-006", name: "1818 Uva-Wellassa War of Liberation (Causes, Course, Keppetipola Disawa)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["1818 liberation struggle", "causes absence of local king disrespect to chiefs neglect of buddhism", "appointment of hadjee marikkar as muhandiram of madige", "pretender wilbawe duraisamy", "death of douglas wilson ag badulla", "monarawila keppetipola disawa joins rebels", "madugalle", "spread to matale walapane hewaheta dumbara"] },
      { id: "his-g11-u2-007", name: "Suppression and Consequences of 1818 Uprising and Proclamation of 1818", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["failure of 1818 struggle", "lack of unified central organization", "british scorched earth policy ravaging crops and livestock", "british capture of sacred tooth relic", "execution of keppetipola and madugalle at bogambara", "banishment of leaders to mauritius", "proclamation of november 1818 reduction of chiefs powers", "british judicial courts in kandy"] },
      { id: "his-g11-u2-008", name: "1848 Second War of Independence (Causes, Torrington Taxes, Crown Lands Ordinance)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["1848 independence struggle", "colebrooke cameron reforms impact", "crown lands encroachment ordinance 1840", "wasteland ordinance appropriation of ancestral lands for plantations", "neglect of peasant agriculture and irrigation", "governor lord torrington new oppressive taxes", "shop tax gun tax dog tax cart tax boat tax road ordinance"] },
      { id: "his-g11-u2-009", name: "Leaders of 1848 (Puran Appu, Gongalegoda Banda), Suppression, and Historical Aftermath", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["weera puran appu hero of matale", "gongalegoda banda crowned at dambulla temple", "hanguranketha dingirala", "rebellion at matale and kurunegala", "martial law torrington", "execution of puran appu and ven kudapola thero", "recall of governor torrington and colonial secretary emerson tennent", "parliamentary inquiry select committee", "repeal of shop/dog taxes and road ordinance reform", "reorientation towards peasant agriculture and irrigation"] }
    ],
    definitions: [
      { term: "Kandyan Convention (1815)", definition: "The treaty signed on 2 March 1815 between the British Crown and Kandyan chiefs, officially ceding the sovereign administration of the Kandyan Kingdom to King George III while guaranteeing the protection of Buddhism and traditional customs.", conceptId: "his-g11-u2-005" },
      { term: "Scorched Earth Policy", definition: "A military strategy employed by British forces during the 1818 rebellion, involving the systematic destruction of paddy fields, irrigation networks, fruit trees, and dwellings to starve local resistance into submission.", conceptId: "his-g11-u2-007" }
    ]
  },
  {
    subject: "History",
    grade: 11,
    unitNumber: 3,
    unitName: "National Renaissance in Sri Lanka",
    bookPageStart: 41,
    bookPageEnd: 50,
    pdfPageStart: 51,
    pdfPageEnd: 60,
    pdfOffset: 10,
    textbookFilename: "grade-11-history-text-book.pdf",
    textbookReference: "Grade 11 History — Unit 3: National Renaissance in Sri Lanka (Book Pages 41–50 | PDF Pages 51–60)",
    matchingKeywords: [
      "national renaissance in sri lanka", "nationalist movements", "religious and cultural revival",
      "christian missionary activities", "missionary methods documents lectures education",
      "buddhist revival movement", "ven walane sri siddhartha pirivena", "parama dhamma chetiya",
      "vidyodaya pirivena 1873 hikkaduwe sri sumangala", "vidyalankara pirivena 1875 ratmalane sri dharmaloka",
      "buddhist printing presses", "sarasavi sandaresa", "lakminipahana", "five great debates pancha maha vada",
      "panadura debate 1873 panadura vadaya", "ven migettuwatte gunananda thero", "colonel henry steel olcott",
      "buddhist theosophical society bts", "buddhist schools ananda dharmaraja mahinda maliyadeva",
      "anagarika dharmapala", "maha bodhi society", "sinhala bauddhaya", "walisinghe harischandra",
      "piyadasa sirisena", "sinhala jathiya", "john de silva patriotic dramas", "temperance movement amadyapa vyaparaya",
      "hindu revival arumuga navalar", "saiva paripala sabhai", "sir ponnambalam ramanathan", "sir ponnambalam arunachalam",
      "islamic revival mc siddi lebbe", "zahira college", "muslim naisen", "lesson 3", "unit 3"
    ],
    learningOutcomes: [
      {
        id: "his-g11-u3-lo-01",
        description: "Explain the background of 19th-century missionary activities and describe the monastic, literary, debate, and educational methods of the Buddhist Revival",
        requiredConcepts: ["his-g11-u3-001", "his-g11-u3-002", "his-g11-u3-003", "his-g11-u3-004"]
      },
      {
        id: "his-g11-u3-lo-02",
        description: "Analyze the socio-cultural movements that emerged from the revival (National Consciousness, Sacred Site Preservation, and the Temperance Movement)",
        requiredConcepts: ["his-g11-u3-005", "his-g11-u3-006"]
      },
      {
        id: "his-g11-u3-lo-03",
        description: "Examine the Hindu and Islamic Revival movements and evaluate the contributions of Arumuga Navalar, Ponnambalam Ramanathan/Arunachalam, and M.C. Siddi Lebbe",
        requiredConcepts: ["his-g11-u3-007", "his-g11-u3-008"]
      }
    ],
    concepts: [
      { id: "his-g11-u3-001", name: "Missionary Hegemony in the 19th Century and Indigenous Counter-Strategies", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["missionary methods", "christian missionary societies", "printed tracts magazines uragala lanka nidanaya", "public lectures", "missionary schooling english education advantages", "indigenous response using same media"] },
      { id: "his-g11-u3-002", name: "Foundations of Monastic Scholarship: Pirivenas and Printing Presses", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["pirivena renaissance", "parama dhamma chetiya ratmalana ven walane sri siddhartha", "vidyodaya pirivena maligakanda 1873 ven hikkaduwe sri sumangala", "vidyalankara pirivena peliyagoda 1875 ven ratmalane sri dharmaloka", "printing presses sarasavi sandaresa press kavata kathikaya lankadhinava visruta", "newspapers lakminipahana sarasavi sandaresa"] },
      { id: "his-g11-u3-003", name: "The Five Great Debates (Pancha Maha Vada) and the Panadura Debate of 1873", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["five-fold debates pancha maha vada", "baddegama debate waragoda udanwita gampola", "panadura vadaya panadura debate august 1873", "ven migettuwatte gunananda thero oratorical brilliance", "reverend david de silva", "jm peebles report global impact"] },
      { id: "his-g11-u3-004", name: "Colonel Henry Steel Olcott, Buddhist Theosophical Society (BTS), and Buddhist Schools", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["colonel henry steel olcott arrival 1880", "madame blavatsky", "theosophical society", "buddhist education fund", "buddhist flag six colors", "vesak public holiday 1885", "ananda college colombo", "dharmaraja college kandy", "mahinda college galle", "maliyadeva college kurunegala", "musaeus college"] },
      { id: "his-g11-u3-005", name: "National Consciousness Leaders: Anagarika Dharmapala, Walisinghe Harischandra, Piyadasa Sirisena, John de Silva", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["anagarika dharmapala don david hewavitharana", "maha bodhi society restoration of buddhagaya", "sinhala bauddhaya journal", "walisinghe harischandra preservation of anuradhapura sacred city ruins atamasthana", "piyadasa sirisena nationalist novels sinhala jathiya", "john de silva historical patriotic plays drama tower hall"] },
      { id: "his-g11-u3-006", name: "The Temperance Movement (Amadyapa Vyaparaya) Against Colonial Liquor Policy", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["temperance movement amadyapa vyaparaya", "colonial excise policy toddy tavern auctions", "social harm of alcoholism", "public mobilization boycotts", "nationalist leaders fr senanayake ds senanayake dr ca hewavitharana db jayatilaka wa de silva", "bridge to political struggle"] },
      { id: "his-g11-u3-007", name: "Hindu Religious and Cultural Revival (Srila Sri Arumuga Navalar, Ponnambalam Brothers)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["hindu revival northern sri lanka", "srila sri arumuga navalar jaffna", "saiva paripala sabhai 1888", "vannarponnai saiva prakasa vidyasalai", "hindu english school jaffna hindu college", "translation of tamil literature printing press", "sir ponnambalam ramanathan", "sir ponnambalam arunachalam", "hindu educational sabhai"] },
      { id: "his-g11-u3-008", name: "Islamic Cultural Revival (M.C. Siddi Lebbe, I.L.M. Abdul Azeez, Zahira College)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["islamic revival", "mc siddi lebbe advocate kandy", "promotion of english education alongside arabic and islamic studies", "muslim educational society colombo", "zahira college maradana 1892", "muslim girls school", "muslim naisen newspaper 1882", "orabi pasha arab nationalist exile influence"] }
    ],
    definitions: [
      { term: "Panadura Debate (Panadura Vadaya, 1873)", definition: "A famous two-day public theological debate in August 1873 where Buddhist scholar-monk Ven. Migettuwatte Gunananda Thero successfully defended Buddhism against Christian missionaries, igniting international interest and Buddhist renaissance.", conceptId: "his-g11-u3-003" },
      { term: "Temperance Movement (Amadyapa Vyaparaya)", definition: "A popular grassroots anti-alcohol campaign organized in early 20th-century Sri Lanka to combat colonial government tavern liquor concessions, uniting leaders and laying the foundation for political freedom movements.", conceptId: "his-g11-u3-006" }
    ]
  },
  {
    subject: "History",
    grade: 11,
    unitNumber: 4,
    unitName: "Political Changes in Sri Lanka under the British",
    bookPageStart: 51,
    bookPageEnd: 64,
    pdfPageStart: 61,
    pdfPageEnd: 74,
    pdfOffset: 10,
    textbookFilename: "grade-11-history-text-book.pdf",
    textbookReference: "Grade 11 History — Unit 4: Political Changes in Sri Lanka under the British (Book Pages 51–64 | PDF Pages 61–74)",
    matchingKeywords: [
      "political changes in sri lanka under the british", "evolution of constitutional reforms",
      "colebrooke cameron commission 1833", "executive council", "legislative council",
      "communal representation", "reforms of 1910 crewe-mccallum", "educated ceylonese seat ramanathan",
      "nationalist agitations middle class", "indian national movement influence mahatma gandhi",
      "ceylon national congress 1919 arunachalam", "manning reforms 1920", "manning-devonshire reforms 1924",
      "territorial representation", "donoughmore constitution 1931", "universal franchise adult suffrage",
      "state council of ceylon", "executive committee system", "officers of state three officers",
      "board of ministers", "leftist movement suriyamal movement", "lssp n.m. perera colvin philip",
      "agitations for dominion status", "soulbury commission 1944-1945", "parliamentary system",
      "transfer of power 1948", "lesson 4", "unit 4"
    ],
    learningOutcomes: [
      {
        id: "his-g11-u4-lo-01",
        description: "Describe the 19th-century constitutional beginnings (Colebrooke 1833) and early 20th-century middle-class agitations (1910 Crewe-McCallum, 1920/1924 Manning reforms, Ceylon National Congress)",
        requiredConcepts: ["his-g11-u4-001", "his-g11-u4-002", "his-g11-u4-003"]
      },
      {
        id: "his-g11-u4-lo-02",
        description: "Analyze the Donoughmore Constitution (1931), evaluating universal franchise, the State Council structure, and the Executive Committee system",
        requiredConcepts: ["his-g11-u4-004", "his-g11-u4-005"]
      },
      {
        id: "his-g11-u4-lo-03",
        description: "Examine the Suriyamal/Leftist movement, ministerial agitations during WWII, and the Soulbury Constitution (1947) leading to independence in 1948",
        requiredConcepts: ["his-g11-u4-006", "his-g11-u4-007"]
      }
    ],
    concepts: [
      { id: "his-g11-u4-001", name: "Colebrooke-Cameron Constitutional Reforms of 1833 (Executive & Legislative Councils)", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["colebrooke commission 1833", "establishment of executive council 6 official members", "legislative council 15 members official and non-official", "communal representation appointed by governor", "first step towards representative government"] },
      { id: "his-g11-u4-002", name: "The 1910 Crewe-McCallum Reforms and the Educated Ceylonese Seat", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["1910 constitutional reforms crewe mccallum", "demands of english-educated middle class", "introduction of elective principle limited property franchise", "educated ceylonese member sir ponnambalam ramanathan defeat of marcus fernando"] },
      { id: "his-g11-u4-003", name: "Ceylon National Congress (1919) and Manning Reforms (1920 & 1924)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["ceylon national congress 1919 first president sir ponnambalam arunachalam", "influence of indian national congress mahatma gandhi satyagraha", "manning reforms 1920 expanded legislative council", "manning devonshire reforms 1924 non-official majority territorial representation 49 members", "communal representation tensions"] },
      { id: "his-g11-u4-004", name: "The Donoughmore Constitution of 1931: Universal Adult Franchise", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["donoughmore commission 1927-1928 lord donoughmore", "donoughmore constitution 1931", "universal franchise right to vote for all adult men and women over 21 without property educational qualifications", "first in asia", "democratization of politics"] },
      { id: "his-g11-u4-005", name: "State Council, Executive Committees, and the Board of Ministers (1931–1947)", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["state council of ceylon 61 members 50 elected 8 nominated 3 officers", "seven executive committees legislative and executive functions", "seven elected ministers", "board of ministers first board vice-chairman sir db jayatilaka followed by ds senanayake", "three officers of state chief secretary legal financial governor reserve powers"] },
      { id: "his-g11-u4-006", name: "The Leftist Movement, Suriyamal Movement, and Working-Class Radicalism", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["leftist movement lanka sama samaja party lssp 1935", "suriyamal movement opposition to poppy day charity anti-imperialism", "leaders dr nm perera dr colvin r de silva philip gunawardena pieter keuneman", "demands for complete independence purna swaraj", "strikes and trade union mobilization"] },
      { id: "his-g11-u4-007", name: "Soulbury Commission (1944–1945), Soulbury Constitution (1947), and Transfer of Power", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["ministers memorandum 1944", "soulbury commission lord soulbury 1944-1945", "soulbury constitution 1947", "bicameral parliament house of representatives 101 members and senate 30 members", "prime minister and cabinet of ministers", "first parliamentary election 1947 ds senanayake unp", "independence act 1947 conferring independence 4 february 1948"] }
    ],
    definitions: [
      { term: "Universal Adult Franchise (1931)", definition: "The constitutional right granting every adult citizen (men and women aged 21 and above) the right to vote in national elections regardless of property, education, race, or caste, introduced by the Donoughmore Commission in 1931.", conceptId: "his-g11-u4-004" },
      { term: "Suriyamal Movement", definition: "An anti-imperialist movement launched in the 1930s by Sri Lankan nationalists and leftists to sell Suriya flowers on Armistice Day, promoting national self-reliance and using proceeds for local social welfare.", conceptId: "his-g11-u4-006" }
    ]
  },
  {
    subject: "History",
    grade: 11,
    unitNumber: 5,
    unitName: "Social Changes in Sri Lanka Under the British",
    bookPageStart: 65,
    bookPageEnd: 78,
    pdfPageStart: 75,
    pdfPageEnd: 88,
    pdfOffset: 10,
    textbookFilename: "grade-11-history-text-book.pdf",
    textbookReference: "Grade 11 History — Unit 5: Social Changes in Sri Lanka Under the British (Book Pages 65–78 | PDF Pages 75–88)",
    matchingKeywords: [
      "social changes in sri lanka under the british", "economic changes under the british",
      "colebrooke economic recommendations", "abolition of rajakariya compulsory labour 1833",
      "abolition of trade monopolies", "land sales policy", "plantation agriculture commercial crops",
      "coffee plantation industry", "hemileia vastatrix coffee leaf rust", "cinchona", "tea plantation industry",
      "james taylor loolcondera", "coconut cultivation indigenous planters", "rubber plantation industry",
      "transport infrastructure roads and railway kandy-colombo badulla", "postal and communication network",
      "import-export economy dual economy", "social class emergence new middle class", "plantation labour indian estate workers",
      "urban working class", "western cultural influence english education", "beneficial legacies vs harmful effects",
      "decline of traditional gamsabhava", "lesson 5", "unit 5"
    ],
    learningOutcomes: [
      {
        id: "his-g11-u5-lo-01",
        description: "Analyze the economic transformations under British rule (Colebrooke reforms, abolition of Rajakariya, commercial land sales, coffee/tea/rubber plantations, transport development, import-export dual economy)",
        requiredConcepts: ["his-g11-u5-001", "his-g11-u5-002", "his-g11-u5-003", "his-g11-u5-004"]
      },
      {
        id: "his-g11-u5-lo-02",
        description: "Examine the resulting social hierarchy (rise of the English-educated middle class, urban labourers, Indian immigrant plantation workers, and trade unions)",
        requiredConcepts: ["his-g11-u5-005", "his-g11-u5-006"]
      },
      {
        id: "his-g11-u5-lo-03",
        description: "Critically evaluate the beneficial legacies (English education, infrastructure, global trade) and harmful consequences (cultural erosion, alcoholism, land alienation, destruction of Gamsabhava)",
        requiredConcepts: ["his-g11-u5-007", "his-g11-u5-008"]
      }
    ],
    concepts: [
      { id: "his-g11-u5-001", name: "Colebrooke-Cameron Economic Reforms (Abolition of Rajakariya, Monopolies, Land Sales)", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["colebrooke economic reforms 1833", "abolition of rajakariya compulsory feudal labour", "free movement and procurement of labour for private enterprise", "abolition of cinnamon trade monopoly", "lifting restrictions on european settlement", "commercial land sales policy"] },
      { id: "his-g11-u5-002", name: "Rise of Plantation Agriculture: Coffee, Tea, Rubber, and Coconut", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["plantation agriculture", "coffee mania 1840s", "devastation by hemileia vastatrix coffee leaf fungus 1870s", "cinchona intermediary crop", "tea plantation revolution james taylor loolcondera estate 1867", "rubber cultivation hevea brasiliensis 1890s", "coconut industry expansion by indigenous planters", "crown land auctions"] },
      { id: "his-g11-u5-003", name: "Development of Transport and Communications (Roads, Railways, Postal System)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["transport infrastructure", "construction of colombo-kandy road major skinner governor barnes", "expansion to badulla nuwara eliya ratnapura", "railway network colombo-ambepussa 1864 extended to kandy 1867 badulla", "conveyance of plantation produce to colombo port", "postal service telegraph penny post"] },
      { id: "his-g11-u5-004", name: "Transition from Subsistence to a Dualistic Import-Export Economy", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["import-export economy", "dualistic economy", "modern capitalist plantation sector vs neglected traditional subsistence paddy farming", "dependence on food imports rice wheat sugar", "vulnerability to world market commodity price fluctuations"] },
      { id: "his-g11-u5-005", name: "Social Class Reconfiguration: Rise of the Ceylonese Middle Class and Elites", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["new social classes", "decline of traditional radala aristocracy", "emergence of english-educated middle class professionals lawyers doctors teachers civil servants", "wealthy capitalist elite coconut planters mine owners toll-renters arrack-renters merchants", "westernized lifestyle"] },
      { id: "his-g11-u5-006", name: "Working Class Emergence: Indian Tamil Estate Labour and Urban Proletariat", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["plantation labour", "south indian immigrant labour kanganies system harsh living lines", "urban labour class port dock workers carters washermen factory hands", "formation of early trade unions strikes ae goonesinha"] },
      { id: "his-g11-u5-007", name: "Cultural Changes: English Education, Western Lifestyle, Literature (Gamperaliya)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["cultural impact", "spread of english language and western culture", "western dress manners dining and architecture", "social transformation depicted in martin wickramasinghe gamperaliya"] },
      { id: "his-g11-u5-008", name: "Evaluation of British Rule: Beneficial Legacies vs Harmful Impacts", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["beneficial legacies english education international integration roads railways modern healthcare legal system", "harmful impacts decline of indigenous arts and knowledge alcoholism and tavern proliferation destruction of gamsabhava village councils landlessness among peasants"] }
    ],
    definitions: [
      { term: "Abolition of Rajakariya (1833)", definition: "The elimination of the traditional Sri Lankan system of compulsory customary labour service to the king or state, implemented under Colebrooke-Cameron reforms to create a free wage-labour market.", conceptId: "his-g11-u5-001" },
      { term: "Dual Economy", definition: "An economic structure where an advanced, export-oriented commercial plantation sector coexists alongside an underdeveloped, traditional subsistence peasant agricultural sector.", conceptId: "his-g11-u5-004" }
    ]
  },
  {
    subject: "History",
    grade: 11,
    unitNumber: 6,
    unitName: "Receiving of Independence to Sri Lanka",
    bookPageStart: 79,
    bookPageEnd: 105,
    pdfPageStart: 89,
    pdfPageEnd: 115,
    pdfOffset: 10,
    textbookFilename: "grade-11-history-text-book.pdf",
    textbookReference: "Grade 11 History — Unit 6: Receiving of Independence to Sri Lanka (Book Pages 79–105 | PDF Pages 89–115)",
    matchingKeywords: [
      "receiving of independence to sri lanka", "conferring of independence on sri lanka",
      "general election of 1947", "united national party unp", "ds senanayake father of the nation",
      "independence 4 february 1948", "political parties in sri lanka", "lssp 1935", "unp 1946", "slfp 1951 s.w.r.d. bandaranaike",
      "1956 general election and social transformation", "mahajana eksath peramuna mep", "first republican constitution 1972",
      "sovereign independent republic of sri lanka", "unicameral national state assembly", "non-executive president sirimavo bandaranaike",
      "second republican constitution 1978", "executive presidency j.r. jayewardene", "proportional representation", "referendum",
      "post-independence agricultural development", "peasant colonization schemes dry zone", "restoration of ancient tanks parakrama samudraya",
      "land reform commission", "accelerated mahaweli development scheme", "agricultural research institutes cri tri rri rice bathalagoda",
      "industrial policy government corporations", "textile steel sugar mineral sands plywood factories", "import substitution industrialization 1960s-1970s",
      "open market economy 1977", "social welfare state", "free education c.w.w. kannangara central colleges", "free mid-day meal",
      "university expansions peradeniya vidyodaya vidyalankara", "health services malaria cholera eradication", "food ration book subsidy",
      "bus transport nationalization ctb", "lesson 6", "unit 6"
    ],
    learningOutcomes: [
      {
        id: "his-g11-u6-lo-01",
        description: "Describe the granting of independence (1948), the rise of party politics (UNP, LSSP, SLFP), the 1956 socio-political transformation, and constitutional evolutions (1972 First Republic and 1978 Second Republic)",
        requiredConcepts: ["his-g11-u6-001", "his-g11-u6-002", "his-g11-u6-003", "his-g11-u6-004"]
      },
      {
        id: "his-g11-u6-lo-02",
        description: "Analyze post-independence agricultural and industrial development strategies (Peasant colonization, Mahaweli Scheme, Land Reforms, Import Substitution, and Open Economy)",
        requiredConcepts: ["his-g11-u6-005", "his-g11-u6-006", "his-g11-u6-007"]
      },
      {
        id: "his-g11-u6-lo-03",
        description: "Evaluate the Sri Lankan Welfare State model (Free Education C.W.W. Kannangara, University expansion, Free Healthcare, Food Subsidies, and Transport Nationalization)",
        requiredConcepts: ["his-g11-u6-008", "his-g11-u6-009"]
      }
    ],
    concepts: [
      { id: "his-g11-u6-001", name: "Independence of 4 February 1948 and Rise of Party Politics", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["independence 4 february 1948", "1947 general election", "ds senanayake first prime minister", "emergence of political parties", "lanka sama samaja party lssp 1935", "communist party cp 1943", "united national party unp 1946", "sri lanka freedom party slfp 1951 swrd bandaranaike"] },
      { id: "his-g11-u6-002", name: "The 1956 General Election and Socio-Cultural Transformation", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["1956 general election mahajana eksath peramuna mep", "swrd bandaranaike prime minister", "pancha maha balavegaya sangha veda guru govi kamkaru", "social transformation recognition of swabhasha common man culture"] },
      { id: "his-g11-u6-003", name: "The First Republican Constitution of 1972", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["first republican constitution 22 may 1972", "severing ties with british crown", "free sovereign independent republic of sri lanka", "unicameral legislature national state assembly supreme institution", "non-executive president appointed by prime minister william gopallawa", "sirimavo bandaranaike prime minister"] },
      { id: "his-g11-u6-004", name: "The Second Republican Constitution of 1978", weight: 5, isFrequentlyTested: true, category: "law", keywords: ["1978 constitution jr jayewardene", "executive presidency head of state head of government commander-in-chief", "parliament", "system of proportional representation", "national referendum", "fundamental rights chapter"] },
      { id: "his-g11-u6-005", name: "Post-Independence Agricultural Strategies and Peasant Colonization Schemes", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["agricultural development", "peasant colonization schemes minneriya hingurakgoda elahera gal oya", "ds senanayake minister of agriculture", "restoration of ancient dry zone tanks and sluices", "paddy lands act 1958", "land reform commission 1972 land ceiling 50 acres", "agricultural research institutes bathalagoda gannoruwa"] },
      { id: "his-g11-u6-006", name: "The Accelerated Mahaweli Development Project and River Valley Schemes", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["mahaweli development scheme", "accelerated mahaweli project 1977", "victoria kotmale randenigala rantembe maduru oya reservoirs", "hydroelectric power generation", "irrigation of dry zone systems b c h", "new agricultural settlements"] },
      { id: "his-g11-u6-007", name: "Industrial Policy: State Industrial Corporations, Import Substitution, and Open Market", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["industrial policy", "state corporations steel corporation oruwala", "textile mills thulhiriya veyangoda", "plywood gintota kosgama", "sugar factories hingurana kantale", "mineral sands pulmoddai", "cement kks puttalam", "import substitution industrialization 1960s-1970s", "open market economic policy 1977"] },
      { id: "his-g11-u6-008", name: "Social Welfare State: Free Education Policy (C.W.W. Kannangara) and Higher Education", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["free education policy 1945", "dr cww kannangara father of free education", "central colleges madhya maha vidyalaya", "free school textbooks uniforms mid-day meal", "expansion of university education university of ceylon peradeniya 1952", "university status to vidyodaya and vidyalankara pirivenas 1959"] },
      { id: "his-g11-u6-009", name: "Healthcare, Food Subsidies, and Transport Nationalization", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["free healthcare network hospitals dispensaries", "eradication of epidemics malaria cholera", "food subsidy ration books for rice", "nationalization of bus passenger transport ceylon transport board ctb 1958", "nationalization of colombo port"] }
    ],
    definitions: [
      { term: "Welfare State", definition: "A governance system in which the state undertakes the primary responsibility for protecting and promoting the economic and social well-being of its citizens through free education, healthcare, subsidies, and social security.", conceptId: "his-g11-u6-008" },
      { term: "Accelerated Mahaweli Development Scheme (1977)", definition: "A massive multi-purpose river valley development program condensing a 30-year master plan into 6 years to build mega-reservoirs (Victoria, Kotmale, Randenigala) for hydroelectricity, irrigation, and settlement.", conceptId: "his-g11-u6-006" }
    ]
  },
  {
    subject: "History",
    grade: 11,
    unitNumber: 7,
    unitName: "Significant Revolutions in the World",
    bookPageStart: 106,
    bookPageEnd: 125,
    pdfPageStart: 116,
    pdfPageEnd: 135,
    pdfOffset: 10,
    textbookFilename: "grade-11-history-text-book.pdf",
    textbookReference: "Grade 11 History — Unit 7: Significant Revolutions in the World (Book Pages 106–125 | PDF Pages 116–135)",
    matchingKeywords: [
      "significant revolutions in the world", "global revolutions", "war of american independence 1776",
      "thirteen american colonies", "causes of american revolution", "stamp act", "tea tax",
      "no taxation without representation", "boston tea party 1773", "continental congress",
      "george washington", "declaration of independence 4 july 1776 thomas jefferson",
      "first written federal constitution", "fundamental human rights", "french revolution 1789",
      "king louis xvi", "divine right of kings", "three estates clergy nobility commoners",
      "financial bankruptcy", "enlightenment philosophers voltaire montesquieu rousseau",
      "storming of the bastille 14 july 1789", "liberty equality fraternity", "declaration of the rights of man 1791",
      "russian revolution 1917", "tsar nicholas ii autocracy", "feudal oppression", "russo-japanese war 1904",
      "vladimir lenin bolsheviks", "march revolution", "october revolution 1917", "peace land and bread",
      "soviet union ussr", "spread of socialism and communism", "lesson 7", "unit 7"
    ],
    learningOutcomes: [
      {
        id: "his-g11-u7-lo-01",
        description: "Explain the causes, course, and global significance of the American War of Independence (1776), including the principles of fundamental rights and constitutional democracy",
        requiredConcepts: ["his-g11-u7-001", "his-g11-u7-002", "his-g11-u7-003"]
      },
      {
        id: "his-g11-u7-lo-02",
        description: "Analyze the political, social, and economic causes of the French Revolution (1789), the Storming of the Bastille, and the Declaration of the Rights of Man (Liberty, Equality, Fraternity)",
        requiredConcepts: ["his-g11-u7-004", "his-g11-u7-005", "his-g11-u7-006"]
      },
      {
        id: "his-g11-u7-lo-03",
        description: "Examine the causes and consequences of the Russian Revolution (1917), Lenin's leadership, the Bolshevik victory ('Peace, Land and Bread'), and the birth of the USSR",
        requiredConcepts: ["his-g11-u7-007", "his-g11-u7-008", "his-g11-u7-009"]
      }
    ],
    concepts: [
      { id: "his-g11-u7-001", name: "Background of 13 British American Colonies and Causes of American Revolution", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["13 north american colonies new england virginia massachusetts", "british colonial trade laws navigation acts", "stamp tax 1765", "taxation on tea glass paper sugar", "slogan no taxation without representation", "peoples opposition"] },
      { id: "his-g11-u7-002", name: "The Boston Tea Party (1773), George Washington, and the Declaration of Independence (1776)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["boston tea party 1773 dumping tea crates in boston harbour", "continental congress philadelphia", "george washington commander-in-chief", "declaration of independence 4 july 1776 drafted by thomas jefferson", "unalienable rights life liberty pursuit of happiness"] },
      { id: "his-g11-u7-003", name: "Global Impact of the American Revolution (First Written Federal Constitution)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["victory of american independence 1783 treaty of paris", "united states of america", "first written federal constitution bill of rights", "demonstrated collective struggle against colonial tyranny", "inspiration for french revolution"] },
      { id: "his-g11-u7-004", name: "Causes of the French Revolution: Political Autocracy, Social Estates, and Economic Crisis", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["causes of french revolution 1789", "autocratic monarchy king louis xvi divine right", "extravagant spending marie antoinette", "feudal class division three estates first estate clergy second estate nobility third estate commoners peasants", "heavy tax burden on third estate taille gabelle corvee", "bankruptcy of french treasury famines"] },
      { id: "his-g11-u7-005", name: "Philosophical Inspiration, Storming of the Bastille (1789), and 'Liberty, Equality, Fraternity'", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["enlightenment thinkers voltaire montesquieu separation of powers rousseau social contract", "estates-general meeting", "national assembly tennis court oath", "storming of the bastille fortress 14 july 1789 french national day", "motto liberty equality fraternity"] },
      { id: "his-g11-u7-006", name: "Consequences of French Revolution: Declaration of Human Rights (1791) and Abolition of Feudalism", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["declaration of the rights of man and of the citizen 1789-1791", "abolition of feudal privileges and tithes", "execution of louis xvi and marie antoinette", "reign of terror robespierre", "rise of napoleon bonaparte", "spread of democratic ideals across europe"] },
      { id: "his-g11-u7-007", name: "Causes of the Russian Revolution: Tsarist Autocracy, Feudalism, and WWI Hardships", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["causes of russian revolution 1917", "corrupt autocratic monarchy tsar nicholas ii romanov dynasty", "feudal oppression of peasants serfdom legacy", "disastrous defeat in russo-japanese war 1904-1905 bloody sunday 1905", "wwi military disasters severe food shortages inflation"] },
      { id: "his-g11-u7-008", name: "The Dual Revolutions of 1917 (March & October) and Lenin's Bolshevik Leadership", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["march february revolution 1917 abdication of tsar nicholas ii", "inefficient provisional government alexander kerensky", "return of vladimir lenin april theses", "popular slogan peace land and bread", "october november revolution 1917 bolshevik storming of winter palace", "soviet power established"] },
      { id: "his-g11-u7-009", name: "Consequences: Creation of the USSR, Collectivization, and Global Spread of Socialism", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["consequences of russian revolution", "abolition of private land ownership", "nationalization of industries and banks", "collective agriculture kolkhoz", "treaty of brest-litovsk exit from wwi", "establishment of the union of soviet socialist republics ussr 1922", "global spread of communist and anti-imperialist movements"] }
    ],
    definitions: [
      { term: "Declaration of the Rights of Man and of the Citizen (1789)", definition: "A fundamental charter of human liberty adopted during the French Revolution, declaring that all men are born free and equal in rights, encompassing liberty, property, security, and resistance to oppression.", conceptId: "his-g11-u7-006" },
      { term: "Bolsheviks", definition: "The radical faction of the Russian Social Democratic Labour Party led by Vladimir Lenin, which seized state power in the October Revolution of 1917 to establish the world's first socialist state.", conceptId: "his-g11-u7-008" }
    ]
  },
  {
    subject: "History",
    grade: 11,
    unitNumber: 8,
    unitName: "World Wars and Conventions",
    bookPageStart: 126,
    bookPageEnd: 154,
    pdfPageStart: 136,
    pdfPageEnd: 164,
    pdfOffset: 10,
    textbookFilename: "grade-11-history-text-book.pdf",
    textbookReference: "Grade 11 History — Unit 8: World Wars and Conventions (Book Pages 126–154 | PDF Pages 136–164)",
    matchingKeywords: [
      "world wars and conventions", "world wars and treaties", "first world war 1914-1918", "causes of wwi",
      "bismarck alliance system", "division into two military blocs triple alliance triple entente",
      "arms race", "colonial rivalry", "assassination of archduke franz ferdinand sarajevo 1914",
      "allied powers great britain france russia usa", "central powers germany austria hungary turkey bulgaria",
      "expansion of wwi", "effects of wwi devastation of life and property", "treaty of versailles 1919",
      "collapse of empires ottoman austro-hungarian russian german", "league of nations 1920",
      "aims of league of nations", "dispute settlements of league of nations", "causes for failure of league of nations",
      "second world war 1939-1945", "causes of wwii rise of hitler nazism germany", "mussolini fascism italy",
      "militarism in japan", "failure of league of nations", "invasion of poland 1 september 1939",
      "axis powers germany italy japan", "allies great britain france ussr usa", "atomic bombs hiroshima nagasaki august 1945",
      "consequences of wwii", "emergence of superpowers usa and ussr", "cold war", "non-aligned movement nam",
      "united nations organization uno", "un charter 24 october 1945 san francisco", "un objectives peace human rights",
      "un structure general assembly security council ecosoc trusteeship icj secretariat",
      "un peacekeeping suez congo kuwait cuban missile crisis", "lesson 8", "unit 8"
    ],
    learningOutcomes: [
      {
        id: "his-g11-u8-lo-01",
        description: "Analyze the causes, opposing military alliances, global course, and devastating consequences of World War I (1914–1918) and the Treaty of Versailles",
        requiredConcepts: ["his-g11-u8-001", "his-g11-u8-002", "his-g11-u8-003"]
      },
      {
        id: "his-g11-u8-lo-02",
        description: "Evaluate the League of Nations (aims, peace-keeping successes, and structural reasons for its collapse) and examine the causes and course of World War II (1939–1945)",
        requiredConcepts: ["his-g11-u8-004", "his-g11-u8-005", "his-g11-u8-006", "his-g11-u8-007"]
      },
      {
        id: "his-g11-u8-lo-03",
        description: "Examine the establishment, charter objectives, principal organs, and peace-keeping mechanisms of the United Nations Organization (UNO)",
        requiredConcepts: ["his-g11-u8-008", "his-g11-u8-009"]
      }
    ],
    concepts: [
      { id: "his-g11-u8-001", name: "Causes of World War I: Alliances, Imperialism, Militarism, and Sarajevo Incident", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["causes of world war 1 1914-1918", "bismarck foreign policy isolation of france", "division into two armed camps", "triple alliance germany austria-hungary italy", "triple entente britain france russia", "arms race naval competition", "scramble for colonies", "assassination of archduke franz ferdinand in sarajevo june 1914"] },
      { id: "his-g11-u8-002", name: "Partners and Course of World War I (Allied vs Central Powers)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["world war 1 warfare", "allied powers britain france russia later usa 1917 italy", "central powers germany austria-hungary ottoman empire bulgaria", "trench warfare western and eastern fronts", "submarines u-boats tanks poison gas aircraft", "russian exit 1917 us entry 1917"] },
      { id: "his-g11-u8-003", name: "Consequences of WWI: Treaty of Versailles (1919) and Fall of Imperial Dynasties", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["consequences of wwi", "armistice 11 november 1918", "catastrophic loss of over 20 million lives and property", "paris peace conference woodrow wilson 14 points", "harsh punitive treaty of versailles 1919 german reparations territorial loss war guilt", "collapse of russian german austro-hungarian and ottoman empires", "rise of usa as creditor nation"] },
      { id: "his-g11-u8-004", name: "The League of Nations (1920): Aims, Achievements, and Causes of Failure", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["league of nations geneva 1920", "aims prevent future wars collective security peaceful dispute settlement international cooperation", "humanitarian successes refugee rehabilitation disease control slave/drug trade curb", "disputes resolved sweden-finland aaland islands greece-bulgaria", "causes of failure absence of usa non-ratification and ussr exclusion absence of standing army lack of enforcement power against aggressors"] },
      { id: "his-g11-u8-005", name: "Causes of World War II: Rise of Fascism, Nazism, and Failure of Collective Security", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["causes of world war 2 1939-1945", "hitler rise to power nazi party repudiation of versailles treaty lebensraum", "mussolini fascism aggressive expansion invasion of ethiopia", "japanese military imperialism invasion of manchuria china", "appeasement policy britain france", "weakness and collapse of league of nations"] },
      { id: "his-g11-u8-006", name: "Course of World War II: Axis vs Allies and the Atomic Bombings (1939–1945)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["course of wwii", "german invasion of poland 1 september 1939 outbreak of war", "axis powers germany italy japan", "allied powers britain france ussr usa", "blitzkrieg operation barbarossa invasion of ussr battle of stalingrad", "pearl harbour attack dec 1941 us entry", "d-day normandy invasion 1944", "atomic bombings of hiroshima and nagasaki 6 and 9 august 1945 japanese surrender"] },
      { id: "his-g11-u8-007", name: "Consequences of WWII: Cold War, Decolonization, and Non-Aligned Movement (NAM)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["consequences of wwii", "unprecedented devastation 60-80 million dead holocaust genocide", "economic ruin of europe britain france", "division of world into two superpower blocs usa capitalism vs ussr socialism", "cold war nuclear arms race", "acceleration of decolonization in asia and africa", "non-aligned movement nam bandung 1955 belgrade 1961"] },
      { id: "his-g11-u8-008", name: "The United Nations Organization (UNO): Founding, Charter, and Objectives", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["united nations organization uno", "founding leaders roosevelt churchill stalin yalta san francisco", "un charter signed 26 june 1945 effective 24 october 1945 un day", "objectives maintain international peace and security foster friendly relations promote universal human rights and social progress"] },
      { id: "his-g11-u8-009", name: "Structure and Peacekeeping Operations of the United Nations Organization", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["six principal un organs", "general assembly town hall of the world", "security council 5 permanent veto members usa uk france russia china and 10 non-permanent", "economic and social council ecosoc unesco who unicef", "trusteeship council", "international court of justice icj the hague", "secretariat secretary-general", "peacekeeping suez crisis 1956 congo 1960 cuban missile crisis 1962 kampuchea gulf war 1991"] }
    ],
    definitions: [
      { term: "League of Nations (1920)", definition: "The first worldwide intergovernmental organization created after World War I under the Treaty of Versailles with the primary mission of maintaining world peace and collective security.", conceptId: "his-g11-u8-004" },
      { term: "United Nations Organization (UNO, 1945)", definition: "An international organization established on 24 October 1945 following World War II to prevent future global conflicts, foster international cooperation, protect human rights, and maintain international peace and security.", conceptId: "his-g11-u8-008" },
      { term: "Non-Aligned Movement (NAM)", definition: "An international forum of developing nations formed during the Cold War that chose not to formally align with or against either major superpower bloc (USA or USSR).", conceptId: "his-g11-u8-007" }
    ]
  },
];

// Converts a PostgreSQL URL to the format used by node-postgres.
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

  // Gets or creates the database pool.
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

  // Checks the database connection.
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

  // Finds the chapter page range for a topic.
  public getChapterPageBounds(
    subject: string,
    grade: number,
    topicHint: string
  ): ChapterPageBounds | null {
    const sLower = (subject || "").toLowerCase();
    const tLower = (topicHint || "").toLowerCase();

    // Filter by subject and grade first.
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

    // Check the unit name.
    for (const c of candidates) {
      const uName = c.unitName.toLowerCase();
      if (uName === tLower || tLower.includes(uName) || uName.includes(tLower)) {
        return c;
      }
    }

    // Check topic keywords.
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

    // Do not guess a chapter when only the subject and grade match.
    return null;
  }

  // Finds a chapter from topic text.
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

  // Lists registered chapters and page ranges.
  public getAvailableTextbookChapters(subject?: string, grade?: number): ChapterPageBounds[] {
    return TEXTBOOK_TOC_REGISTRY.filter((c) => {
      if (subject && c.subject.toLowerCase() !== subject.toLowerCase()) return false;
      if (grade && grade > 0 && c.grade !== grade) return false;
      return true;
    });
  }

  // Lists registered subjects.
  public getAllRegisteredSubjects(): string[] {
    const set = new Set<string>();
    for (const c of TEXTBOOK_TOC_REGISTRY) {
      set.add(c.subject);
    }
    return Array.from(set);
  }

  // Gets completed ingestion jobs.
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

  // Gets the unique ingested textbooks.
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

  // Gets an ingestion job by ID.
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

  // Closes the database pool.
  public async closePool(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export const curriculumDbService = new CurriculumDbService();
