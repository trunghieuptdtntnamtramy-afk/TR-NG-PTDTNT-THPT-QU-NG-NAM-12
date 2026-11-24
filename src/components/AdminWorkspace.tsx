import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  ActivityLog,
  ClassItem,
  LearningMaterial,
  StudyTask,
  SurveyResponseItem,
  ThinkingRecord,
  UserProfile,
} from '../types';

type AdminSection =
  | 'overview'
  | 'users'
  | 'teachers'
  | 'classes'
  | 'learning'
  | 'surveys'
  | 'reports'
  | 'backup';

interface AdminWorkspaceProps {
  user: UserProfile;
  token: string;
  onLogout: () => void;
}

interface AssignmentRow {
  teacher_id: number;
  class_id: number;
  class_name: string;
  grade: number;
}

const NAV_ITEMS: Array<{ id: AdminSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Tổng quan toàn trường', icon: LayoutDashboard },
  { id: 'users', label: 'Quản lý tài khoản', icon: Users },
  { id: 'teachers', label: 'Phê duyệt giáo viên', icon: UserCheck },
  { id: 'classes', label: 'Quản lý lớp học', icon: BookOpen },
  { id: 'learning', label: 'Quản lý học tập', icon: ClipboardCheck },
  { id: 'surveys', label: 'Quản lý khảo sát', icon: FileSpreadsheet },
  { id: 'reports', label: 'Thống kê toàn trường', icon: BarChart3 },
  { id: 'backup', label: 'Sao lưu dữ liệu', icon: DatabaseBackup },
];

