export type UserRole = 'student' | 'teacher' | 'admin';

export interface UserProfile {
  id: number;
  full_name: string;
  birthday: string | null;
  class_name: string | null;
  subject: string | null;
  phone: string | null;
  email: string;
  role: UserRole;
  is_verified: boolean;
  is_approved: boolean;
  status: 'active' | 'locked';
  created_at: string;
}

export interface ClassItem {
  id: number;
  class_name: string;
  grade: number;
  student_count?: number;
  teacher_count?: number;
  task_count?: number;
  material_count?: number;
}

export interface PublicOverview {
  classes: ClassItem[];
  stats: {
    totalStudents: number;
    totalTeachers: number;
    totalClasses: number;
    totalTasks: number;
    totalThinking: number;
    totalMaterials: number;
  };
  authSetup: {
    hasAdminUser: boolean;
    adminPasscodeConfigured: boolean;
    needsAdminClaim: boolean;
  };
}

export interface StudyTask {
  id: number;
  student_id: number;
  subject: string;
  task_name: string;
  goal: string | null;
  deadline: string | null;
  status: 'pending' | 'processing' | 'completed';
  created_at: string;
  student_name?: string;
  class_name?: string;
}

export interface ThinkingRecord {
  id: number;
  student_id: number;
  subject: string;
  question: string;
  initial_thinking: string;
  confidence: number;
  ai_feedback: string | null;
  teacher_note: string | null;
  created_at: string;
  student_name?: string;
  class_name?: string;
}

export interface CoachMessage {
  id: number;
  student_id: number;
  subject: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface FactCheckLog {
  id: number;
  student_id: number;
  claim: string;
  verdict: string;
  explanation: string;
  study_tip: string | null;
  created_at: string;
}

export interface SelfTestQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  userAnswer?: number;
  isCorrect?: boolean;
}

export interface SelfTestAttempt {
  id: number;
  student_id: number;
  subject: string;
  topic: string;
  questions: SelfTestQuestion[];
  score: number;
  total: number;
  created_at: string;
}

export interface SurveyAnswers {
  selfPlanFrequency: number;
  thinkBeforeAi: number;
  verifyAiFacts: number;
  learningConfidence: number;
  reflection: string;
}

export interface SurveyResponseItem {
  id: number;
  student_id: number;
  survey_type: 'before' | 'after';
  answers: SurveyAnswers;
  created_at: string;
  student_name?: string;
  class_name?: string;
}

export interface LearningMaterial {
  id: number;
  teacher_id: number;
  class_name: string;
  subject: string;
  title: string;
  content: string;
  resource_url: string | null;
  created_at: string;
  teacher_name?: string;
}

export interface ActivityLog {
  id: number;
  user_id: number | null;
  action: string;
  ip_address: string | null;
  created_at: string;
  full_name?: string | null;
  role?: string | null;
}
