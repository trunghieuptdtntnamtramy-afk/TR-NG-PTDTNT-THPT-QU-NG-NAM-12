import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  BookMarked,
  Bot,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Lightbulb,
  LogOut,
  Menu,
  Plus,
  SearchCheck,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  CoachMessage,
  FactCheckLog,
  LearningMaterial,
  SelfTestAttempt,
  SelfTestQuestion,
  StudyTask,
  SurveyAnswers,
  SurveyResponseItem,
  ThinkingRecord,
  UserProfile,
} from '../types';

type StudentSection =
  | 'study-plan'
  | 'think-first'
  | 'ai-coach'
  | 'fact-check'
  | 'self-test'
  | 'survey'
  | 'progress';

interface StudentWorkspaceProps {
  user: UserProfile;
  token: string;
  onLogout: () => void;
}

const SUBJECTS = ['Toán học', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Tin học'];

const NAV_ITEMS: Array<{ id: StudentSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'study-plan', label: 'Study Plan', icon: ClipboardList },
  { id: 'think-first', label: 'Think First', icon: Lightbulb },
  { id: 'ai-coach', label: 'AI Coach', icon: Bot },
  { id: 'fact-check', label: 'Fact Check', icon: SearchCheck },
  { id: 'self-test', label: 'Self Test', icon: Sparkles },
  { id: 'survey', label: 'Khảo sát', icon: BookMarked },
  { id: 'progress', label: 'Tiến độ học tập', icon: BarChart3 },
];

