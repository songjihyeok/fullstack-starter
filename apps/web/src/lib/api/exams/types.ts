/** Exam analysis API types — mirrors backend Pydantic schemas. */

export type ExamStatus =
  | "uploaded"
  | "ocr_processing"
  | "parsing"
  | "grading"
  | "analyzing"
  | "generating"
  | "completed"
  | "failed";

export interface ExamUploadResponse {
  exam_id: string;
  status: ExamStatus;
}

export interface GradingSummary {
  total_questions: number;
  correct: number;
  incorrect: number;
  accuracy_rate: number;
}

export interface QuestionResponse {
  number: number;
  type: "multiple_choice" | "subjective";
  question_text: string;
  choices: string[] | null;
  correct_answer: string;
  user_answer: string;
  is_correct: boolean | null;
  similarity_score: number | null;
}

export interface WeaknessResponse {
  question_number: number;
  category: string;
  sub_category: string;
  error_type: string;
}

export interface CategoryStat {
  category: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface RadarDataPoint {
  axis: string;
  value: number;
}

export interface PracticeQuestion {
  question: string;
  choices: string[] | null;
  answer: string;
}

export interface PracticeSet {
  category: string;
  questions: PracticeQuestion[];
}

export interface StatisticsResponse {
  category_accuracy: CategoryStat[];
  most_frequent_mistake: string;
  radar_data: RadarDataPoint[];
  performance_summary: string;
}

export interface ExamDetailResponse {
  exam_id: string;
  title: string | null;
  status: ExamStatus;
  created_at: string;
  grading: GradingSummary | null;
  questions: QuestionResponse[];
  weakness_analysis: WeaknessResponse[];
  statistics: StatisticsResponse | null;
  practice_sets: PracticeSet[];
  error_message: string | null;
}

export interface ExamListItem {
  exam_id: string;
  title: string | null;
  status: ExamStatus;
  accuracy_rate: number | null;
  total_questions: number | null;
  created_at: string;
}

export interface PaginatedExams {
  data: ExamListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
