import americanGovernment from "../../../data/american-government.json";
import artOfTheWesternWorld from "../../../data/art-of-the-western-world.json";
import chemistry from "../../../data/chemistry.json";
import collegeAlgebra from "../../../data/college-algebra.json";
import collegeComposition from "../../../data/college-composition.json";
import collegeCompositionModular from "../../../data/college-composition-with-modular.json";
import collegeMathematics from "../../../data/college-mathematics.json";
import dentalHygiene from "../../../data/dental-hygiene-entrance-exam-prep.json";
import ethicsInAmerica from "../../../data/ethics-in-america.json";
import fundamentalsOfMath from "../../../data/fundamentals-of-math.json";
import usHistory1 from "../../../data/history-of-the-united-states-1.json";
import humanGrowthDev from "../../../data/human-growth-and-development.json";
import humanities from "../../../data/humanities.json";
import introToPsychology from "../../../data/introduction-to-psychology.json";
import macroeconomics from "../../../data/macroeconomics.json";
import microeconomics from "../../../data/microeconomics.json";
import nclexPn from "../../../data/next-gen-nclex-pn-prep.json";
import nclexRn from "../../../data/next-gen-nclex-rn-prep.json";
import nursingEntrance from "../../../data/nursing-entrance-exam-prep.json";
import sociology from "../../../data/sociology.json";
import spanish1 from "../../../data/spanish-1.json";
import spanish2 from "../../../data/spanish-2.json";
import speech from "../../../data/speech.json";
import statistics from "../../../data/statistics.json";
import worldReligions from "../../../data/world-religions.json";

type CourseData = Record<string, string>;

const COURSES: Record<string, CourseData> = {
  "American Government": americanGovernment as CourseData,
  "Art of the Western World": artOfTheWesternWorld as CourseData,
  "Chemistry": chemistry as CourseData,
  "College Algebra": collegeAlgebra as CourseData,
  "College Composition": collegeComposition as CourseData,
  "College Composition (with modular)": collegeCompositionModular as CourseData,
  "College Mathematics": collegeMathematics as CourseData,
  "Dental Hygiene Entrance Exam Prep": dentalHygiene as CourseData,
  "Ethics in America": ethicsInAmerica as CourseData,
  "Fundamentals of Math": fundamentalsOfMath as CourseData,
  "History of the United States 1": usHistory1 as CourseData,
  "Human Growth and Development": humanGrowthDev as CourseData,
  "Humanities": humanities as CourseData,
  "Introduction to Psychology": introToPsychology as CourseData,
  "Macroeconomics": macroeconomics as CourseData,
  "Microeconomics": microeconomics as CourseData,
  "Next Gen NCLEX PN Prep": nclexPn as CourseData,
  "Next Gen NCLEX RN Prep": nclexRn as CourseData,
  "Nursing Entrance Exam Prep": nursingEntrance as CourseData,
  "Sociology": sociology as CourseData,
  "Spanish 1": spanish1 as CourseData,
  "Spanish 2": spanish2 as CourseData,
  "Speech": speech as CourseData,
  "Statistics": statistics as CourseData,
  "World Religions": worldReligions as CourseData,
};

export const ALL_COURSES = Object.keys(COURSES);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCourseTopics(course: string): string[] {
  const data = COURSES[course];
  return data ? Object.keys(data) : [];
}

/**
 * Finds the best-matching chapter for a free-typed topic string.
 * Returns the matched topic label (as stored in the data file) and its raw
 * source text, or nulls if the course isn't recognized or nothing matches.
 */
export function getChapterText(
  course: string,
  topic: string
): { matchedTopic: string | null; text: string | null } {
  const data = COURSES[course];
  if (!data) return { matchedTopic: null, text: null };

  const topics = Object.keys(data);
  const nTopic = normalize(topic);

  for (const t of topics) {
    if (normalize(t) === nTopic) return { matchedTopic: t, text: data[t] };
  }

  let best: string | null = null;
  let bestScore = -1;
  for (const t of topics) {
    const nt = normalize(t);
    let score = 0;
    if (nt.includes(nTopic) || nTopic.includes(nt)) {
      score = Math.min(nt.length, nTopic.length);
    } else {
      const setA = new Set(nt.split(" "));
      const wordsB = nTopic.split(" ");
      let overlap = 0;
      for (const w of wordsB) if (setA.has(w)) overlap++;
      score = overlap;
    }
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  if (best && bestScore > 0) return { matchedTopic: best, text: data[best] };
  return { matchedTopic: null, text: null };
}
