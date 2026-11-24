import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import type { PublicOverview, UserProfile } from '../types';

interface LandingAuthViewProps {
  overview: PublicOverview | null;
  onRefreshOverview: () => void;
  onAuthenticated: (token: string, user: UserProfile) => void;
}

type AuthTab = 'login' | 'register' | 'verify' | 'admin-claim';

export const LandingAuthView: React.FC<LandingAuthViewProps> = ({
  overview,
  onRefreshOverview,
  onAuthenticated,
}) => {
  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [heroImgError, setHeroImgError] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<'student' | 'teacher'>('student');
  const [regClassName, setRegClassName] = useState(overview?.classes[0]?.class_name ?? '10A1');
  const [regSubject, setRegSubject] = useState('Toán học');
  const [regPhone, setRegPhone] = useState('');
  const [regBirthday, setRegBirthday] = useState('');

  // OTP state
  const [verifyEmail, setVerifyEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [sandboxOtpPreview, setSandboxOtpPreview] = useState<string | null>(null);

  // First-run Admin Claim state
  const [claimName, setClaimName] = useState('');
  const [claimEmail, setClaimEmail] = useState('');
  const [claimPassword, setClaimPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const authPanelRef = React.useRef<HTMLDivElement>(null);

  const scrollToAuth = (tab: AuthTab) => {
    setActiveTab(tab);
    setErrorMsg(null);
    setInfoMsg(null);
    authPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: { email: loginEmail, password: loginPassword },
      });
      onAuthenticated(res.token, res.user);
    } catch (err) {
      if (err instanceof ApiError && err.payload?.needsVerification) {
        setVerifyEmail(String(err.payload.email ?? loginEmail));
        setActiveTab('verify');
        setInfoMsg('Tài khoản chưa xác thực OTP. Bạn có thể yêu cầu gửi lại mã bên dưới.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const res = await apiRequest<{
        email: string;
        role: string;
        needsVerification: boolean;
        needsApproval: boolean;
        sandboxOtpCode?: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: {
          full_name: regName,
          email: regEmail,
          password: regPassword,
          role: regRole,
          class_name: regRole === 'student' ? regClassName : null,
          subject: regRole === 'teacher' ? regSubject : null,
          phone: regPhone || null,
          birthday: regBirthday || null,
        },
      });
      setVerifyEmail(res.email);
      setSandboxOtpPreview(res.sandboxOtpCode ?? null);
      setOtpCode(res.sandboxOtpCode ?? '');
      setActiveTab('verify');
      setInfoMsg(
        res.needsApproval
          ? 'Đã tạo tài khoản giáo viên. Vui lòng xác thực OTP và chờ Quản trị viên phê duyệt.'
          : 'Đã tạo tài khoản. Vui lòng xác thực mã OTP 6 chữ số để kích hoạt.'
      );
      onRefreshOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể đăng ký.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const res = await apiRequest<{
        verified: boolean;
        awaitingApproval: boolean;
        message?: string;
        token?: string;
        user?: UserProfile;
      }>('/api/auth/verify-otp', {
        method: 'POST',
        body: { email: verifyEmail, code: otpCode },
      });

      if (res.awaitingApproval) {
        setInfoMsg(res.message ?? 'Đã xác thực OTP. Tài khoản giáo viên đang chờ Quản trị viên phê duyệt.');
        setActiveTab('login');
        setLoginEmail(verifyEmail);
      } else if (res.token && res.user) {
        onAuthenticated(res.token, res.user);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Xác thực OTP thất bại.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!verifyEmail) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ sandboxOtpCode?: string }>('/api/auth/resend-otp', {
        method: 'POST',
        body: { email: verifyEmail },
      });
      setSandboxOtpPreview(res.sandboxOtpCode ?? null);
      setOtpCode(res.sandboxOtpCode ?? '');
      setInfoMsg('Đã tạo mã OTP mới trong cơ sở dữ liệu.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể gửi lại mã OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/admin-claim', {
        method: 'POST',
        body: {
          full_name: claimName,
          email: claimEmail,
          password: claimPassword,
        },
      });
      onRefreshOverview();
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể thiết lập tài khoản Quản trị viên.');
    } finally {
      setLoading(false);
    }
  };

  const stats = overview?.stats;
  const needsAdminClaim = overview?.authSetup?.needsAdminClaim ?? false;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#173B5E]">
      {/* Top Bar Contract: Zone 1 (Brand) — Zone 2 (4 nav links) — Zone 3 (1 primary CTA) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-xl font-bold tracking-tight text-[#2878D0] whitespace-nowrap shrink-0"
          >
            EDU SMART
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#475569]">
            <a href="#overview" className="hover:text-[#2878D0] transition-colors whitespace-nowrap shrink-0">
              Tổng quan
            </a>
            <a href="#student-space" className="hover:text-[#2878D0] transition-colors whitespace-nowrap shrink-0">
              Học sinh
            </a>
            <a href="#teacher-space" className="hover:text-[#2878D0] transition-colors whitespace-nowrap shrink-0">
              Giáo viên
            </a>
            <a href="#admin-space" className="hover:text-[#2878D0] transition-colors whitespace-nowrap shrink-0">
              Quản trị
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => scrollToAuth('login')}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Đăng nhập hệ thống
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="max-w-7xl mx-auto px-6 py-10 space-y-16">
        {/* Hero Split + Live Database Overview */}
        <section id="overview" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="p-8 space-y-5">
              <p className="text-sm font-medium text-[#16A995]">
                Nền tảng học tập chủ động và quản trị nhà trường theo thời gian thực
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-[#173B5E] leading-tight">
                Học tập có kế hoạch, tư duy trước khi hỏi AI và đồng bộ dữ liệu toàn trường
              </h1>
              <p className="text-base text-[#475569] leading-relaxed max-w-2xl">
                EDU SMART kết nối trực tiếp không gian Học sinh, Giáo viên và Quản trị viên trên cơ sở dữ liệu quan hệ
                SQLite: từ Study Plan, Think First, AI Coach, Fact Check, Self Test đến phê duyệt giáo viên và phân
                tích khảo sát trước – sau.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => scrollToAuth('register')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Đăng ký tài khoản mới
                </button>
                {needsAdminClaim && (
                  <button
                    type="button"
                    onClick={() => scrollToAuth('admin-claim')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#173B5E] bg-[#F1F5F9] border border-[#CBD5E1] rounded-lg hover:bg-[#E2E8F0] transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#16A995]" />
                    Thiết lập Quản trị viên đầu tiên
                  </button>
                )}
              </div>
            </div>

            <div className="relative h-56 sm:h-64 border-t border-[#E2E8F0] bg-[#E2F0FB]">
              {!heroImgError ? (
                <img
                  src="/src/assets/images/hero_edu_smart_1795485508616.jpg"
                  alt="Không gian học tập số EDU SMART"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#E2F0FB] to-[#E6F7F5] text-[#2878D0]">
                  <GraduationCap className="w-10 h-10 mb-2" />
                  <span className="text-sm font-medium">Không gian học tập số EDU SMART</span>
                </div>
              )}
            </div>
          </div>

          {/* Auth Card */}
          <div
            ref={authPanelRef}
            className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-6 sm:p-8 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('login');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === 'login' ? 'bg-white text-[#173B5E] shadow-xs' : 'text-[#64748B] hover:text-[#173B5E]'
                  }`}
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('register');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === 'register'
                      ? 'bg-white text-[#173B5E] shadow-xs'
                      : 'text-[#64748B] hover:text-[#173B5E]'
                  }`}
                >
                  Đăng ký
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('verify');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === 'verify'
                      ? 'bg-white text-[#173B5E] shadow-xs'
                      : 'text-[#64748B] hover:text-[#173B5E]'
                  }`}
                >
                  Xác thực OTP
                </button>
                {needsAdminClaim && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('admin-claim');
                      setErrorMsg(null);
                    }}
                    className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      activeTab === 'admin-claim'
                        ? 'bg-white text-[#173B5E] shadow-xs'
                        : 'text-[#64748B] hover:text-[#173B5E]'
                    }`}
                  >
                    Tạo Admin
                  </button>
                )}
              </div>

              {errorMsg && (
                <div className="mb-4 p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#B91C1C]">
                  {errorMsg}
                </div>
              )}

              {infoMsg && (
                <div className="mb-4 p-3 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-sm text-[#047857]">
                  {infoMsg}
                </div>
              )}

              {activeTab === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#173B5E]">Đăng nhập EDU SMART</h2>
                    <p className="text-sm text-[#64748B] mt-1">
                      Hệ thống tự động điều hướng đến cổng Học sinh, Giáo viên hoặc Quản trị viên.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#334155] mb-1.5">Địa chỉ Gmail / Email</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3.5" />
                      <input
                        type="email"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="tenban@gmail.com"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#334155] mb-1.5">Mật khẩu</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3.5" />
                      <input
                        type="password"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Nhập mật khẩu"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {loading ? 'Đang xác thực...' : 'Đăng nhập'}
                  </button>
                </form>
              )}

              {activeTab === 'register' && (
                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div>
                    <h2 className="text-xl font-semibold text-[#173B5E]">Đăng ký tài khoản</h2>
                    <p className="text-sm text-[#64748B] mt-0.5">
                      Lưu trực tiếp vào bảng <span className="font-mono text-xs">users</span> và tạo mã OTP xác thực.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRegRole('student')}
                      className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors cursor-pointer ${
                        regRole === 'student'
                          ? 'bg-[#EFF6FF] border-[#2878D0] text-[#2878D0]'
                          : 'bg-white border-[#CBD5E1] text-[#475569]'
                      }`}
                    >
                      Học sinh
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegRole('teacher')}
                      className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors cursor-pointer ${
                        regRole === 'teacher'
                          ? 'bg-[#EFF6FF] border-[#2878D0] text-[#2878D0]'
                          : 'bg-white border-[#CBD5E1] text-[#475569]'
                      }`}
                    >
                      Giáo viên
                    </button>
                  </div>

                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Họ và tên đầy đủ"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                  />

                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="Địa chỉ Gmail"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {regRole === 'student' ? (
                      <select
                        value={regClassName}
                        onChange={(e) => setRegClassName(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg bg-white focus:outline-none focus:border-[#2878D0]"
                      >
                        {(overview?.classes ?? [{ id: 1, class_name: '10A1', grade: 10 }]).map((c) => (
                          <option key={c.id} value={c.class_name}>
                            Lớp {c.class_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        value={regSubject}
                        onChange={(e) => setRegSubject(e.target.value)}
                        placeholder="Môn giảng dạy (VD: Toán học)"
                        className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                      />
                    )}

                    <input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="Số điện thoại"
                      className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="date"
                      value={regBirthday}
                      onChange={(e) => setRegBirthday(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Mật khẩu (>= 6 ký tự)"
                      className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#2878D0] rounded-lg hover:bg-[#1F63B0] disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {loading ? 'Đang đăng ký...' : 'Tạo tài khoản & Lấy mã OTP'}
                  </button>
                </form>
              )}

              {activeTab === 'verify' && (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#173B5E]">Xác thực mã OTP</h2>
                    <p className="text-sm text-[#64748B] mt-1">
                      Nhập mã 6 chữ số được lưu trong bảng <span className="font-mono text-xs">otp_codes</span>.
                    </p>
                  </div>

                  {sandboxOtpPreview && (
                    <div className="p-3 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-sm text-[#1E40AF]">
                      Mã OTP xác thực của bạn (chế độ thử nghiệm chưa cấu hình SMTP):{' '}
                      <strong className="font-mono text-base tracking-wider tabular-nums">{sandboxOtpPreview}</strong>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-[#334155] mb-1.5">Email đã đăng ký</label>
                    <input
                      type="email"
                      required
                      value={verifyEmail}
                      onChange={(e) => setVerifyEmail(e.target.value)}
                      placeholder="tenban@gmail.com"
                      className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#334155] mb-1.5">Mã OTP (6 chữ số)</label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3.5" />
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm font-mono tracking-widest tabular-nums border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-2.5 px-4 text-sm font-medium text-white bg-[#16A995] rounded-lg hover:bg-[#128E7D] disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {loading ? 'Đang kiểm tra...' : 'Xác thực OTP'}
                    </button>
                    <button
                      type="button"
                      disabled={loading || !verifyEmail}
                      onClick={handleResendOtp}
                      className="py-2.5 px-4 text-sm font-medium text-[#334155] bg-[#F1F5F9] rounded-lg hover:bg-[#E2E8F0] disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      Gửi lại mã
                    </button>
                  </div>
                </form>
              )}

              {activeTab === 'admin-claim' && needsAdminClaim && (
                <form onSubmit={handleAdminClaim} className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#173B5E]">Thiết lập Quản trị viên đầu tiên</h2>
                    <p className="text-sm text-[#64748B] mt-1">
                      Tạo tài khoản Quản trị viên duy nhất ban đầu để phê duyệt giáo viên và quản lý toàn trường.
                    </p>
                  </div>

                  <input
                    type="text"
                    required
                    value={claimName}
                    onChange={(e) => setClaimName(e.target.value)}
                    placeholder="Họ tên Quản trị viên"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                  />

                  <input
                    type="email"
                    required
                    value={claimEmail}
                    onChange={(e) => setClaimEmail(e.target.value)}
                    placeholder="Email Quản trị viên"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                  />

                  <input
                    type="password"
                    required
                    minLength={6}
                    value={claimPassword}
                    onChange={(e) => setClaimPassword(e.target.value)}
                    placeholder="Mật khẩu quản trị (>= 6 ký tự)"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2878D0]"
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#173B5E] rounded-lg hover:bg-[#0F2942] disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {loading ? 'Đang khởi tạo...' : 'Tạo & Đăng nhập Quản trị'}
                  </button>
                </form>
              )}
            </div>

            <div className="pt-5 mt-6 border-t border-[#E2E8F0] text-xs text-[#64748B] flex items-center justify-between">
              <span>Xác thực phiên làm việc trên máy chủ</span>
              <span className="font-mono">SQLite WAL</span>
            </div>
          </div>
        </section>

        {/* 4-column live database KPI strip below hero */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
            <p className="text-xs font-medium text-[#64748B]">Lớp học đang hoạt động</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-[#2878D0] tabular-nums">
              {stats ? stats.totalClasses : '—'}
            </p>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
            <p className="text-xs font-medium text-[#64748B]">Học sinh trong hệ thống</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-[#16A995] tabular-nums">
              {stats ? stats.totalStudents : '—'}
            </p>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
            <p className="text-xs font-medium text-[#64748B]">Giáo viên đã phê duyệt</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-[#173B5E] tabular-nums">
              {stats ? stats.totalTeachers : '—'}
            </p>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
            <p className="text-xs font-medium text-[#64748B]">Nhiệm vụ & nhật ký tư duy</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-[#173B5E] tabular-nums">
              {stats ? stats.totalTasks + stats.totalThinking : '—'}
            </p>
          </div>
        </section>

        {/* 3 Role Portals Showcase */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div id="student-space" className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] text-[#2878D0] flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-[#173B5E]">Không gian Học sinh</h3>
              <p className="text-sm text-[#475569] leading-relaxed">
                Quản lý Study Plan cá nhân, ghi nhận tư duy Think First trước khi trao đổi với AI Coach, kiểm chứng
                thông tin Fact Check, làm bài Self Test tự động và nộp khảo sát trước – sau.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRegRole('student');
                scrollToAuth('register');
              }}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#2878D0] hover:underline cursor-pointer"
            >
              Đăng ký tài khoản Học sinh
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div id="teacher-space" className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#ECFDF5] text-[#16A995] flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-[#173B5E]">Không gian Giáo viên</h3>
              <p className="text-sm text-[#475569] leading-relaxed">
                Xem các lớp được phân công, theo dõi danh sách học sinh, chấm và phản hồi nhật ký Think First, tổng hợp
                khảo sát và xuất bản học liệu theo lớp.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRegRole('teacher');
                scrollToAuth('register');
              }}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#16A995] hover:underline cursor-pointer"
            >
              Đăng ký tài khoản Giáo viên
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div id="admin-space" className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#F1F5F9] text-[#173B5E] flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-[#173B5E]">Quản trị toàn trường</h3>
              <p className="text-sm text-[#475569] leading-relaxed">
                Phê duyệt giáo viên, phân công lớp giảng dạy, khóa hoặc mở khóa tài khoản, quản lý danh mục lớp học,
                xem nhật ký hoạt động và sao lưu cơ sở dữ liệu.
              </p>
            </div>
            <button
              type="button"
              onClick={() => scrollToAuth(needsAdminClaim ? 'admin-claim' : 'login')}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#173B5E] hover:underline cursor-pointer"
            >
              {needsAdminClaim ? 'Thiết lập Quản trị viên' : 'Đăng nhập Quản trị viên'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E2E8F0] bg-white mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#64748B]">
          <span>EDU SMART — Hệ thống học tập thông minh có cơ sở dữ liệu quan hệ</span>
          <span>Phân quyền Học sinh · Giáo viên · Quản trị viên</span>
        </div>
      </footer>
    </div>
  );
};
