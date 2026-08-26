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
  // ── Grade 10 Science (Textbook: grade-10-science-text-book.pdf, PDF offset: 14) ──
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
      "chemical basis of life", "organic compounds", "inorganic compounds",
      "carbohydrates", "proteins", "lipids", "nucleic acids", "water",
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
        requiredConcepts: ["sci-g10-cbl-004", "sci-g10-cbl-005", "sci-g10-cbl-006", "sci-g10-cbl-007", "sci-g10-cbl-008"]
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
      {
        id: "sci-g10-cbl-001",
        name: "Elements in Living Matter",
        weight: 4,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["elements in living body", "carbon", "hydrogen", "oxygen", "nitrogen", "25 elements", "c – carbon", "c - carbon", "h - hydrogen", "o - oxygen", "n - nitrogen"]
      },
      {
        id: "sci-g10-cbl-002",
        name: "Organic Compounds",
        weight: 4,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["organic compounds", "contain carbon", "organic & inorganic", "organic and inorganic"]
      },
      {
        id: "sci-g10-cbl-003",
        name: "Inorganic Compounds",
        weight: 3,
        isFrequentlyTested: false,
        category: "definition",
        keywords: ["inorganic compounds", "do not contain carbon", "without carbon"]
      },
      {
        id: "sci-g10-cbl-004",
        name: "Monosaccharides",
        weight: 5,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["monosaccharide", "glucose", "fructose", "galactose", "simple sugar", "c6h12o6"]
      },
      {
        id: "sci-g10-cbl-005",
        name: "Disaccharides",
        weight: 4,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["disaccharide", "maltose", "sucrose", "lactose", "table sugar", "milk sugar"]
      },
      {
        id: "sci-g10-cbl-006",
        name: "Polysaccharides",
        weight: 5,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["polysaccharide", "starch", "glycogen", "cellulose", "plant cell wall"]
      },
      {
        id: "sci-g10-cbl-007",
        name: "Benedict Test for Reducing Sugars",
        weight: 5,
        isFrequentlyTested: true,
        category: "process",
        keywords: ["benedict test", "benedicts solution", "reducing sugar test", "brick red precipitate"]
      },
      {
        id: "sci-g10-cbl-008",
        name: "Iodine Test for Starch",
        weight: 4,
        isFrequentlyTested: true,
        category: "process",
        keywords: ["iodine test", "starch test", "blue-black color", "dark blue"]
      },
      {
        id: "sci-g10-cbl-009",
        name: "Amino Acids and Protein Structure",
        weight: 5,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["amino acid", "protein building blocks", "peptide bond", "polypeptide"]
      },
      {
        id: "sci-g10-cbl-010",
        name: "Significance and Functions of Proteins",
        weight: 5,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["protein functions", "enzymes", "hormones", "antibodies", "hemoglobin", "collagen"]
      },
      {
        id: "sci-g10-cbl-011",
        name: "Biuret Test for Proteins",
        weight: 5,
        isFrequentlyTested: true,
        category: "process",
        keywords: ["biuret test", "copper sulphate", "sodium hydroxide", "violet color", "purple"]
      },
      {
        id: "sci-g10-cbl-012",
        name: "Fatty Acids and Glycerol",
        weight: 4,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["fatty acid", "glycerol", "lipid building blocks", "ester bond", "triglyceride"]
      },
      {
        id: "sci-g10-cbl-013",
        name: "Significance and Functions of Lipids",
        weight: 5,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["lipid functions", "energy storage", "thermal insulation", "subcutaneous fat", "organ protection"]
      },
      {
        id: "sci-g10-cbl-014",
        name: "Sudan III Test / Translucent Spot Test for Lipids",
        weight: 4,
        isFrequentlyTested: true,
        category: "process",
        keywords: ["sudan iii", "translucent spot test", "paper spot test", "red droplets"]
      },
      {
        id: "sci-g10-cbl-015",
        name: "Nucleotides and Nucleic Acids",
        weight: 5,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["nucleic acid", "nucleic acids", "nucleotide", "nitrogenous base", "pentose sugar", "phosphate group"]
      },
      {
        id: "sci-g10-cbl-016",
        name: "DNA (Deoxyribonucleic Acid)",
        weight: 5,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["dna", "deoxyribonucleic acid", "double helix", "genetic code", "hereditary information"]
      },
      {
        id: "sci-g10-cbl-017",
        name: "RNA (Ribonucleic Acid)",
        weight: 4,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["rna", "ribonucleic acid", "single stranded", "protein synthesis", "mrna"]
      },
      {
        id: "sci-g10-cbl-018",
        name: "Properties of Water",
        weight: 5,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["properties of water", "universal solvent", "specific heat capacity", "latent heat of vaporization", "cohesion and adhesion", "surface tension"]
      },
      {
        id: "sci-g10-cbl-019",
        name: "Biological Significance of Water",
        weight: 5,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["biological importance of water", "coolant", "sweating", "transpiration pull", "aquatic habitat", "transport medium"]
      },
      {
        id: "sci-g10-cbl-020",
        name: "Essential Minerals (Calcium, Iron, Iodine)",
        weight: 5,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["calcium", "iron", "iodine", "sodium", "potassium", "phosphorus", "chlorine", "sulphur", "sulfur", "essential elements", "mineral nutrients"]
      },
      {
        id: "sci-g10-cbl-021",
        name: "Mineral Deficiency Diseases",
        weight: 5,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["mineral deficiency", "anemia", "iron deficiency", "goitre", "iodine deficiency", "osteoporosis"]
      },
      {
        id: "sci-g10-cbl-022",
        name: "Magnesium in Plants",
        weight: 4,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["magnesium in plants", "chlorophyll synthesis", "chlorosis", "yellowing of leaves"]
      },
      {
        id: "sci-g10-cbl-023",
        name: "Fat-Soluble Vitamins (A, D, E, K)",
        weight: 5,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["fat soluble vitamins", "vitamin a", "vitamin d", "vitamin e", "vitamin k"]
      },
      {
        id: "sci-g10-cbl-024",
        name: "Water-Soluble Vitamins (B Complex, C)",
        weight: 4,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["water soluble vitamins", "vitamin b", "vitamin b complex", "vitamin c", "ascorbic acid"]
      },
      {
        id: "sci-g10-cbl-025",
        name: "Vitamin Deficiency Diseases",
        weight: 5,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["night blindness", "scurvy", "bleeding gums", "rickets", "beriberi", "vitamin deficiency"]
      }
    ],
    definitions: [
      {
        term: "Organic Compound",
        definition: "Chemical compounds containing carbon naturally found in living organisms (e.g., carbohydrates, proteins, lipids, nucleic acids).",
        conceptId: "sci-g10-cbl-002"
      },
      {
        term: "Monosaccharide",
        definition: "The simplest form of carbohydrate consisting of a single sugar molecule, such as glucose, fructose, or galactose.",
        conceptId: "sci-g10-cbl-004"
      },
      {
        term: "Amino Acid",
        definition: "The basic structural building block of proteins, containing carbon, hydrogen, oxygen, nitrogen, and sometimes sulfur.",
        conceptId: "sci-g10-cbl-009"
      },
      {
        term: "Nucleotide",
        definition: "The repeating structural unit of nucleic acids (DNA and RNA), consisting of a nitrogenous base, a pentose sugar, and a phosphate group.",
        conceptId: "sci-g10-cbl-015"
      }
    ],
    formulae: [
      "General formula of Carbohydrates: C_n(H_2O)_n",
      "Glucose molecular formula: C6H12O6",
      "Lipid formation: 1 Glycerol + 3 Fatty Acids → 1 Lipid (Triglyceride) + 3 Water"
    ],
    expectedDiagrams: [
      "Pie chart of element percentages in human body (Oxygen 65%, Carbon 18%, Hydrogen 10%, Nitrogen 3%)",
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
    bookPageEnd: 46,
    pdfPageStart: 37,
    pdfPageEnd: 60,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 2: Motion in a Straight Line (Book Pages 23–46 | PDF Pages 37–60)",
    matchingKeywords: [
      "motion", "straight line", "speed", "velocity", "acceleration",
      "displacement", "distance time graph", "velocity time graph",
      "equations of motion", "newton", "lesson 2", "unit 2"
    ],
    learningOutcomes: [
      {
        id: "sci-g10-mot-lo-01",
        description: "Distinguish between scalar and vector quantities, distance and displacement",
        requiredConcepts: ["sci-g10-mot-001", "sci-g10-mot-002", "sci-g10-mot-003"]
      },
      {
        id: "sci-g10-mot-lo-02",
        description: "Define and calculate speed, velocity, uniform acceleration, and deceleration",
        requiredConcepts: ["sci-g10-mot-004", "sci-g10-mot-005", "sci-g10-mot-006"]
      },
      {
        id: "sci-g10-mot-lo-03",
        description: "Construct and interpret displacement-time and velocity-time graphs",
        requiredConcepts: ["sci-g10-mot-007", "sci-g10-mot-008", "sci-g10-mot-009"]
      },
      {
        id: "sci-g10-mot-lo-04",
        description: "Apply linear equations of motion to solve numerical problems",
        requiredConcepts: ["sci-g10-mot-010", "sci-g10-mot-011", "sci-g10-mot-012"]
      }
    ],
    concepts: [
      { id: "sci-g10-mot-001", name: "Scalar and Vector Quantities", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["scalar", "vector", "magnitude", "direction"] },
      { id: "sci-g10-mot-002", name: "Distance", weight: 3, isFrequentlyTested: false, category: "definition", keywords: ["distance", "total length of path", "scalar quantity"] },
      { id: "sci-g10-mot-003", name: "Displacement", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["displacement", "straight line distance", "initial to final point"] },
      { id: "sci-g10-mot-004", name: "Speed (Uniform and Non-uniform)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["speed", "distance/time", "rate of distance covered"] },
      { id: "sci-g10-mot-005", name: "Velocity", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["velocity", "rate of change of displacement", "displacement/time"] },
      { id: "sci-g10-mot-006", name: "Acceleration and Deceleration", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["acceleration", "deceleration", "rate of change of velocity", "retardation"] },
      { id: "sci-g10-mot-007", name: "Displacement-Time Graphs", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["displacement time graph", "gradient represents velocity", "s-t graph"] },
      { id: "sci-g10-mot-008", name: "Velocity-Time Graphs", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["velocity time graph", "v-t graph", "gradient is acceleration", "area under graph is displacement"] },
      { id: "sci-g10-mot-009", name: "Area Under Velocity-Time Graph", weight: 5, isFrequentlyTested: true, category: "calculation", keywords: ["area under v-t graph", "distance calculation", "displacement from graph"] },
      { id: "sci-g10-mot-010", name: "First Equation of Motion: v = u + at", weight: 5, isFrequentlyTested: true, category: "formula", keywords: ["v=u+at", "v = u + at", "final velocity formula"] },
      { id: "sci-g10-mot-011", name: "Second Equation of Motion: s = ut + 1/2at²", weight: 5, isFrequentlyTested: true, category: "formula", keywords: ["s=ut+1/2at^2", "s = ut + 1/2at2", "displacement formula"] },
      { id: "sci-g10-mot-012", name: "Third Equation of Motion: v² = u² + 2as", weight: 5, isFrequentlyTested: true, category: "formula", keywords: ["v^2=u^2+2as", "v2 = u2 + 2as"] },
      { id: "sci-g10-mot-013", name: "Average Velocity: s = ((u+v)/2)t", weight: 4, isFrequentlyTested: true, category: "formula", keywords: ["s = (u+v)/2 * t", "average velocity formula"] },
      { id: "sci-g10-mot-014", name: "Motion Under Gravity", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["gravitational acceleration", "g = 9.8", "g = 10 ms-2", "free fall"] },
      { id: "sci-g10-mot-015", name: "Terminal Velocity", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["terminal velocity", "constant velocity in fluid", "air resistance equals weight"] }
    ],
    definitions: [
      { term: "Displacement", definition: "The shortest straight-line distance from the initial position to the final position in a specified direction." },
      { term: "Velocity", definition: "The rate of change of displacement with respect to time (Vector quantity, SI unit: m s⁻¹)." },
      { term: "Acceleration", definition: "The rate of change of velocity with respect to time (Vector quantity, SI unit: m s⁻²)." }
    ],
    formulae: [
      "v = u + at",
      "s = ut + ½at²",
      "v² = u² + 2as",
      "s = ((u + v) / 2) × t"
    ],
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
    bookPageStart: 47,
    bookPageEnd: 72,
    pdfPageStart: 61,
    pdfPageEnd: 86,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 3: Structure of Matter (Book Pages 47–72 | PDF Pages 61–86)",
    matchingKeywords: [
      "structure of matter", "atoms", "elements", "compounds", "molecules",
      "subatomic particles", "protons", "neutrons", "electrons", "atomic number",
      "mass number", "electronic configuration", "isotopes", "lesson 3", "unit 3"
    ],
    concepts: [
      { id: "sci-g10-som-001", name: "Atomic Structure (Protons, Neutrons, Electrons)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["protons", "neutrons", "electrons", "subatomic particles", "nucleus"] },
      { id: "sci-g10-som-002", name: "Atomic Number (Z)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["atomic number", "number of protons", "z"] },
      { id: "sci-g10-som-003", name: "Mass Number (A)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["mass number", "protons + neutrons", "nucleons"] },
      { id: "sci-g10-som-004", name: "Standard Atomic Notation (AZX)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["atomic notation", "azx", "symbol notation"] },
      { id: "sci-g10-som-005", name: "Electronic Configuration (2, 8, 8, 2)", weight: 5, isFrequentlyTested: true, category: "process", keywords: ["electronic configuration", "electron shells", "k l m n shells", "valence electrons"] },
      { id: "sci-g10-som-006", name: "Isotopes and Their Applications", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["isotopes", "same atomic number different mass number", "carbon-14", "cobalt-60", "iodine-131"] },
      { id: "sci-g10-som-007", name: "Relative Atomic Mass (RAM)", weight: 4, isFrequentlyTested: true, category: "definition", keywords: ["relative atomic mass", "carbon-12 scale", "1/12th mass of carbon-12"] },
      { id: "sci-g10-som-008", name: "Metals, Non-Metals, and Metalloids", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["metals", "non-metals", "metalloids", "properties of metals", "malleable", "ductile", "sonorous"] },
      { id: "sci-g10-som-009", name: "Allotropes of Carbon", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["allotropes of carbon", "diamond", "graphite", "fullerene", "graphene"] }
    ]
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 4,
    unitName: "Photosynthesis and Plant Nutrition",
    bookPageStart: 73,
    bookPageEnd: 98,
    pdfPageStart: 87,
    pdfPageEnd: 112,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 4: Photosynthesis and Plant Nutrition (Book Pages 73–98 | PDF Pages 87–112)",
    matchingKeywords: [
      "photosynthesis", "chlorophyll", "chloroplast", "light reaction",
      "dark reaction", "calvin cycle", "carbon dioxide", "glucose",
      "stomata", "transpiration", "plant nutrition", "lesson 4", "unit 4"
    ],
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 5,
    unitName: "Force and Motion",
    bookPageStart: 99,
    bookPageEnd: 124,
    pdfPageStart: 113,
    pdfPageEnd: 138,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 5: Force and Motion (Book Pages 99–124 | PDF Pages 113–138)",
    matchingKeywords: [
      "force", "newtons laws", "f=ma", "inertia", "momentum", "friction",
      "balanced forces", "gravitational force", "weight", "mass", "lesson 5", "unit 5"
    ],
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 6,
    unitName: "Biochemical Processes — Cellular Respiration",
    bookPageStart: 125,
    bookPageEnd: 148,
    pdfPageStart: 139,
    pdfPageEnd: 162,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 6: Cellular Respiration (Book Pages 125–148 | PDF Pages 139–162)",
    matchingKeywords: [
      "cellular respiration", "aerobic respiration", "anaerobic respiration",
      "glycolysis", "krebs cycle", "atp", "mitochondria", "lactic acid",
      "fermentation", "gas exchange", "lesson 6", "unit 6"
    ],
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 7,
    unitName: "The Periodic Table",
    bookPageStart: 149,
    bookPageEnd: 174,
    pdfPageStart: 163,
    pdfPageEnd: 188,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 7: The Periodic Table (Book Pages 149–174 | PDF Pages 163–188)",
    matchingKeywords: [
      "periodic table", "periods", "groups", "alkali metals", "alkaline earth",
      "halogens", "noble gases", "electronegativity", "ionization energy",
      "atomic radius", "metals", "non-metals", "metalloids", "lesson 7", "unit 7"
    ],
  },
  {
    subject: "Science",
    grade: 10,
    unitNumber: 8,
    unitName: "Electricity and Electric Circuits",
    bookPageStart: 175,
    bookPageEnd: 202,
    pdfPageStart: 189,
    pdfPageEnd: 216,
    pdfOffset: 14,
    textbookFilename: "grade-10-science-text-book-6200ec8f089d4.pdf",
    textbookReference: "Grade 10 Science — Unit 8: Electricity and Electric Circuits (Book Pages 175–202 | PDF Pages 189–216)",
    matchingKeywords: [
      "electricity", "circuit", "current", "voltage", "resistance", "ohms law",
      "v=ir", "series circuit", "parallel circuit", "ammeter", "voltmeter", "lesson 8", "unit 8"
    ],
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
  {
    subject: "History",
    grade: 10,
    unitNumber: 1,
    unitName: "Sources of Studying History",
    bookPageStart: 1,
    bookPageEnd: 9,
    pdfPageStart: 11,
    pdfPageEnd: 19,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 1: Sources of Studying History (Book Pages 1–9 | PDF Pages 11–19)",
    matchingKeywords: [
      "sources of studying history", "classification of sources", "importance of learning history",
      "protecting archaeological sources", "literary sources", "archaeological sources",
      "inscriptions", "chronicles", "mahavamsa", "deepavamsa", "pujavaliya", "rajavaliya", "lesson 1", "unit 1"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u1-lo-01",
        description: "Classify historical sources into literary and archaeological categories and evaluate their reliability",
        requiredConcepts: ["his-g10-u1-001", "his-g10-u1-002"]
      },
      {
        id: "his-g10-u1-lo-02",
        description: "Explain the importance of learning history and methods of protecting archaeological heritage",
        requiredConcepts: ["his-g10-u1-003", "his-g10-u1-004"]
      }
    ],
    concepts: [
      { id: "his-g10-u1-001", name: "Literary Sources (Domestic & Foreign Chronicles)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["literary sources", "chronicles", "mahavamsa", "deepavamsa", "pujavaliya", "foreign accounts", "fa-hsien"] },
      { id: "his-g10-u1-002", name: "Archaeological Sources (Inscriptions, Coins, Ruins)", weight: 5, isFrequentlyTested: true, category: "definition", keywords: ["archaeological sources", "inscriptions", "coins", "pottery", "monuments", "ruins"] },
      { id: "his-g10-u1-003", name: "Importance of Learning History", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["importance of learning history", "national identity", "critical thinking", "understanding society"] },
      { id: "his-g10-u1-004", name: "Preservation and Protection of Archaeological Heritage", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["protecting archaeological sources", "antiquities ordinance", "preservation", "heritage protection"] }
    ],
    definitions: [
      { term: "Literary Sources", definition: "Written historical documents, chronicles, literary works, and travel records from the past." },
      { term: "Archaeological Sources", definition: "Material remains of past human life and activities, including inscriptions, coins, tools, pottery, and architectural ruins." }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 2,
    unitName: "Ancient Settlements",
    bookPageStart: 10,
    bookPageEnd: 30,
    pdfPageStart: 20,
    pdfPageEnd: 40,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 2: Ancient Settlements (Book Pages 10–30 | PDF Pages 20–40)",
    matchingKeywords: [
      "ancient settlements", "settlements in the pre-historic era", "settlements in proto-historic era",
      "settlements in early historic era", "stone age", "mesolithic era", "balangoda man", "pahiyangala",
      "batadombalena", "belilena", "bellanbendipelessa", "bandarawela", "ibbankatuwa", "burials", "lesson 2", "unit 2"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u2-lo-01",
        description: "Describe the characteristics of pre-historic hunter-gatherer settlements in Sri Lanka",
        requiredConcepts: ["his-g10-u2-001", "his-g10-u2-002", "his-g10-u2-003"]
      },
      {
        id: "his-g10-u2-lo-02",
        description: "Explain the transition through proto-historic and early historic iron-age settlements",
        requiredConcepts: ["his-g10-u2-004", "his-g10-u2-005"]
      }
    ],
    concepts: [
      { id: "his-g10-u2-001", name: "Pre-Historic Era Settlements and Cave Sites", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["pre-historic era", "cave habitations", "pahiyangala", "batadombalena", "kithulgala belilena", "dorawaka lena"] },
      { id: "his-g10-u2-002", name: "Mesolithic Tools and Lifestyle (Balangoda Man)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["geometric micro stone tools", "balangoda man", "homo sapiens balangodensis", "quartz tools", "food hunting"] },
      { id: "his-g10-u2-003", name: "Outdoor Settlements and Graveyards (Bellanbendipelessa, Bandarawela)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["bellanbendipelessa", "bandarawela", "burial rituals", "red ochre", "church hill"] },
      { id: "his-g10-u2-004", name: "Proto-Historic Era and Megalithic Burials (Ibbankatuwa)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["proto-historic era", "early iron age", "ibbankatuwa megalithic burial", "clay pots", "iron technology"] },
      { id: "his-g10-u2-005", name: "Early Historic Era Settlements along River Basins", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["early historic era", "river basin settlements", "malwathu oya", "kelani ganga", "anuradhapura citadel"] }
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
      "evolution of political power", "political power in sri lanka", "pre-state era", "pre state era",
      "the concept of state", "great kings who ruled this country", "prince vijaya", "mahasammatha",
      "parumaka", "parumakas", "gruhapathi", "gahapathi", "gamika", "kothgalakanda", "periyapuliyankulama",
      "thota bojaka", "king dutugemunu", "king pandukabhaya", "king vasabha", "king mahasen", "lesson 3", "unit 3", "his"
    ],
    learningOutcomes: [
      {
        id: "his-g10-epp-lo-01",
        description: "Explain the features of the pre-state era and the role of early leaders (Parumakas, Gamikas, Gahapathis)",
        requiredConcepts: ["his-g10-epp-001", "his-g10-epp-002", "his-g10-epp-003", "his-g10-epp-004", "his-g10-epp-005"]
      },
      {
        id: "his-g10-epp-lo-02",
        description: "Analyze epigraphical and archaeological evidence of early political evolution in Sri Lanka",
        requiredConcepts: ["his-g10-epp-006", "his-g10-epp-007", "his-g10-epp-008"]
      },
      {
        id: "his-g10-epp-lo-03",
        description: "Describe the transition from decentralized tribal chieftaincies to a centralized unified kingdom",
        requiredConcepts: ["his-g10-epp-009", "his-g10-epp-010"]
      }
    ],
    concepts: [
      {
        id: "his-g10-epp-001",
        name: "Pre-State Era in Ancient Sri Lanka",
        weight: 5,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["pre-state era", "pre state era", "before the arrival of prince vijaya", "rural society", "evolution of political power", "ancient times", "many kings and few queens", "authority to rule"]
      },
      {
        id: "his-g10-epp-002",
        name: "Arrival of Prince Vijaya and Early Legends",
        weight: 4,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["prince vijaya", "vijaya arrived", "6th century b.c", "first king who ruled", "came from india"]
      },
      {
        id: "his-g10-epp-003",
        name: "Concept of Mahasammatha and Kingship",
        weight: 5,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["mahasammatha", "general will of the people", "consent of people", "authority to rule", "king or queen", "people's consent"]
      },
      {
        id: "his-g10-epp-004",
        name: "The Role of Parumakas (Provincial Chieftains)",
        weight: 5,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["parumaka", "parumakas", "pramukha", "chieftains", "provincial power", "local leaders", "group of wealthy chieftains"]
      },
      {
        id: "his-g10-epp-005",
        name: "Householders and Families (Gruhapathi / Gahapathi)",
        weight: 5,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["householders", "gruhapathi", "gahapathi", "kula", "families in village", "chief of these families", "chiefs of families", "metal trader"]
      },
      {
        id: "his-g10-epp-006",
        name: "Village Chiefs and Administration (Gamikas)",
        weight: 4,
        isFrequentlyTested: true,
        category: "definition",
        keywords: ["gamika", "gamikas", "village chiefs", "village leaders"]
      },
      {
        id: "his-g10-epp-007",
        name: "Epigraphical Evidence (Kothgalakanda & Periyapuliyankulama Inscriptions)",
        weight: 5,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["kothgalakanda", "thota bojaka", "periyapuliyankulama", "cave inscription", "inscriptions of 250 b.c", "anubhava kirima", "collect taxes"]
      },
      {
        id: "his-g10-epp-008",
        name: "Archaeological Evidence of Early Settlements (Beragala & Haldummulla)",
        weight: 4,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["beragala", "haldummulla", "burial grounds", "2400 b.c", "agricultural society"]
      },
      {
        id: "his-g10-epp-009",
        name: "Evolution of State and Centralized Rule",
        weight: 5,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["concept of state", "centralized state", "unification of political power", "king pandukabhaya"]
      },
      {
        id: "his-g10-epp-010",
        name: "Great Rulers of Sri Lanka (King Dutugemunu, King Vasabha, King Mahasen)",
        weight: 5,
        isFrequentlyTested: true,
        category: "fact",
        keywords: ["king dutugemunu", "king vasabha", "king mahasen", "king devanampiyatissa", "unification", "great kings who ruled"]
      }
    ],
    definitions: [
      { term: "Mahasammatha", definition: "A ruler chosen with the general will, consent, and approval of the people." },
      { term: "Parumaka", definition: "A prominent provincial chieftain in ancient Sri Lanka who held significant regional wealth, administrative, or commercial power (derived from 'Pramukha')." },
      { term: "Gahapathi", definition: "The head of an ancient family unit ('Kula') or household in the early village settlements." }
    ],
    expectedDiagrams: [
      "Flowchart: Householders (Families) → Gamikas (Village Chiefs) → Parumakas (Chieftains)"
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 4,
    unitName: "The Ancient Society of Sri Lanka",
    bookPageStart: 44,
    bookPageEnd: 62,
    pdfPageStart: 54,
    pdfPageEnd: 72,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 4: The Ancient Society of Sri Lanka (Book Pages 44–62 | PDF Pages 54–72)",
    matchingKeywords: [
      "the ancient society of sri lanka", "the nature of ruling", "economy", "culture", "paddy farming",
      "chena cultivation", "trade", "barter system", "foreign relations", "kalinga", "pandya", "lesson 4", "unit 4"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u4-lo-01",
        description: "Examine the nature of ruling, state officials, and royal succession in ancient Sri Lanka",
        requiredConcepts: ["his-g10-u4-001", "his-g10-u4-002"]
      },
      {
        id: "his-g10-u4-lo-02",
        description: "Analyze the ancient economic patterns (agriculture, trade, taxes) and cultural life",
        requiredConcepts: ["his-g10-u4-003", "his-g10-u4-004"]
      }
    ],
    concepts: [
      { id: "his-g10-u4-001", name: "Royal Succession and Concepts of Kingship", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["nature of ruling", "royal succession", "patrilineal", "bodhisattva concept", "kingship"] },
      { id: "his-g10-u4-002", name: "State Officials and Administration (Hathi Adeka, Nagaragutika)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["hathi adeka", "bathagu", "nagaragutika", "kothurugena", "rupa adeka", "ministers"] },
      { id: "his-g10-u4-003", name: "Agricultural Economy (Paddy and Chena Cultivation)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["ancient economy", "paddy cultivation", "chena farming", "grain storage", "irrigation water taxes"] },
      { id: "his-g10-u4-004", name: "Internal Trade, Maritime Trade and Foreign Relations", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["ancient trade", "silk route", "mathota port", "godawaya", "marital relations", "kalinga", "rome"] }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 5,
    unitName: "The Ancient Science and Technology in Sri Lanka",
    bookPageStart: 63,
    bookPageEnd: 76,
    pdfPageStart: 73,
    pdfPageEnd: 86,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 5: The Ancient Science and Technology in Sri Lanka (Book Pages 63–76 | PDF Pages 73–86)",
    matchingKeywords: [
      "the ancient science and technology in sri lanka", "early stages of scientific ideas", "the maturity of scientific usage",
      "hydraulic technology", "irrigation", "large scale tanks", "tank bund", "bisokotuwa", "ralapanawa", "sorowwa",
      "yoda ela", "kala wewa", "minneriya", "parakrama samudraya", "smelting iron", "monsoon furnaces", "samanalawewa", "lesson 5", "unit 5"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u5-lo-01",
        description: "Analyze the engineering principles of ancient Sri Lankan hydraulic technology (tank bunds, Bisokotuwa, canals)",
        requiredConcepts: ["his-g10-u5-001", "his-g10-u5-002", "his-g10-u5-003"]
      },
      {
        id: "his-g10-u5-lo-02",
        description: "Explain ancient metallurgical, architectural, and medical scientific achievements",
        requiredConcepts: ["his-g10-u5-004", "his-g10-u5-005"]
      }
    ],
    concepts: [
      { id: "his-g10-u5-001", name: "Irrigation Engineering (Tank Bunds, Sluices, Bisokotuwa)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["bisokotuwa", "valve pit", "sluice gate", "sorowwa", "ralapanawa", "wave breaker", "tank bund"] },
      { id: "his-g10-u5-002", name: "Trans-basin Canals and Low Gradients (Yoda Ela)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["yoda ela", "jaya ganga", "low gradient", "trans-basin canal", "king dhatusena", "kala wewa to thisa wewa"] },
      { id: "his-g10-u5-003", name: "Great Reservoir Builders (Vasabha, Mahasen, Parakramabahu I)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["minneriya tank", "king mahasen", "parakrama samudraya", "king parakramabahu", "king vasabha 16 tanks"] },
      { id: "his-g10-u5-004", name: "Ancient Iron Smelting and Wind Furnaces (Samanalawewa)", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["iron smelting", "wind furnace", "monsoon winds", "samanalawewa furnace", "steel production"] },
      { id: "his-g10-u5-005", name: "Indigenous Medicine, Hospitals, and Architecture", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["ayurveda", "ancient hospitals", "mihintale hospital", "medicine trough", "king buddhadasa"] }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 6,
    unitName: "Historical Knowledge and Its Practical Application",
    bookPageStart: 77,
    bookPageEnd: 90,
    pdfPageStart: 87,
    pdfPageEnd: 100,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 6: Historical Knowledge and Its Practical Application (Book Pages 77–90 | PDF Pages 87–100)",
    matchingKeywords: [
      "historical knowledge and its practical application", "social organization in the historical era",
      "law and tradition", "finance and exchange", "representation of women", "local food",
      "protecting the environment", "wewalkaetiya inscription", "badulla pillar inscription", "hopitigama", "dasagam ettan", "lesson 6", "unit 6"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u6-lo-01",
        description: "Evaluate ancient Sri Lankan legal codes, trade regulations, and judicial administration",
        requiredConcepts: ["his-g10-u6-001", "his-g10-u6-002"]
      },
      {
        id: "his-g10-u6-lo-02",
        description: "Assess social roles of women, traditional dietary habits, and environmental conservation practices",
        requiredConcepts: ["his-g10-u6-003", "his-g10-u6-004", "his-g10-u6-005"]
      }
    ],
    concepts: [
      { id: "his-g10-u6-001", name: "Ancient Legal System and Judicial Decrees (Wewalkaetiya Inscription)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["wewalkaetiya inscription", "king mihindu iv", "criminal law", "dasagam ettan", "punishments for crimes"] },
      { id: "his-g10-u6-002", name: "Market Regulation, Taxation, and Trade Charters (Badulla Pillar Inscription)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["badulla pillar inscription", "hopitigama trade area", "market taxes", "trade laws", "king udaya iv"] },
      { id: "his-g10-u6-003", name: "High Social Status and Representation of Women", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["representation of women", "respect for women", "female rulers", "queen anula", "queen leelawathi", "parumakalu"] },
      { id: "his-g10-u6-004", name: "Traditional Food Culture, Preservation, and Nutrition", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["traditional food", "rice varieties", "kurakkan", "food preservation", "herbal foods"] },
      { id: "his-g10-u6-005", name: "Traditional Environmental and Watershed Conservation", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["protecting the environment", "catchment areas", "kuluwewa", "tree canopy", "water conservation"] }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 7,
    unitName: "Decline of Ancient Cities in the Dry Zone and Origin of New Kingdoms in South West",
    bookPageStart: 91,
    bookPageEnd: 105,
    pdfPageStart: 101,
    pdfPageEnd: 115,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 7: Decline of Ancient Cities and Origin of South-West Kingdoms (Book Pages 91–105 | PDF Pages 101–115)",
    matchingKeywords: [
      "decline of ancient cities", "dry zone", "origin of new kingdoms", "south west", "first urbanization",
      "downfall of polonnaruwa", "second urbanization", "kalinga magha", "dambadeniya", "yapahuwa",
      "kurunegala", "gampola", "kotte", "vijayabahu iii", "parakramabahu ii", "bhuvanekabahu i", "lesson 7", "unit 7"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u7-lo-01",
        description: "Analyze the causes for the collapse of the dry-zone civilization and shift of capitals",
        requiredConcepts: ["his-g10-u7-001", "his-g10-u7-002"]
      },
      {
        id: "his-g10-u7-lo-02",
        description: "Examine the political and cultural developments of the South-Western kingdoms (Dambadeniya to Kotte)",
        requiredConcepts: ["his-g10-u7-003", "his-g10-u7-004"]
      }
    ],
    concepts: [
      { id: "his-g10-u7-001", name: "Causes for the Downfall of Polonnaruwa and Shift to South-West", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["downfall of polonnaruwa", "kalinga magha invasion", "destruction of irrigation", "famine and malaria", "shift of capitals"] },
      { id: "his-g10-u7-002", name: "Dambadeniya Kingdom (King Vijayabahu III & Parakramabahu II)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["dambadeniya kingdom", "king vijayabahu iii", "king parakramabahu ii", "danta dhatu caritha", "literary golden age"] },
      { id: "his-g10-u7-003", name: "Fortress Capitals: Yapahuwa, Kurunegala, and Gampola", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["yapahuwa rock fortress", "king bhuvanekabahu i", "kurunegala kingdom", "gampola kingdom", "ambakke devalaya"] },
      { id: "his-g10-u7-004", name: "Kingdom of Kotte and Unification under Parakramabahu VI", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["kingdom of kotte", "king parakramabahu vi", "unification of sri lanka", "sandesha poems", "totagamuwe sri rahula"] }
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
      "kandyan kingdom", "beginning and expansion", "administrative structure", "economic system",
      "social organization", "senasammatha vikramabahu", "vimaladharmasuriya i", "rajasinha ii",
      "sri vira parakrama narendrasinha", "nayakkara dynasty", "kirti sri rajasinha", "maha adikaram", "disava", "lesson 8", "unit 8"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u8-lo-01",
        description: "Trace the origin, expansion, and defense of the independent Kandyan Kingdom",
        requiredConcepts: ["his-g10-u8-001", "his-g10-u8-002"]
      },
      {
        id: "his-g10-u8-lo-02",
        description: "Analyze the administrative hierarchy, economic structure, and social organization in Kandy",
        requiredConcepts: ["his-g10-u8-003", "his-g10-u8-004"]
      }
    ],
    concepts: [
      { id: "his-g10-u8-001", name: "Establishment of the Kingdom of Kandy (Senasammatha Vikramabahu & Vimaladharmasuriya I)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["senasammatha vikramabahu", "king vimaladharmasuriya i", "sacred tooth relic in kandy", "battle of danture"] },
      { id: "his-g10-u8-002", name: "Resistance Against Western Invaders (King Rajasinha II)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["king rajasinha ii", "battle of gannoruwa", "treaty of 1638", "guerrilla warfare in hill country"] },
      { id: "his-g10-u8-003", name: "Administrative Structure of the Kandyan State (Adikaram, Disava, Rate Mahattaya)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["maha adikaram", "disava", "rate mahattaya", "vidane", "kandyan administration", "radala"] },
      { id: "his-g10-u8-004", name: "Land Tenure, Rajakariya, and Kandyan Society", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["rajakariya system", "gabadagam", "nindagam", "viharagam", "devalagam", "kandyan society"] }
    ]
  },
  {
    subject: "History",
    grade: 10,
    unitNumber: 9,
    unitName: "Renaissance",
    bookPageStart: 118,
    bookPageEnd: 126,
    pdfPageStart: 128,
    pdfPageEnd: 136,
    pdfOffset: 10,
    textbookFilename: "grade-10-history-text-book-64017cf286c01.pdf",
    textbookReference: "Grade 10 History — Unit 9: Renaissance (Book Pages 118–126 | PDF Pages 128–136)",
    matchingKeywords: [
      "renaissance", "reasons for the renaissance", "influence of the renaissance on sri lanka",
      "fall of constantinople", "humanism", "florence", "italy", "leonardo da vinci", "michelangelo",
      "gutenberg printing press", "geographical discoveries", "maritime exploration", "lesson 9", "unit 9"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u9-lo-01",
        description: "Explain the factors contributing to the European Renaissance and its achievements in art, science, and literature",
        requiredConcepts: ["his-g10-u9-001", "his-g10-u9-002", "his-g10-u9-003"]
      },
      {
        id: "his-g10-u9-lo-02",
        description: "Assess the global impact of the Renaissance and geographical discoveries on Sri Lanka",
        requiredConcepts: ["his-g10-u9-004"]
      }
    ],
    concepts: [
      { id: "his-g10-u9-001", name: "Causes of the European Renaissance and Humanism", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["fall of constantinople 1453", "humanism", "greek and roman classics", "florence italy", "patronage of medici"] },
      { id: "his-g10-u9-002", name: "Masterpieces of Renaissance Art, Literature, and Science", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["leonardo da vinci", "mona lisa", "michelangelo", "sistine chapel", "gutenberg printing press", "galileo", "copernicus"] },
      { id: "his-g10-u9-003", name: "Age of Geographical Discoveries and Maritime Routes", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["geographical exploration", "vasco da gama", "christopher columbus", "mariner compass", "sea route to india"] },
      { id: "his-g10-u9-004", name: "Impact of European Commercial Expansion on Sri Lanka", weight: 4, isFrequentlyTested: true, category: "fact", keywords: ["influence of renaissance on sri lanka", "spice trade", "arrival of western powers", "cinnamon trade"] }
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
      "sri lanka and the western world", "arrival of the portuguese in asia", "political condition in sri lanka",
      "sri lanka and the dutch", "lourenco de almeida 1505", "king dharma parakramabahu ix", "vijayaba kollaya",
      "mayadunne", "king rajasinha i", "battle of mulleriyawa", "dutch voc", "treaty of 1638", "gerard hulft", "lesson 10", "unit 10"
    ],
    learningOutcomes: [
      {
        id: "his-g10-u10-lo-01",
        description: "Describe the arrival of the Portuguese, political division of Kotte, and resistance by Sitawaka",
        requiredConcepts: ["his-g10-u10-001", "his-g10-u10-002", "his-g10-u10-003"]
      },
      {
        id: "his-g10-u10-lo-02",
        description: "Analyze the Dutch alliance with Kandy, expulsion of Portuguese, and Dutch administration in Sri Lanka",
        requiredConcepts: ["his-g10-u10-004", "his-g10-u10-005"]
      }
    ],
    concepts: [
      { id: "his-g10-u10-001", name: "Arrival of Portuguese in 1505 and Kotte Trade Treaty", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["lourenco de almeida", "1505 arrival", "dharma parakramabahu ix", "cinnamon trade treaty", "colombo fort"] },
      { id: "his-g10-u10-002", name: "Partition of Kotte (Vijayaba Kollaya) and Rise of Sitawaka", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["vijayaba kollaya 1521", "bhuvanekabahu vii", "mayadunne", "sitawaka kingdom", "dharmapala baptism"] },
      { id: "his-g10-u10-003", name: "Sitawaka Resistance and Battle of Mulleriyawa (Rajasinha I)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["king rajasinha i", "battle of mulleriyawa", "siege of colombo", "portuguese defeats"] },
      { id: "his-g10-u10-004", name: "Dutch Alliance and Expulsion of the Portuguese (1638–1658)", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["dutch alliance", "treaty of 1638", "westerwold", "capture of galle and batticaloa", "fall of colombo 1656"] },
      { id: "his-g10-u10-005", name: "Dutch Administration, Legal System (Roman-Dutch Law), and Economy", weight: 5, isFrequentlyTested: true, category: "fact", keywords: ["dutch voc administration", "roman dutch law", "tombu registers", "cinnamon monopoly", "canals"] }
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

  /**
   * Returns or initializes the PostgreSQL connection pool.
   */
  private getPool(): Pool {
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
