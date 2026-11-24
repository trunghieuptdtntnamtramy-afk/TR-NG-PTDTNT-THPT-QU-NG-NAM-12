import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  FolderOpen,
  LogOut,
  Menu,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  ClassItem,
  LearningMaterial,
  StudyTask,
  SurveyResponseItem,
  ThinkingRecord,
  UserProfile,
} from '../types';

type TeacherSection = 'classes' | 'students' | 'progress' | 'surveys' | 'materials';

interface TeacherWorkspaceProps {
  user: UserProfile;
  token: string;
  onLogout: () => void;
}

interface StudentRow {
  id: number;
  full_name: string;
  class_name: string;
  email: string;
  phone: string | null;
  status: string;
  total_tasks: number;
  completed_tasks: number;
  thinking_count: number;
  avg_confidence: number | null;
}

const NAV_ITEMS: Array<{ id: TeacherSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'classes', label: 'Lớp được phân công', icon: BookOpen },
  { id: 'students', label: 'Danh sách học sinh', icon: Users },
  { id: 'progress', label: 'Theo dõi tiến độ', icon: BarChart3 },
  { id: 'surveys', label: 'Kết quả khảo sát', icon: ClipboardList },
  { id: 'materials', label: 'Kho học liệu', icon: FolderOpen },
];