export const AdminWorkspace: React.FC<AdminWorkspaceProps> = ({ user, token, onLogout }) => {
  const [section, setSection] = useState<AdminSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [metrics, setMetrics] = useState<{
    totalUsers: number;
    totalStudents: number;
    totalTeachers: number;
    pendingTeachers: number;
    totalClasses: number;
    totalTasks: number;
    completedTasks: number;
    totalSurveys: number;
  } | null>(null);
  const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'teacher' | 'admin'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Create User form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'student' | 'teacher' | 'admin'>('student');
  const [newClass, setNewClass] = useState('10A1');
  const [newSubject, setNewSubject] = useState('Toán học');

  // Teacher assignment drafts
  const [teacherClassDrafts, setTeacherClassDrafts] = useState<Record<number, number[]>>({});

  // Create Class form
  const [classNameInput, setClassNameInput] = useState('');
  const [classGradeInput, setClassGradeInput] = useState(10);

  // Learning, Surveys, Reports
  const [learningData, setLearningData] = useState<{
    tasks: StudyTask[];
    thinkingRecords: ThinkingRecord[];
    materials: LearningMaterial[];
  } | null>(null);
  const [surveys, setSurveys] = useState<SurveyResponseItem[]>([]);
  const [reports, setReports] = useState<{
    byClass: Array<{
      class_name: string;
      grade: number;
      students: number;
      tasks: number;
      completed_tasks: number;
      avg_confidence: number | null;
    }>;
    bySubject: Array<{ subject: string; total_tasks: number; completed_tasks: number }>;
    logs: ActivityLog[];
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  const loadCoreData = async () => {
    setErrorMsg(null);
    try {
      const [ovRes, usersRes, clsRes] = await Promise.all([
        apiRequest<{ metrics: NonNullable<typeof metrics>; recentLogs: ActivityLog[] }>('/api/admin/overview', {
          token,
        }),
        apiRequest<{ users: UserProfile[]; assignments: AssignmentRow[] }>('/api/admin/users', { token }),
        apiRequest<{ classes: ClassItem[] }>('/api/admin/classes', { token }),
      ]);
      setMetrics(ovRes.metrics);
      setRecentLogs(ovRes.recentLogs);
      setUsers(usersRes.users);
      setAssignments(usersRes.assignments);
      setClasses(clsRes.classes);

      const drafts: Record<number, number[]> = {};
      for (const u of usersRes.users.filter((x) => x.role === 'teacher')) {
        drafts[u.id] = usersRes.assignments.filter((a) => a.teacher_id === u.id).map((a) => a.class_id);
      }
      setTeacherClassDrafts(drafts);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải dữ liệu quản trị.');
    }
  };

  useEffect(() => {
    void loadCoreData();
  }, [token]);

  useEffect(() => {
    if (section === 'learning') {
      void apiRequest<NonNullable<typeof learningData>>('/api/admin/learning', { token })
        .then(setLearningData)
        .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải dữ liệu học tập.'));
    } else if (section === 'surveys') {
      void apiRequest<{ surveys: SurveyResponseItem[] }>('/api/admin/surveys', { token })
        .then((r) => setSurveys(r.surveys))
        .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải khảo sát.'));
    } else if (section === 'reports') {
      void apiRequest<NonNullable<typeof reports>>('/api/admin/reports', { token })
        .then(setReports)
        .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải báo cáo.'));
    }
  }, [section, token]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      await apiRequest('/api/admin/users', {
        method: 'POST',
        token,
        body: {
          full_name: newName,
          email: newEmail,
          password: newPassword,
          role: newRole,
          class_name: newRole === 'student' ? newClass : null,
          subject: newRole === 'teacher' ? newSubject : null,
        },
      });
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNoticeMsg('Đã tạo tài khoản mới và kích hoạt thành công.');
      await loadCoreData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tạo tài khoản.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleLock = async (target: UserProfile) => {
    const nextStatus = target.status === 'active' ? 'locked' : 'active';
    try {
      await apiRequest(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        token,
        body: { status: nextStatus },
      });
      await loadCoreData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái.');
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await apiRequest(`/api/admin/users/${id}`, { method: 'DELETE', token });
      await loadCoreData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xóa tài khoản.');
    }
  };

  const handleApproveAndAssignTeacher = async (teacherId: number) => {
    setBusy(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      await apiRequest('/api/admin/teachers/assign', {
        method: 'POST',
        token,
        body: {
          teacher_id: teacherId,
          class_ids: teacherClassDrafts[teacherId] ?? [],
        },
      });
      setNoticeMsg('Đã phê duyệt giáo viên và lưu phân công lớp.');
      await loadCoreData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể phân công giáo viên.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/admin/classes', {
        method: 'POST',
        token,
        body: { class_name: classNameInput, grade: classGradeInput },
      });
      setClassNameInput('');
      setNoticeMsg('Đã thêm lớp học mới.');
      await loadCoreData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể thêm lớp học.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteClass = async (id: number) => {
    try {
      await apiRequest(`/api/admin/classes/${id}`, { method: 'DELETE', token });
      await loadCoreData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xóa lớp.');
    }
  };

  const handleDownloadBackup = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const data = await apiRequest<Record<string, unknown>>('/api/admin/backup', { token });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edu-smart-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNoticeMsg('Đã xuất tệp sao lưu cơ sở dữ liệu JSON thành công.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể sao lưu dữ liệu.');
    } finally {
      setBusy(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.class_name ?? '').toLowerCase().includes(q)
    );
  });

  const teachers = users.filter((u) => u.role === 'teacher');
  const currentNav = NAV_ITEMS.find((n) => n.id === section);

  // Aggregate survey averages
  const computeSurveyAvg = (type: 'before' | 'after', key: keyof SurveyResponseItem['answers']) => {
    const subset = surveys.filter((s) => s.survey_type === type);
    if (subset.length === 0) return '—';
    const sum = subset.reduce((acc, s) => acc + Number(s.answers[key] || 0), 0);
    return (sum / subset.length).toFixed(1);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#173B5E] flex">
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-white border-r border-[#E2E8F0] shrink-0">
        <div className="p-6 border-b border-[#E2E8F0]">
          <span className="font-display text-xl font-bold text-[#2878D0]">EDU SMART</span>
          <p className="text-xs text-[#64748B] mt-1">Quản trị hệ thống toàn trường</p>
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
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
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
              <span>Quản trị hệ thống</span>
              <span className="mx-2">/</span>
              <span className="font-semibold text-[#173B5E]">{currentNav?.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#64748B] whitespace-nowrap shrink-0">
            <ShieldCheck className="w-4 h-4 text-[#16A995]" />
            <span>{user.full_name}</span>
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

          {/* 1. OVERVIEW */}
          {section === 'overview' && metrics && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Tổng quan toàn trường</h1>
                <p className="text-sm text-[#64748B] mt-1">
                  Số liệu thời gian thực từ cơ sở dữ liệu EDU SMART.
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <p className="text-xs text-[#64748B]">Tổng tài khoản</p>
                  <p className="mt-2 font-mono text-3xl font-semibold text-[#173B5E] tabular-nums">
                    {metrics.totalUsers}
                  </p>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <p className="text-xs text-[#64748B]">Học sinh</p>
                  <p className="mt-2 font-mono text-3xl font-semibold text-[#2878D0] tabular-nums">
                    {metrics.totalStudents}
                  </p>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <p className="text-xs text-[#64748B]">Giáo viên</p>
                  <p className="mt-2 font-mono text-3xl font-semibold text-[#16A995] tabular-nums">
                    {metrics.totalTeachers}
                  </p>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <p className="text-xs text-[#64748B]">Giáo viên chờ duyệt</p>
                  <p className="mt-2 font-mono text-3xl font-semibold text-[#D97706] tabular-nums">
                    {metrics.pendingTeachers}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <p className="text-xs text-[#64748B]">Lớp học</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{metrics.totalClasses}</p>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <p className="text-xs text-[#64748B]">Nhiệm vụ học tập (Hoàn thành / Tổng)</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                    {metrics.completedTasks}/{metrics.totalTasks}
                  </p>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <p className="text-xs text-[#64748B]">Phiếu khảo sát đã nộp</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{metrics.totalSurveys}</p>
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2E8F0]">
                  <h2 className="text-base font-semibold text-[#173B5E]">Nhật ký hoạt động gần đây</h2>
                </div>
                <div className="divide-y divide-[#E2E8F0]">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
                      <div>
                        <span className="font-medium text-[#173B5E]">{log.action}</span>
                        {log.full_name && (
                          <span className="text-xs text-[#64748B] ml-2">
                            · {log.full_name} ({log.role})
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-[#64748B] tabular-nums whitespace-nowrap">
                        {log.created_at}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. USERS */}
          {section === 'users' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#173B5E]">Quản lý tài khoản</h1>
                  <p className="text-sm text-[#64748B] mt-1">Tạo, tìm kiếm, khóa hoặc mở khóa tài khoản người dùng.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 p-1 bg-[#E2E8F0]/60 rounded-lg">
                    {(
                      [
                        ['all', 'Tất cả'],
                        ['student', 'Học sinh'],
                        ['teacher', 'Giáo viên'],
                        ['admin', 'Admin'],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setRoleFilter(k)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                          roleFilter === k ? 'bg-white text-[#173B5E] shadow-xs' : 'text-[#64748B]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên, email, lớp..."
                    className="px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg bg-white"
                  />
                </div>
              </div>

              <form onSubmit={handleCreateUser} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
                <h2 className="text-base font-semibold text-[#173B5E]">Thêm tài khoản trực tiếp</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Họ và tên"
                    className="px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg"
                  />
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Email"
                    className="px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mật khẩu (>= 6 ký tự)"
                    className="px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg"
                  />
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'student' | 'teacher' | 'admin')}
                    className="px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg bg-white"
                  >
                    <option value="student">Học sinh</option>
                    <option value="teacher">Giáo viên</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                  {newRole === 'student' ? (
                    <select
                      value={newClass}
                      onChange={(e) => setNewClass(e.target.value)}
                      className="px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg bg-white"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.class_name}>
                          Lớp {c.class_name}
                        </option>
                      ))}
                    </select>
                  ) : newRole === 'teacher' ? (
                    <input
                      type="text"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      placeholder="Môn dạy"
                      className="px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg"
                    />
                  ) : (
                    <div className="px-3.5 py-2 text-xs text-[#64748B] flex items-center">Toàn quyền quản trị</div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Tạo tài khoản
                </button>
              </form>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs text-[#64748B]">
                      <tr>
                        <th className="px-5 py-3.5">Họ tên</th>
                        <th className="px-5 py-3.5">Vai trò</th>
                        <th className="px-5 py-3.5">Lớp / Môn</th>
                        <th className="px-5 py-3.5">Xác thực & Duyệt</th>
                        <th className="px-5 py-3.5">Trạng thái</th>
                        <th className="px-5 py-3.5 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-[#F8FAFC]">
                          <td className="px-5 py-3.5">
                            <div className="font-medium text-[#173B5E]">{u.full_name}</div>
                            <div className="text-xs text-[#64748B]">{u.email}</div>
                          </td>
                          <td className="px-5 py-3.5 text-xs font-medium">
                            {u.role === 'admin' ? 'Quản trị' : u.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-[#475569]">
                            {u.class_name ? `Lớp ${u.class_name}` : u.subject ?? '—'}
                          </td>
                          <td className="px-5 py-3.5 text-xs">
                            {u.is_verified ? 'Đã OTP' : 'Chưa OTP'} ·{' '}
                            {u.is_approved ? 'Đã duyệt' : 'Chờ duyệt'}
                          </td>
                          <td className="px-5 py-3.5 text-xs font-medium">
                            <span className={u.status === 'active' ? 'text-[#059669]' : 'text-[#DC2626]'}>
                              {u.status === 'active' ? 'Hoạt động' : 'Đang khóa'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap space-x-2">
                            <button
                              type="button"
                              onClick={() => void handleToggleLock(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-[#CBD5E1] rounded-md hover:bg-[#F1F5F9] cursor-pointer"
                            >
                              {u.status === 'active' ? (
                                <>
                                  <Lock className="w-3 h-3" /> Khóa
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3 h-3" /> Mở
                                </>
                              )}
                            </button>
                            {u.id !== user.id && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteUser(u.id)}
                                className="p-1.5 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                                title="Xóa tài khoản"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 3. TEACHER APPROVAL & CLASS ASSIGNMENT */}
          {section === 'teachers' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Phê duyệt giáo viên & Phân công lớp</h1>
                <p className="text-sm text-[#64748B] mt-1">
                  Duyệt tài khoản giáo viên mới và chọn các lớp được phép giảng dạy trong bảng{' '}
                  <span className="font-mono text-xs">teacher_classes</span>.
                </p>
              </div>

              <div className="space-y-4">
                {teachers.map((t) => {
                  const selectedIds = teacherClassDrafts[t.id] ?? [];
                  return (
                    <div key={t.id} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-semibold text-[#173B5E]">{t.full_name}</h2>
                          <p className="text-xs text-[#64748B]">
                            {t.email} · Môn: {t.subject ?? '—'} ·{' '}
                            <span className={t.is_approved ? 'text-[#059669] font-medium' : 'text-[#D97706] font-medium'}>
                              {t.is_approved ? 'Đã phê duyệt' : 'Đang chờ phê duyệt'}
                            </span>
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleApproveAndAssignTeacher(t.id)}
                          className="px-4 py-2 text-sm font-medium text-white bg-[#16A995] rounded-lg hover:bg-[#128E7D] cursor-pointer"
                        >
                          {t.is_approved ? 'Lưu phân công lớp' : 'Phê duyệt & Lưu lớp'}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-3 pt-2 border-t border-[#E2E8F0]">
                        {classes.map((c) => {
                          const checked = selectedIds.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${
                                checked ? 'bg-[#EFF6FF] border-[#2878D0] text-[#173B5E]' : 'border-[#CBD5E1] text-[#475569]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...selectedIds, c.id]
                                    : selectedIds.filter((id) => id !== c.id);
                                  setTeacherClassDrafts((prev) => ({ ...prev, [t.id]: next }));
                                }}
                                className="accent-[#2878D0]"
                              />
                              <span>Lớp {c.class_name}</span>
                            </label>
                          );
                        })}
                      </div>

                      {assignments.some((a) => a.teacher_id === t.id) && (
                        <p className="text-xs text-[#64748B]">
                          Đang phụ trách:{' '}
                          {assignments
                            .filter((a) => a.teacher_id === t.id)
                            .map((a) => a.class_name)
                            .join(', ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. CLASSES */}
          {section === 'classes' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Quản lý lớp học</h1>
                <p className="text-sm text-[#64748B] mt-1">Thêm hoặc chỉnh sửa danh sách lớp toàn trường.</p>
              </div>

              <form onSubmit={handleCreateClass} className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-wrap gap-3">
                <input
                  type="text"
                  required
                  value={classNameInput}
                  onChange={(e) => setClassNameInput(e.target.value)}
                  placeholder="Tên lớp (VD: 10A3)"
                  className="px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg"
                />
                <select
                  value={classGradeInput}
                  onChange={(e) => setClassGradeInput(Number(e.target.value))}
                  className="px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg bg-white"
                >
                  {[10, 11, 12].map((g) => (
                    <option key={g} value={g}>
                      Khối {g}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Thêm lớp học
                </button>
              </form>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs text-[#64748B]">
                    <tr>
                      <th className="px-5 py-3.5">Tên lớp</th>
                      <th className="px-5 py-3.5">Khối</th>
                      <th className="px-5 py-3.5 text-right">Học sinh</th>
                      <th className="px-5 py-3.5 text-right">Giáo viên phân công</th>
                      <th className="px-5 py-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {classes.map((c) => (
                      <tr key={c.id}>
                        <td className="px-5 py-3.5 font-semibold text-[#173B5E]">{c.class_name}</td>
                        <td className="px-5 py-3.5 font-mono tabular-nums">Khối {c.grade}</td>
                        <td className="px-5 py-3.5 text-right font-mono tabular-nums">{c.student_count ?? 0}</td>
                        <td className="px-5 py-3.5 text-right font-mono tabular-nums">{c.teacher_count ?? 0}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => void handleDeleteClass(c.id)}
                            className="p-1.5 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. LEARNING */}
          {section === 'learning' && learningData && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Quản lý học tập toàn trường</h1>
                <p className="text-sm text-[#64748B] mt-1">
                  Theo dõi nhiệm vụ Study Plan, nhật ký Think First và học liệu của giáo viên.
                </p>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2E8F0]">
                  <h2 className="text-base font-semibold text-[#173B5E]">Nhiệm vụ Study Plan mới nhất</h2>
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
                      {learningData.tasks.map((t) => (
                        <tr key={t.id}>
                          <td className="px-5 py-3 font-medium">
                            {t.student_name} · {t.class_name}
                          </td>
                          <td className="px-5 py-3">{t.subject}</td>
                          <td className="px-5 py-3">{t.task_name}</td>
                          <td className="px-5 py-3 text-xs">{t.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2E8F0]">
                  <h2 className="text-base font-semibold text-[#173B5E]">Nhật ký Think First</h2>
                </div>
                <div className="divide-y divide-[#E2E8F0]">
                  {learningData.thinkingRecords.map((r) => (
                    <div key={r.id} className="p-5 space-y-1">
                      <div className="text-xs text-[#64748B]">
                        {r.student_name} ({r.class_name}) · {r.subject} · Tự tin{' '}
                        <span className="font-mono tabular-nums">{r.confidence}/5</span>
                      </div>
                      <p className="text-sm font-semibold text-[#173B5E]">{r.question}</p>
                      <p className="text-sm text-[#475569]">{r.initial_thinking}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 6. SURVEYS */}
          {section === 'surveys' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Quản lý khảo sát Trước & Sau</h1>
                <p className="text-sm text-[#64748B] mt-1">
                  So sánh điểm trung bình toàn trường giữa giai đoạn Trước và Sau khi học với EDU SMART.
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {(
                  [
                    ['selfPlanFrequency', 'Tự lập kế hoạch'],
                    ['thinkBeforeAi', 'Think First trước AI'],
                    ['verifyAiFacts', 'Kiểm chứng Fact Check'],
                    ['learningConfidence', 'Tự tin giải quyết'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                    <p className="text-xs text-[#64748B]">{label}</p>
                    <p className="mt-2 font-mono text-lg font-semibold text-[#173B5E] tabular-nums">
                      Trước {computeSurveyAvg('before', key)} → Sau{' '}
                      <span className="text-[#16A995]">{computeSurveyAvg('after', key)}</span>
                    </p>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs text-[#64748B]">
                      <tr>
                        <th className="px-5 py-3.5">Học sinh</th>
                        <th className="px-5 py-3.5">Giai đoạn</th>
                        <th className="px-5 py-3.5 text-right">Lập KH</th>
                        <th className="px-5 py-3.5 text-right">Think First</th>
                        <th className="px-5 py-3.5 text-right">Fact Check</th>
                        <th className="px-5 py-3.5 text-right">Tự tin</th>
                        <th className="px-5 py-3.5">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {surveys.map((s) => (
                        <tr key={s.id}>
                          <td className="px-5 py-3.5 font-medium">
                            {s.student_name} ({s.class_name ?? '—'})
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
              </div>
            </div>
          )}

          {/* 7. REPORTS */}
          {section === 'reports' && reports && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#173B5E]">Thống kê toàn trường</h1>
                <p className="text-sm text-[#64748B] mt-1">Báo cáo theo từng lớp học, môn học và nhật ký hệ thống.</p>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2E8F0]">
                  <h2 className="text-base font-semibold text-[#173B5E]">Chỉ số theo lớp học</h2>
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs text-[#64748B]">
                    <tr>
                      <th className="px-5 py-3">Lớp</th>
                      <th className="px-5 py-3 text-right">Học sinh</th>
                      <th className="px-5 py-3 text-right">Hoàn thành / Tổng bài</th>
                      <th className="px-5 py-3 text-right">Tự tin Think First TB</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {reports.byClass.map((row) => (
                      <tr key={row.class_name}>
                        <td className="px-5 py-3 font-semibold">{row.class_name}</td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">{row.students}</td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">
                          {row.completed_tasks}/{row.tasks}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">
                          {row.avg_confidence ?? '—'}/5
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2E8F0]">
                  <h2 className="text-base font-semibold text-[#173B5E]">Phân bố nhiệm vụ theo môn học</h2>
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs text-[#64748B]">
                    <tr>
                      <th className="px-5 py-3">Môn học</th>
                      <th className="px-5 py-3 text-right">Tổng nhiệm vụ</th>
                      <th className="px-5 py-3 text-right">Đã hoàn thành</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {reports.bySubject.map((sub) => (
                      <tr key={sub.subject}>
                        <td className="px-5 py-3 font-medium">{sub.subject}</td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">{sub.total_tasks}</td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">{sub.completed_tasks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 8. BACKUP */}
          {section === 'backup' && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 space-y-4 max-w-2xl">
              <h1 className="text-2xl font-bold text-[#173B5E]">Sao lưu dữ liệu hệ thống</h1>
              <p className="text-sm text-[#475569] leading-relaxed">
                Xuất toàn bộ dữ liệu hiện tại từ các bảng <span className="font-mono text-xs">users</span>,{' '}
                <span className="font-mono text-xs">classes</span>,{' '}
                <span className="font-mono text-xs">teacher_classes</span>,{' '}
                <span className="font-mono text-xs">study_tasks</span>,{' '}
                <span className="font-mono text-xs">thinking_records</span>,{' '}
                <span className="font-mono text-xs">survey_responses</span>,{' '}
                <span className="font-mono text-xs">learning_materials</span> và{' '}
                <span className="font-mono text-xs">activity_logs</span> thành tệp JSON để lưu trữ ngoại tuyến.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {busy ? 'Đang xuất bản sao lưu...' : 'Tải xuống bản sao lưu JSON'}
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