export const StudentWorkspace: React.FC<StudentWorkspaceProps> = ({ user, token, onLogout }) => {
  const [section, setSection] = useState<StudentSection>('study-plan');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Study Plan state
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'processing' | 'completed'>('all');
  const [newTaskSubject, setNewTaskSubject] = useState(SUBJECTS[0]);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskGoal, setNewTaskGoal] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');

  // Think First state
  const [thinkingRecords, setThinkingRecords] = useState<ThinkingRecord[]>([]);
  const [thinkSubject, setThinkSubject] = useState(SUBJECTS[0]);
  const [thinkQuestion, setThinkQuestion] = useState('');
  const [thinkInitial, setThinkInitial] = useState('');
  const [thinkConfidence, setThinkConfidence] = useState(3);
  const [thinkWithAi, setThinkWithAi] = useState(true);
  const [reflectingId, setReflectingId] = useState<number | null>(null);

  // AI Coach state
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [coachSubject, setCoachSubject] = useState(SUBJECTS[0]);
  const [coachInput, setCoachInput] = useState('');

  // Fact Check state
  const [factLogs, setFactLogs] = useState<FactCheckLog[]>([]);
  const [factClaim, setFactClaim] = useState('');

  // Self Test state
  const [testAttempts, setTestAttempts] = useState<SelfTestAttempt[]>([]);
  const [testSubject, setTestSubject] = useState(SUBJECTS[0]);
  const [testTopic, setTestTopic] = useState('');
  const [activeQuiz, setActiveQuiz] = useState<{
    subject: string;
    topic: string;
    questions: SelfTestQuestion[];
  } | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);

  // Survey state
  const [surveys, setSurveys] = useState<SurveyResponseItem[]>([]);
  const [surveyType, setSurveyType] = useState<'before' | 'after'>('before');
  const [surveyForm, setSurveyForm] = useState<SurveyAnswers>({
    selfPlanFrequency: 3,
    thinkBeforeAi: 3,
    verifyAiFacts: 3,
    learningConfidence: 3,
    reflection: '',
  });

  // Progress & Materials state
  const [progressData, setProgressData] = useState<{
    summary: {
      totalTasks: number;
      completedTasks: number;
      processingTasks: number;
      pendingTasks: number;
      totalThinking: number;
      avgConfidence: number;
      totalSelfTests: number;
      avgScorePct: number;
      totalFactChecks: number;
    };
    recentTests: Array<{ score: number; total: number; subject: string; topic: string; created_at: string }>;
    materials: LearningMaterial[];
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  const loadSectionData = async (target: StudentSection) => {
    setErrorMsg(null);
    try {
      if (target === 'study-plan') {
        const res = await apiRequest<{ tasks: StudyTask[] }>('/api/student/tasks', { token });
        setTasks(res.tasks);
      } else if (target === 'think-first') {
        const res = await apiRequest<{ records: ThinkingRecord[] }>('/api/student/thinking', { token });
        setThinkingRecords(res.records);
      } else if (target === 'ai-coach') {
        const res = await apiRequest<{ messages: CoachMessage[] }>('/api/student/ai-coach', { token });
        setCoachMessages(res.messages);
      } else if (target === 'fact-check') {
        const res = await apiRequest<{ logs: FactCheckLog[] }>('/api/student/fact-check', { token });
        setFactLogs(res.logs);
      } else if (target === 'self-test') {
        const res = await apiRequest<{ attempts: SelfTestAttempt[] }>('/api/student/self-test', { token });
        setTestAttempts(res.attempts);
      } else if (target === 'survey') {
        const res = await apiRequest<{ surveys: SurveyResponseItem[] }>('/api/student/surveys', { token });
        setSurveys(res.surveys);
      } else if (target === 'progress') {
        const res = await apiRequest<typeof progressData>('/api/student/progress', { token });
        setProgressData(res);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải dữ liệu.');
    }
  };

  useEffect(() => {
    void loadSectionData(section);
  }, [section, token]);

  // Handlers
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ task: StudyTask }>('/api/student/tasks', {
        method: 'POST',
        token,
        body: {
          subject: newTaskSubject,
          task_name: newTaskName,
          goal: newTaskGoal,
          deadline: newTaskDeadline || null,
        },
      });
      setTasks((prev) => [res.task, ...prev]);
      setNewTaskName('');
      setNewTaskGoal('');
      setNewTaskDeadline('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể thêm nhiệm vụ.');
    } finally {
      setBusy(false);
    }
  };

  const handleTaskStatus = async (taskId: number, status: StudyTask['status']) => {
    try {
      const res = await apiRequest<{ task: StudyTask }>(`/api/student/tasks/${taskId}`, {
        method: 'PATCH',
        token,
        body: { status },
      });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái.');
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    try {
      await apiRequest(`/api/student/tasks/${taskId}`, { method: 'DELETE', token });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xóa nhiệm vụ.');
    }
  };

  const handleCreateThinking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ record: ThinkingRecord }>('/api/student/thinking', {
        method: 'POST',
        token,
        body: {
          subject: thinkSubject,
          question: thinkQuestion,
          initial_thinking: thinkInitial,
          confidence: thinkConfidence,
          request_ai_feedback: thinkWithAi,
        },
      });
      setThinkingRecords((prev) => [res.record, ...prev]);
      setThinkQuestion('');
      setThinkInitial('');
      setThinkConfidence(3);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu Think First.');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestReflection = async (recordId: number) => {
    setReflectingId(recordId);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ record: ThinkingRecord }>(`/api/student/thinking/${recordId}/reflect`, {
        method: 'POST',
        token,
      });
      setThinkingRecords((prev) => prev.map((r) => (r.id === recordId ? res.record : r)));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tạo gợi ý AI.');
    } finally {
      setReflectingId(null);
    }
  };

  const handleSendCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coachInput.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ messages: CoachMessage[] }>('/api/student/ai-coach', {
        method: 'POST',
        token,
        body: { subject: coachSubject, message: coachInput },
      });
      setCoachMessages(res.messages);
      setCoachInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI Coach không thể phản hồi.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetCoach = async () => {
    setBusy(true);
    try {
      await apiRequest('/api/student/ai-coach', { method: 'DELETE', token });
      setCoachMessages([]);
    } finally {
      setBusy(false);
    }
  };

  const handleFactCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ record: FactCheckLog }>('/api/student/fact-check', {
        method: 'POST',
        token,
        body: { claim: factClaim },
      });
      setFactLogs((prev) => [res.record, ...prev]);
      setFactClaim('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể kiểm chứng nhận định.');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ subject: string; topic: string; questions: SelfTestQuestion[] }>(
        '/api/student/self-test/generate',
        {
          method: 'POST',
          token,
          body: { subject: testSubject, topic: testTopic },
        }
      );
      setActiveQuiz(res);
      setQuizAnswers(new Array(res.questions.length).fill(-1));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tạo bài kiểm tra.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuiz) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ attempt: SelfTestAttempt }>('/api/student/self-test/submit', {
        method: 'POST',
        token,
        body: {
          subject: activeQuiz.subject,
          topic: activeQuiz.topic,
          questions: activeQuiz.questions,
          answers: quizAnswers,
        },
      });
      setTestAttempts((prev) => [res.attempt, ...prev]);
      setActiveQuiz(null);
      setTestTopic('');
      setNoticeMsg(`Đã nộp bài Self Test: đạt ${res.attempt.score}/${res.attempt.total} câu đúng.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể nộp bài.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await apiRequest<{ survey: SurveyResponseItem }>('/api/student/surveys', {
        method: 'POST',
        token,
        body: { survey_type: surveyType, answers: surveyForm },
      });
      setSurveys((prev) => {
        const filtered = prev.filter((s) => s.survey_type !== res.survey.survey_type);
        return [res.survey, ...filtered];
      });
      setNoticeMsg(
        `Đã lưu khảo sát ${surveyType === 'before' ? 'Trước khi học' : 'Sau khi học'} vào cơ sở dữ liệu.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu khảo sát.');
    } finally {
      setBusy(false);
    }
  };

  const filteredTasks = tasks.filter((t) => (taskFilter === 'all' ? true : t.status === taskFilter));
  const beforeSurvey = surveys.find((s) => s.survey_type === 'before');
  const afterSurvey = surveys.find((s) => s.survey_type === 'after');
  const currentNav = NAV_ITEMS.find((n) => n.id === section);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#173B5E] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-white border-r border-[#E2E8F0] shrink-0">
        <div className="p-6 border-b border-[#E2E8F0]">
          <span className="font-display text-xl font-bold text-[#2878D0]">EDU SMART</span>
          <p className="text-xs text-[#64748B] mt-1">Không gian Học sinh · Lớp {user.class_name ?? '—'}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  setNoticeMsg(null);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  active ? 'bg-[#EFF6FF] text-[#2878D0]' : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#173B5E]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#E2E8F0]">
          <p className="text-sm font-medium text-[#173B5E] truncate">{user.full_name}</p>
          <p className="text-xs text-[#64748B] truncate">{user.email}</p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-[#475569] bg-[#F1F5F9] rounded-lg hover:bg-[#E2E8F0] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative z-50 w-64 bg-white h-full flex flex-col border-r border-[#E2E8F0]">
            <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between">
              <span className="font-display text-lg font-bold text-[#2878D0]">EDU SMART</span>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-[#64748B]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg ${
                      section === item.id ? 'bg-[#EFF6FF] text-[#2878D0]' : 'text-[#475569]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={onLogout}
                className="w-full py-2 px-3 text-xs font-medium text-[#475569] bg-[#F1F5F9] rounded-lg"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-[#E2E8F0] text-[#475569]"
              aria-label="Mở menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-[#64748B] truncate">
              <span>Học sinh</span>
              <span className="mx-2">/</span>
              <span className="font-semibold text-[#173B5E]">{currentNav?.label}</span>
            </div>
          </div>

          <div className="text-xs text-[#64748B] whitespace-nowrap shrink-0">
            {user.full_name} · Lớp {user.class_name ?? 'Chưa phân lớp'}
          </div>
        </header>

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#B91C1C]">
              {errorMsg}
            </div>
          )}
          {noticeMsg && (
            <div className="p-3.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-sm text-[#047857]">
              {noticeMsg}
            </div>
          )}

          {/* 1. STUDY PLAN */}
          {section === 'study-plan' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#173B5E]">Kế hoạch học tập (Study Plan)</h1>
                  <p className="text-sm text-[#64748B] mt-1">
                    Quản lý nhiệm vụ theo môn học và hạn hoàn thành, lưu trực tiếp trong SQLite.
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#E2E8F0]/60 rounded-lg self-start">
                  {(
                    [
                      ['all', 'Tất cả'],
                      ['pending', 'Chờ làm'],
                      ['processing', 'Đang học'],
                      ['completed', 'Hoàn thành'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTaskFilter(key)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        taskFilter === key ? 'bg-white text-[#173B5E] shadow-xs' : 'text-[#64748B] hover:text-[#173B5E]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleAddTask} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
                <h2 className="text-base font-semibold text-[#173B5E]">Thêm nhiệm vụ học tập mới</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <select
                    value={newTaskSubject}
                    onChange={(e) => setNewTaskSubject(e.target.value)}
                    className="px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg bg-white"
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    placeholder="Tên nhiệm vụ / Bài học"
                    className="px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg"
                  />
                  <input
                    type="text"
                    value={newTaskGoal}
                    onChange={(e) => setNewTaskGoal(e.target.value)}
                    placeholder="Mục tiêu cụ thể"
                    className="px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg"
                  />
                  <input
                    type="datetime-local"
                    value={newTaskDeadline}
                    onChange={(e) => setNewTaskDeadline(e.target.value)}
                    className="px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Lưu nhiệm vụ
                </button>
              </form>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                {filteredTasks.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#64748B]">
                    Chưa có nhiệm vụ nào phù hợp bộ lọc hiện tại.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-medium text-[#64748B]">
                        <tr>
                          <th className="px-5 py-3.5">Môn học</th>
                          <th className="px-5 py-3.5">Nhiệm vụ & Mục tiêu</th>
                          <th className="px-5 py-3.5">Hạn nộp</th>
                          <th className="px-5 py-3.5">Trạng thái</th>
                          <th className="px-5 py-3.5 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {filteredTasks.map((task) => (
                          <tr key={task.id} className="hover:bg-[#F8FAFC]">
                            <td className="px-5 py-3.5 font-medium text-[#173B5E] whitespace-nowrap">{task.subject}</td>
                            <td className="px-5 py-3.5">
                              <div className="font-medium text-[#173B5E]">{task.task_name}</div>
                              {task.goal && <div className="text-xs text-[#64748B] mt-0.5">{task.goal}</div>}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-xs text-[#475569] tabular-nums whitespace-nowrap">
                              {task.deadline ? task.deadline.replace('T', ' ') : 'Không đặt hạn'}
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <select
                                value={task.status}
                                onChange={(e) =>
                                  void handleTaskStatus(task.id, e.target.value as StudyTask['status'])
                                }
                                className={`px-2.5 py-1 text-xs font-medium rounded-md border ${
                                  task.status === 'completed'
                                    ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]'
                                    : task.status === 'processing'
                                      ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
                                      : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#475569]'
                                }`}
                              >
                                <option value="pending">Chờ làm</option>
                                <option value="processing">Đang học</option>
                                <option value="completed">Hoàn thành</option>
                              </select>
                            </td>
                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => void handleDeleteTask(task.id)}
                                className="p-1.5 text-[#64748B] hover:text-[#DC2626] rounded-md cursor-pointer"
                                title="Xóa nhiệm vụ"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. THINK FIRST */}
          {section === 'think-first' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Think First — Tư duy trước khi hỏi AI</h1>
                <p className="text-sm text-[#64748B] mt-1">
                  Ghi lại suy luận ban đầu và mức độ tự tin trước khi nhận gợi ý Socratic từ AI hoặc giáo viên.
                </p>
              </div>

              <form onSubmit={handleCreateThinking} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#334155] mb-1.5">Môn học</label>
                    <select
                      value={thinkSubject}
                      onChange={(e) => setThinkSubject(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg bg-white"
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#334155] mb-1.5">
                      Mức độ tự tin ban đầu: <span className="font-mono font-semibold">{thinkConfidence}/5</span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={thinkConfidence}
                      onChange={(e) => setThinkConfidence(Number(e.target.value))}
                      className="w-full accent-[#2878D0] mt-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#334155] mb-1.5">Câu hỏi / Bài toán cần giải</label>
                  <input
                    type="text"
                    required
                    value={thinkQuestion}
                    onChange={(e) => setThinkQuestion(e.target.value)}
                    placeholder="Ví dụ: Tại sao khi nhiệt độ tăng thì tốc độ phản ứng hóa học lại tăng?"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#334155] mb-1.5">
                    Suy nghĩ & lập luận ban đầu của em
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={thinkInitial}
                    onChange={(e) => setThinkInitial(e.target.value)}
                    placeholder="Viết giả thuyết, công thức hoặc hướng giải mà em tự nghĩ ra trước..."
                    className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-[#475569] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={thinkWithAi}
                      onChange={(e) => setThinkWithAi(e.target.checked)}
                      className="rounded border-[#CBD5E1] accent-[#2878D0]"
                    />
                    Tự động xin gợi ý Socratic từ AI ngay sau khi lưu
                  </label>

                  <button
                    type="submit"
                    disabled={busy}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] disabled:opacity-60 cursor-pointer"
                  >
                    {busy ? 'Đang xử lý...' : 'Lưu nhật ký Think First'}
                  </button>
                </div>
              </form>

              <div className="space-y-4">
                {thinkingRecords.length === 0 ? (
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-[#64748B]">
                    Chưa có nhật ký Think First nào.
                  </div>
                ) : (
                  thinkingRecords.map((rec) => (
                    <div key={rec.id} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
                        <span>
                          {rec.subject} · Độ tự tin{' '}
                          <strong className="font-mono text-[#173B5E] tabular-nums">{rec.confidence}/5</strong>
                        </span>
                        <span className="font-mono tabular-nums">{rec.created_at}</span>
                      </div>

                      <h3 className="text-base font-semibold text-[#173B5E]">{rec.question}</h3>
                      <p className="text-sm text-[#334155] leading-relaxed">
                        <strong className="font-medium text-[#173B5E]">Suy nghĩ ban đầu:</strong> {rec.initial_thinking}
                      </p>

                      {rec.ai_feedback ? (
                        <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-sm text-[#334155]">
                          <p className="font-medium text-[#2878D0] mb-1">Gợi ý Socratic từ AI</p>
                          <p className="whitespace-pre-line leading-relaxed">{rec.ai_feedback}</p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={reflectingId === rec.id}
                          onClick={() => void handleRequestReflection(rec.id)}
                          className="px-3.5 py-2 text-xs font-medium text-[#2878D0] bg-[#EFF6FF] rounded-lg hover:bg-[#DBEAFE] cursor-pointer"
                        >
                          {reflectingId === rec.id ? 'Đang tạo gợi ý...' : 'Nhận gợi ý Socratic từ AI'}
                        </button>
                      )}

                      {rec.teacher_note && (
                        <div className="p-4 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-sm text-[#065F46]">
                          <p className="font-medium mb-1">Nhận xét của Giáo viên</p>
                          <p>{rec.teacher_note}</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 3. AI COACH */}
          {section === 'ai-coach' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#173B5E]">AI Coach — Cố vấn học tập Socratic</h1>
                  <p className="text-sm text-[#64748B] mt-1">
                    Hỏi đáp từng bước theo môn học. Lịch sử hội thoại được lưu trong cơ sở dữ liệu.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={coachSubject}
                    onChange={(e) => setCoachSubject(e.target.value)}
                    className="px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg bg-white"
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleResetCoach}
                    className="px-3.5 py-2 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg hover:bg-[#F1F5F9] cursor-pointer"
                  >
                    Làm mới hội thoại
                  </button>
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl flex flex-col h-[540px]">
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {coachMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-sm text-[#64748B] max-w-md mx-auto">
                      <Bot className="w-10 h-10 text-[#2878D0] mb-3" />
                      <p className="font-medium text-[#173B5E]">Bắt đầu phiên trao đổi cùng AI Coach</p>
                      <p className="mt-1">
                        Hãy nêu bài toán hoặc khái niệm em còn vướng mắc. AI Coach sẽ đặt câu hỏi gợi mở để em tự tìm
                        ra lời giải.
                      </p>
                    </div>
                  ) : (
                    coachMessages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <span className="text-xs text-[#64748B] mb-1">
                          {m.role === 'user' ? 'Em' : 'AI Coach'} · {m.subject}
                        </span>
                        <div
                          className={`max-w-2xl px-4 py-3 rounded-xl text-sm whitespace-pre-line leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-[#2878D0] text-white'
                              : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#173B5E]'
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSendCoach} className="p-4 border-t border-[#E2E8F0] flex gap-3">
                  <input
                    type="text"
                    value={coachInput}
                    onChange={(e) => setCoachInput(e.target.value)}
                    placeholder={`Hỏi AI Coach về môn ${coachSubject}...`}
                    className="flex-1 px-4 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                  />
                  <button
                    type="submit"
                    disabled={busy || !coachInput.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] disabled:opacity-60 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    {busy ? 'Đang trả lời...' : 'Gửi'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* 4. FACT CHECK */}
          {section === 'fact-check' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Fact Check — Kiểm chứng kiến thức</h1>
                <p className="text-sm text-[#64748B] mt-1">
                  Kiểm tra tính chính xác học thuật của một nhận định, định nghĩa hoặc kết quả từ AI.
                </p>
              </div>

              <form onSubmit={handleFactCheck} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
                <label className="block text-sm font-medium text-[#334155]">Nhận định cần kiểm chứng</label>
                <textarea
                  required
                  rows={3}
                  value={factClaim}
                  onChange={(e) => setFactClaim(e.target.value)}
                  placeholder="Ví dụ: Nước luôn sôi ở đúng 100 độ C trong mọi điều kiện áp suất."
                  className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] disabled:opacity-60 cursor-pointer"
                >
                  {busy ? 'Đang kiểm chứng...' : 'Kiểm chứng ngay'}
                </button>
              </form>

              <div className="space-y-4">
                {factLogs.length === 0 ? (
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-[#64748B]">
                    Chưa có lịch sử kiểm chứng nào.
                  </div>
                ) : (
                  factLogs.map((log) => (
                    <div key={log.id} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-2.5">
                      <div className="flex items-center justify-between gap-4 text-xs">
                        <span
                          className={`font-semibold ${
                            log.verdict.includes('Chính xác')
                              ? 'text-[#059669]'
                              : log.verdict.includes('Chưa')
                                ? 'text-[#DC2626]'
                                : 'text-[#D97706]'
                          }`}
                        >
                          Kết luận: {log.verdict}
                        </span>
                        <span className="font-mono text-[#64748B] tabular-nums">{log.created_at}</span>
                      </div>
                      <p className="text-base font-semibold text-[#173B5E]">"{log.claim}"</p>
                      <p className="text-sm text-[#334155] leading-relaxed">{log.explanation}</p>
                      {log.study_tip && (
                        <p className="text-xs text-[#475569] pt-2 border-t border-[#E2E8F0]">
                          Gợi ý ghi nhớ: {log.study_tip}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 5. SELF TEST */}
          {section === 'self-test' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Self Test — Tự kiểm tra năng lực</h1>
                <p className="text-sm text-[#64748B] mt-1">
                  Tạo đề trắc nghiệm 5 câu theo chủ đề bằng Gemini và lưu điểm số vào hồ sơ học tập.
                </p>
              </div>

              {!activeQuiz ? (
                <form onSubmit={handleGenerateQuiz} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <select
                      value={testSubject}
                      onChange={(e) => setTestSubject(e.target.value)}
                      className="px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg bg-white"
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      required
                      value={testTopic}
                      onChange={(e) => setTestTopic(e.target.value)}
                      placeholder="Nhập chủ đề (VD: Hàm số bậc hai, Định luật Newton...)"
                      className="md:col-span-2 px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] disabled:opacity-60 cursor-pointer"
                  >
                    {busy ? 'Đang tạo bộ 5 câu hỏi...' : 'Tạo bài Self Test'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmitQuiz} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-[#173B5E]">
                        {activeQuiz.subject} — {activeQuiz.topic}
                      </h2>
                      <p className="text-xs text-[#64748B] mt-0.5">Chọn đáp án đúng cho mỗi câu hỏi bên dưới</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveQuiz(null)}
                      className="text-xs text-[#64748B] hover:text-[#173B5E] cursor-pointer"
                    >
                      Hủy bài làm
                    </button>
                  </div>

                  {activeQuiz.questions.map((q, qIdx) => (
                    <div key={qIdx} className="space-y-2.5">
                      <p className="text-sm font-semibold text-[#173B5E]">
                        Câu {qIdx + 1}. {q.question}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {q.options.map((opt, oIdx) => (
                          <label
                            key={oIdx}
                            className={`flex items-start gap-2.5 p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                              quizAnswers[qIdx] === oIdx
                                ? 'bg-[#EFF6FF] border-[#2878D0] text-[#173B5E]'
                                : 'bg-white border-[#E2E8F0] hover:bg-[#F8FAFC]'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`q-${qIdx}`}
                              checked={quizAnswers[qIdx] === oIdx}
                              onChange={() =>
                                setQuizAnswers((prev) => prev.map((v, idx) => (idx === qIdx ? oIdx : v)))
                              }
                              className="mt-0.5 accent-[#2878D0]"
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  <button
                    type="submit"
                    disabled={busy}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-[#16A995] rounded-lg hover:bg-[#128E7D] cursor-pointer"
                  >
                    {busy ? 'Đang chấm điểm...' : 'Nộp bài & Xem kết quả'}
                  </button>
                </form>
              )}

              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-[#173B5E]">Lịch sử Self Test</h2>
                {testAttempts.length === 0 ? (
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-[#64748B]">
                    Bạn chưa hoàn thành bài Self Test nào.
                  </div>
                ) : (
                  testAttempts.map((att) => (
                    <div key={att.id} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold text-[#173B5E]">
                            {att.subject} · {att.topic}
                          </h3>
                          <p className="text-xs text-[#64748B] font-mono tabular-nums">{att.created_at}</p>
                        </div>
                        <div className="font-mono text-lg font-semibold text-[#16A995] tabular-nums">
                          {att.score}/{att.total} điểm
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                        {att.questions.map((q, idx) => (
                          <div key={idx} className="text-xs text-[#475569]">
                            <span className={q.isCorrect ? 'text-[#059669] font-semibold' : 'text-[#DC2626] font-semibold'}>
                              {q.isCorrect ? 'Đúng' : 'Sai'} · Câu {idx + 1}:
                            </span>{' '}
                            {q.question} — <em>{q.explanation}</em>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 6. SURVEY */}
          {section === 'survey' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#173B5E]">Khảo sát thói quen học tập</h1>
                  <p className="text-sm text-[#64748B] mt-1">
                    So sánh năng lực tự học Trước và Sau khi rèn luyện cùng EDU SMART.
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#E2E8F0]/60 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setSurveyType('before')}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                      surveyType === 'before' ? 'bg-white text-[#173B5E] shadow-xs' : 'text-[#64748B]'
                    }`}
                  >
                    Khảo sát Trước
                  </button>
                  <button
                    type="button"
                    onClick={() => setSurveyType('after')}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                      surveyType === 'after' ? 'bg-white text-[#173B5E] shadow-xs' : 'text-[#64748B]'
                    }`}
                  >
                    Khảo sát Sau
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveSurvey} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
                <h2 className="text-base font-semibold text-[#173B5E]">
                  Phiếu khảo sát {surveyType === 'before' ? 'Trước khi học' : 'Sau khi học'} (thang điểm 1–5)
                </h2>

                {(
                  [
                    ['selfPlanFrequency', '1. Mức độ tự lập kế hoạch học tập trước khi vào bài'],
                    ['thinkBeforeAi', '2. Thói quen tự suy nghĩ & phác thảo lời giải trước khi hỏi AI'],
                    ['verifyAiFacts', '3. Thói quen kiểm chứng lại kiến thức thay vì tin tuyệt đối'],
                    ['learningConfidence', '4. Mức độ tự tin khi tự giải quyết bài tập mới'],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[#334155]">{label}</span>
                      <span className="font-mono font-semibold text-[#2878D0] tabular-nums">
                        {surveyForm[field]}/5
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={surveyForm[field]}
                      onChange={(e) =>
                        setSurveyForm((prev) => ({ ...prev, [field]: Number(e.target.value) }))
                      }
                      className="w-full accent-[#2878D0]"
                    />
                  </div>
                ))}

                <div>
                  <label className="block text-sm font-medium text-[#334155] mb-1.5">
                    Chia sẻ thêm về phương pháp học của em
                  </label>
                  <textarea
                    rows={3}
                    value={surveyForm.reflection}
                    onChange={(e) => setSurveyForm((prev) => ({ ...prev, reflection: e.target.value }))}
                    placeholder="Em nhận thấy sự thay đổi nào trong quá trình học?"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] cursor-pointer"
                >
                  {busy ? 'Đang lưu...' : 'Lưu phiếu khảo sát'}
                </button>
              </form>

              {(beforeSurvey || afterSurvey) && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
                  <h2 className="text-base font-semibold text-[#173B5E]">Đối chiếu Trước & Sau đã lưu</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                        <tr>
                          <th className="py-2.5 pr-4">Tiêu chí</th>
                          <th className="py-2.5 px-4 text-right">Trước khi học</th>
                          <th className="py-2.5 pl-4 text-right">Sau khi học</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {(
                          [
                            ['selfPlanFrequency', 'Tự lập kế hoạch học tập'],
                            ['thinkBeforeAi', 'Tự suy nghĩ trước khi hỏi AI'],
                            ['verifyAiFacts', 'Kiểm chứng thông tin'],
                            ['learningConfidence', 'Tự tin giải quyết vấn đề'],
                          ] as const
                        ).map(([k, title]) => (
                          <tr key={k}>
                            <td className="py-2.5 pr-4 text-[#334155]">{title}</td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                              {beforeSurvey ? `${beforeSurvey.answers[k]}/5` : '—'}
                            </td>
                            <td className="py-2.5 pl-4 text-right font-mono font-semibold text-[#16A995] tabular-nums">
                              {afterSurvey ? `${afterSurvey.answers[k]}/5` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 7. PROGRESS & CLASS MATERIALS */}
          {section === 'progress' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Tiến độ học tập & Học liệu lớp</h1>
                <p className="text-sm text-[#64748B] mt-1">
                  Tổng hợp số liệu thực tế từ kế hoạch học tập, Think First, Self Test và học liệu của giáo viên lớp{' '}
                  {user.class_name ?? '—'}.
                </p>
              </div>

              {progressData && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                      <p className="text-xs text-[#64748B]">Nhiệm vụ hoàn thành</p>
                      <p className="mt-2 font-mono text-2xl font-semibold text-[#16A995] tabular-nums">
                        {progressData.summary.completedTasks}/{progressData.summary.totalTasks}
                      </p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                      <p className="text-xs text-[#64748B]">Độ tự tin Think First TB</p>
                      <p className="mt-2 font-mono text-2xl font-semibold text-[#2878D0] tabular-nums">
                        {progressData.summary.avgConfidence}/5
                      </p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                      <p className="text-xs text-[#64748B]">Điểm Self Test trung bình</p>
                      <p className="mt-2 font-mono text-2xl font-semibold text-[#173B5E] tabular-nums">
                        {progressData.summary.avgScorePct}%
                      </p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                      <p className="text-xs text-[#64748B]">Lượt kiểm chứng Fact Check</p>
                      <p className="mt-2 font-mono text-2xl font-semibold text-[#173B5E] tabular-nums">
                        {progressData.summary.totalFactChecks}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
                    <h2 className="text-base font-semibold text-[#173B5E]">
                      Học liệu từ Giáo viên lớp {user.class_name ?? '—'}
                    </h2>
                    {progressData.materials.length === 0 ? (
                      <p className="text-sm text-[#64748B]">Giáo viên lớp bạn chưa đăng học liệu mới.</p>
                    ) : (
                      <div className="divide-y divide-[#E2E8F0]">
                        {progressData.materials.map((m) => (
                          <div key={m.id} className="py-4 first:pt-0 last:pb-0 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
                              <span>
                                {m.subject} · {m.teacher_name}
                              </span>
                              <span className="font-mono tabular-nums">{m.created_at}</span>
                            </div>
                            <h3 className="text-sm font-semibold text-[#173B5E]">{m.title}</h3>
                            <p className="text-sm text-[#475569]">{m.content}</p>
                            {m.resource_url && (
                              <a
                                href={m.resource_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-[#2878D0] hover:underline"
                              >
                                Mở tài liệu tham khảo
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