export const TeacherWorkspace: React.FC<TeacherWorkspaceProps> = ({ user, token, onLogout }) => {
  const [section, setSection] = useState<TeacherSection>('classes');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [thinkingRecords, setThinkingRecords] = useState<ThinkingRecord[]>([]);
  const [surveys, setSurveys] = useState<SurveyResponseItem[]>([]);
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);

  const [studentQuery, setStudentQuery] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});

  // New Material Form
  const [matClass, setMatClass] = useState('');
  const [matSubject, setMatSubject] = useState(user.subject ?? 'Toán học');
  const [matTitle, setMatTitle] = useState('');
  const [matContent, setMatContent] = useState('');
  const [matUrl, setMatUrl] = useState('');

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  const loadData = async () => {
    setErrorMsg(null);
    try {
      const [clsRes, stuRes, survRes, matRes] = await Promise.all([
        apiRequest<{ classes: ClassItem[] }>('/api/teacher/classes', { token }),
        apiRequest<{ students: StudentRow[]; tasks: StudyTask[]; thinkingRecords: ThinkingRecord[] }>(
          '/api/teacher/students',
          { token }
        ),
        apiRequest<{ surveys: SurveyResponseItem[] }>('/api/teacher/surveys', { token }),
        apiRequest<{ materials: LearningMaterial[] }>('/api/teacher/materials', { token }),
      ]);
      setClasses(clsRes.classes);
      if (clsRes.classes.length > 0 && !matClass) {
        setMatClass(clsRes.classes[0].class_name);
      }
      setStudents(stuRes.students);
      setTasks(stuRes.tasks);
      setThinkingRecords(stuRes.thinkingRecords);
      setSurveys(survRes.surveys);
      setMaterials(matRes.materials);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải dữ liệu giáo viên.');
    }
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  const handleSaveTeacherNote = async (recordId: number) => {
    const note = (noteDrafts[recordId] ?? '').trim();
    if (!note) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/teacher/thinking/${recordId}/note`, {
        method: 'POST',
        token,
        body: { note },
      });
      setThinkingRecords((prev) => prev.map((r) => (r.id === recordId ? { ...r, teacher_note: note } : r)));
      setNoticeMsg('Đã lưu nhận xét gửi học sinh.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu nhận xét.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await apiRequest<{ material: LearningMaterial }>('/api/teacher/materials', {
        method: 'POST',
        token,
        body: {
          class_name: matClass,
          subject: matSubject,
          title: matTitle,
          content: matContent,
          resource_url: matUrl || null,
        },
      });
      setMaterials((prev) => [res.material, ...prev]);
      setMatTitle('');
      setMatContent('');
      setMatUrl('');
      setNoticeMsg(`Đã đăng học liệu cho lớp ${matClass}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể đăng học liệu.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteMaterial = async (id: number) => {
    try {
      await apiRequest(`/api/teacher/materials/${id}`, { method: 'DELETE', token });
      setMaterials((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xóa học liệu.');
    }
  };

  const filteredStudents = students.filter((s) => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      s.full_name.toLowerCase().includes(q) ||
      s.class_name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });

  const currentNav = NAV_ITEMS.find((n) => n.id === section);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#173B5E] flex">
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-white border-r border-[#E2E8F0] shrink-0">
        <div className="p-6 border-b border-[#E2E8F0]">
          <span className="font-display text-xl font-bold text-[#2878D0]">EDU SMART</span>
          <p className="text-xs text-[#64748B] mt-1">Không gian Giáo viên · {user.subject ?? 'Bộ môn'}</p>
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
            className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-[#475569] bg-[#F1F5F9] rounded-lg hover:bg-[#E2E8F0] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Đăng xuất
          </button>
        </div>
      </aside>

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
              <span>Giáo viên</span>
              <span className="mx-2">/</span>
              <span className="font-semibold text-[#173B5E]">{currentNav?.label}</span>
            </div>
          </div>

          <div className="text-xs text-[#64748B] whitespace-nowrap shrink-0">
            {user.full_name} · {user.subject ?? 'Giáo viên bộ môn'}
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

          {classes.length === 0 && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 text-sm text-[#475569]">
              Hiện tại tài khoản của bạn chưa được Quản trị viên phân công lớp giảng dạy nào. Vui lòng liên hệ Quản
              trị viên để gán lớp trong mục Phê duyệt giáo viên.
            </div>
          )}

          {/* 1. CLASSES */}
          {section === 'classes' && classes.length > 0 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Lớp được phân công</h1>
                <p className="text-sm text-[#64748B] mt-1">Tổng hợp số lượng học sinh, nhiệm vụ và học liệu theo lớp.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {classes.map((cls) => (
                  <div key={cls.id} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-[#2878D0]">Lớp {cls.class_name}</h2>
                      <span className="text-xs text-[#64748B]">Khối {cls.grade}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E2E8F0] text-center">
                      <div>
                        <p className="font-mono text-lg font-semibold text-[#173B5E] tabular-nums">
                          {cls.student_count ?? 0}
                        </p>
                        <p className="text-xs text-[#64748B]">Học sinh</p>
                      </div>
                      <div>
                        <p className="font-mono text-lg font-semibold text-[#16A995] tabular-nums">
                          {cls.task_count ?? 0}
                        </p>
                        <p className="text-xs text-[#64748B]">Nhiệm vụ</p>
                      </div>
                      <div>
                        <p className="font-mono text-lg font-semibold text-[#173B5E] tabular-nums">
                          {cls.material_count ?? 0}
                        </p>
                        <p className="text-xs text-[#64748B]">Học liệu</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. STUDENTS */}
          {section === 'students' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#173B5E]">Danh sách học sinh</h1>
                  <p className="text-sm text-[#64748B] mt-1">Học sinh thuộc các lớp bạn đang phụ trách.</p>
                </div>
                <input
                  type="search"
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Tìm theo tên, lớp, email..."
                  className="px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg bg-white w-full sm:w-72"
                />
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                {filteredStudents.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#64748B]">Không có học sinh nào.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs text-[#64748B]">
                        <tr>
                          <th className="px-5 py-3.5">Họ và tên</th>
                          <th className="px-5 py-3.5">Lớp</th>
                          <th className="px-5 py-3.5">Email</th>
                          <th className="px-5 py-3.5 text-right">Study Plan</th>
                          <th className="px-5 py-3.5 text-right">Think First</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {filteredStudents.map((s) => (
                          <tr key={s.id} className="hover:bg-[#F8FAFC]">
                            <td className="px-5 py-3.5 font-medium text-[#173B5E]">{s.full_name}</td>
                            <td className="px-5 py-3.5 font-mono text-xs">{s.class_name}</td>
                            <td className="px-5 py-3.5 text-xs text-[#64748B]">{s.email}</td>
                            <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                              {s.completed_tasks}/{s.total_tasks}
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                              {s.thinking_count} bài · TB {s.avg_confidence ?? '—'}/5
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

          {/* 3. PROGRESS & THINK FIRST REVIEW */}
          {section === 'progress' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Theo dõi tiến độ & Nhật ký tư duy</h1>
                <p className="text-sm text-[#64748B] mt-1">
                  Xem bài Think First của học sinh và gửi nhận xét chuyên môn trực tiếp.
                </p>
              </div>

              <div className="space-y-4">
                {thinkingRecords.length === 0 ? (
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-[#64748B]">
                    Chưa có nhật ký Think First nào từ học sinh lớp phụ trách.
                  </div>
                ) : (
                  thinkingRecords.map((rec) => (
                    <div key={rec.id} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
                      <div className="flex flex-wrap items-center justify-between text-xs text-[#64748B]">
                        <span>
                          <strong className="text-[#173B5E]">{rec.student_name}</strong> · Lớp {rec.class_name} ·{' '}
                          {rec.subject} · Tự tin{' '}
                          <span className="font-mono tabular-nums">{rec.confidence}/5</span>
                        </span>
                        <span className="font-mono tabular-nums">{rec.created_at}</span>
                      </div>

                      <h3 className="text-base font-semibold text-[#173B5E]">{rec.question}</h3>
                      <p className="text-sm text-[#334155]">
                        <strong>Suy nghĩ của học sinh:</strong> {rec.initial_thinking}
                      </p>

                      {rec.teacher_note && (
                        <div className="p-3 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-sm text-[#065F46]">
                          <strong>Nhận xét đã gửi:</strong> {rec.teacher_note}
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <input
                          type="text"
                          value={noteDrafts[rec.id] ?? rec.teacher_note ?? ''}
                          onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [rec.id]: e.target.value }))}
                          placeholder="Nhập nhận xét hoặc gợi ý cho học sinh..."
                          className="flex-1 px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleSaveTeacherNote(rec.id)}
                          className="px-4 py-2 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] cursor-pointer"
                        >
                          Lưu nhận xét
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2E8F0]">
                  <h2 className="text-base font-semibold text-[#173B5E]">Nhiệm vụ Study Plan gần đây</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs text-[#64748B]">
                      <tr>
                        <th className="px-5 py-3">Học sinh</th>
                        <th className="px-5 py-3">Môn</th>
                        <th className="px-5 py-3">Nhiệm vụ</th>
                        <th className="px-5 py-3">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {tasks.map((t) => (
                        <tr key={t.id}>
                          <td className="px-5 py-3 font-medium">
                            {t.student_name} ({t.class_name})
                          </td>
                          <td className="px-5 py-3">{t.subject}</td>
                          <td className="px-5 py-3">{t.task_name}</td>
                          <td className="px-5 py-3 text-xs font-medium">
                            {t.status === 'completed'
                              ? 'Hoàn thành'
                              : t.status === 'processing'
                                ? 'Đang học'
                                : 'Chờ làm'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 4. SURVEYS */}
          {section === 'surveys' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Kết quả khảo sát học sinh</h1>
                <p className="text-sm text-[#64748B] mt-1">Dữ liệu khảo sát Trước và Sau của các lớp phụ trách.</p>
              </div>
              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                {surveys.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#64748B]">Chưa có phiếu khảo sát nào.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs text-[#64748B]">
                        <tr>
                          <th className="px-5 py-3.5">Học sinh</th>
                          <th className="px-5 py-3.5">Giai đoạn</th>
                          <th className="px-5 py-3.5 text-right">Lập KH</th>
                          <th className="px-5 py-3.5 text-right">Think First</th>
                          <th className="px-5 py-3.5 text-right">Kiểm chứng</th>
                          <th className="px-5 py-3.5 text-right">Tự tin</th>
                          <th className="px-5 py-3.5">Chia sẻ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {surveys.map((s) => (
                          <tr key={s.id}>
                            <td className="px-5 py-3.5 font-medium">
                              {s.student_name} · {s.class_name}
                            </td>
                            <td className="px-5 py-3.5">{s.survey_type === 'before' ? 'Trước' : 'Sau'}</td>
                            <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                              {s.answers.selfPlanFrequency}/5
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                              {s.answers.thinkBeforeAi}/5
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                              {s.answers.verifyAiFacts}/5
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                              {s.answers.learningConfidence}/5
                            </td>
                            <td className="px-5 py-3.5 text-xs text-[#475569]">{s.answers.reflection || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. MATERIALS */}
          {section === 'materials' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Kho học liệu lớp học</h1>
                <p className="text-sm text-[#64748B] mt-1">
                  Học liệu bạn đăng sẽ hiển thị trực tiếp trong trang Tiến độ của học sinh thuộc lớp đó.
                </p>
              </div>

              {classes.length > 0 && (
                <form onSubmit={handleAddMaterial} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
                  <h2 className="text-base font-semibold text-[#173B5E]">Đăng học liệu mới</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <select
                      value={matClass}
                      onChange={(e) => setMatClass(e.target.value)}
                      className="px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg bg-white"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.class_name}>
                          Lớp {c.class_name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      required
                      value={matSubject}
                      onChange={(e) => setMatSubject(e.target.value)}
                      placeholder="Môn học"
                      className="px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg"
                    />
                    <input
                      type="url"
                      value={matUrl}
                      onChange={(e) => setMatUrl(e.target.value)}
                      placeholder="Liên kết tài liệu (https://...)"
                      className="px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={matTitle}
                    onChange={(e) => setMatTitle(e.target.value)}
                    placeholder="Tiêu đề học liệu / Chuyên đề"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg"
                  />
                  <textarea
                    required
                    rows={3}
                    value={matContent}
                    onChange={(e) => setMatContent(e.target.value)}
                    placeholder="Tóm tắt nội dung và hướng dẫn tự học..."
                    className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Đăng học liệu
                  </button>
                </form>
              )}

              <div className="space-y-3">
                {materials.map((m) => (
                  <div
                    key={m.id}
                    className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <p className="text-xs text-[#64748B]">
                        Lớp {m.class_name} · {m.subject} · <span className="font-mono">{m.created_at}</span>
                      </p>
                      <h3 className="text-base font-semibold text-[#173B5E]">{m.title}</h3>
                      <p className="text-sm text-[#475569]">{m.content}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteMaterial(m.id)}
                      className="p-2 text-[#64748B] hover:text-[#DC2626] rounded-lg cursor-pointer"
                      title="Xóa học liệu"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
