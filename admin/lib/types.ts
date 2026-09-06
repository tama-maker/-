export type JobType = '秘書' | '海外営業' | 'オンラインセールス' | 'コールスタッフ';

export interface ApplicantRow {
  row: number;
  timestamp: string;
  name: string;
  email: string;
  task1Answer: string;
  task2Answer: string;
  aiLink: string;
  aiLog: string;
  readingTime: string;
  task1Time: string;
  task2Time: string;
  desiredWorkHours: string;
  finalJudge: string;
  notes: string;
  gradingStatus: string;
  gradedAt: string;
  gradingResultJson: string;
  gradingError: string;
  promptChecks: string;
  jobType: string;
  desiredJobType: string;   // フォームの「希望職種」（自動採点の職種判定に使う）
  humanJudge: string;       // 人間の最終判断（合格/不合格）
  grader: string;           // 採点者
  humanGradedAt: string;    // 人間採点日時（入っていれば人間採点済み）
}

export interface CriteriaItem {
  no: number;
  title: string;
  judgement: '〇' | '△' | '×' | '判定不可';
  relevant_text: string;
  reason: string;
}

export interface QuestionResult {
  question_id: string;
  question_title: string;
  criteria: CriteriaItem[];
  score: number;
  overall_comment: string;
}

export interface GradingResult {
  results: QuestionResult[];
  total_score: number;
  overall_judgement: '合格' | '保留' | '不合格' | '判定不可';
  overall_comment: string;
  structured_answer?: StructuredAnswer;
}

export interface StructuredAnswerItem {
  question_id: string;
  question_title: string;
  answer_text: string;
  notes: string;
}

export interface StructuredAnswer {
  applicant_name: string;
  email: string;
  answers: StructuredAnswerItem[];
}
