import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  db,
  hashPassword,
  hashToken,
  initDatabase,
  logActivity,
  seedStarterTasksForStudent,
  verifyPassword,
} from './server/db.ts';
import {
  generateCoachReply,
  generateSelfTestQuestions,
  generateThinkFirstReflection,
  runFactCheck,
  type CoachHistoryItem,
  type SelfTestQuestion,
} from './server/gemini.ts';

initDatabase();

interface AuthenticatedUser {
  id: number;
  full_name: string;
  birthday: string | null;
  class_name: string | null;
  subject: string | null;
  phone: string | null;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  is_verified: number;
  is_approved: number;
  status: 'active' | 'locked';
  created_at: string;
}

interface AuthedRequest extends Request {
  user?: AuthenticatedUser;
  tokenHash?: string;
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

function createSessionForUser(userId: number): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    userId,
    tokenHash,
    expiresAt
  );
  return rawToken;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
    return;
  }

  const rawToken = authHeader.slice('Bearer '.length).trim();
  if (!rawToken) {
    res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(
      `
      SELECT s.expires_at, u.id, u.full_name, u.birthday, u.class_name, u.subject, u.phone,
             u.email, u.role, u.is_verified, u.is_approved, u.status, u.created_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
      LIMIT 1
    `
    )
    .get(tokenHash) as (AuthenticatedUser & { expires_at: string }) | undefined;

  if (!row) {
    res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn hoặc không tồn tại.' });
    return;
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn.' });
    return;
  }

  if (row.status !== 'active') {
    res.status(403).json({ error: 'Tài khoản đã bị khóa.' });
    return;
  }

  const { expires_at: _exp, ...user } = row;
  req.user = user;
  req.tokenHash = tokenHash;
  next();
}

function requireRole(roles: Array<'student' | 'teacher' | 'admin'>) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Bạn không có quyền truy cập chức năng này.' });
      return;
    }
    next();
  };
}

function parseId(raw: unknown): number | null {
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function sanitizeUser(user: AuthenticatedUser) {
  return {
    id: user.id,
    full_name: user.full_name,
    birthday: user.birthday,
    class_name: user.class_name,
    subject: user.subject,
    phone: user.phone,
    email: user.email,
    role: user.role,
    is_verified: Boolean(user.is_verified),
    is_approved: Boolean(user.is_approved),
    status: user.status,
    created_at: user.created_at,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Public overview endpoint (safe aggregate counts & class list, no PII)
  app.get('/api/public/overview', (_req, res) => {
    const classes = db.prepare('SELECT id, class_name, grade FROM classes ORDER BY grade ASC, class_name ASC').all();
    const totalStudents = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student'").get() as { c: number }).c;
    const totalTeachers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'teacher' AND is_approved = 1").get() as { c: number }).c;
    const totalTasks = (db.prepare('SELECT COUNT(*) as c FROM study_tasks').get() as { c: number }).c;
    const totalThinking = (db.prepare('SELECT COUNT(*) as c FROM thinking_records').get() as { c: number }).c;
    const totalMaterials = (db.prepare('SELECT COUNT(*) as c FROM learning_materials').get() as { c: number }).c;
    const hasAdminUser =
      (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as { c: number }).c > 0;
    const adminPasscodeConfigured = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);

    res.json({
      classes,
      stats: {
        totalStudents,
        totalTeachers,
        totalClasses: classes.length,
        totalTasks,
        totalThinking,
        totalMaterials,
      },
      authSetup: {
        hasAdminUser,
        adminPasscodeConfigured,
        needsAdminClaim: !hasAdminUser && !adminPasscodeConfigured,
      },
    });
  });

  // One-time Admin bootstrap claim when ADMIN_PASSCODE env is unset and no admin exists yet
  app.post('/api/auth/admin-claim', (req, res) => {
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    if (envPasscode) {
      res.status(403).json({ error: 'Hệ thống đã cấu hình ADMIN_PASSCODE trong biến môi trường.' });
      return;
    }

    const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    if (existingAdmin) {
      res.status(409).json({ error: 'Tài khoản Quản trị viên đã được thiết lập trước đó.' });
      return;
    }

    const fullName = String(req.body?.full_name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (fullName.length < 2 || !email.includes('@') || password.length < 6) {
      res.status(400).json({ error: 'Vui lòng nhập họ tên, email hợp lệ và mật khẩu tối thiểu 6 ký tự.' });
      return;
    }

    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(email);
    if (existingEmail) {
      res.status(409).json({ error: 'Email này đã được đăng ký trong hệ thống.' });
      return;
    }

    const passwordHash = hashPassword(password);
    const result = db
      .prepare(
        `INSERT INTO users (full_name, email, password_hash, role, is_verified, is_approved, status)
         VALUES (?, ?, ?, 'admin', 1, 1, 'active')`
      )
      .run(fullName, email, passwordHash);

    const userId = Number(result.lastInsertRowid);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as AuthenticatedUser;
    const token = createSessionForUser(userId);
    logActivity(userId, 'Thiết lập tài khoản Quản trị viên đầu tiên', getClientIp(req));

    res.status(201).json({ token, user: sanitizeUser(user) });
  });

  // Registration with OTP creation
  app.post('/api/auth/register', (req, res) => {
    const fullName = String(req.body?.full_name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const role = req.body?.role === 'teacher' ? 'teacher' : 'student';
    const className = req.body?.class_name ? String(req.body.class_name).trim() : null;
    const subject = req.body?.subject ? String(req.body.subject).trim() : null;
    const phone = req.body?.phone ? String(req.body.phone).trim() : null;
    const birthday = req.body?.birthday ? String(req.body.birthday).trim() : null;

    if (fullName.length < 2 || !email.includes('@') || password.length < 6) {
      res.status(400).json({ error: 'Vui lòng nhập đầy đủ họ tên, Gmail hợp lệ và mật khẩu từ 6 ký tự.' });
      return;
    }

    if (role === 'student' && !className) {
      res.status(400).json({ error: 'Học sinh cần chọn lớp học.' });
      return;
    }

    if (role === 'teacher' && !subject) {
      res.status(400).json({ error: 'Giáo viên cần nhập môn giảng dạy.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(email);
    if (existing) {
      res.status(409).json({ error: 'Địa chỉ email này đã tồn tại trong hệ thống.' });
      return;
    }

    const passwordHash = hashPassword(password);
    const isApproved = role === 'student' ? 1 : 0;

    const insertRes = db
      .prepare(
        `INSERT INTO users (full_name, birthday, class_name, subject, phone, email, password_hash, role, is_verified, is_approved, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active')`
      )
      .run(fullName, birthday, className, subject, phone, email, passwordHash, role, isApproved);

    const newUserId = Number(insertRes.lastInsertRowid);
    if (role === 'student') {
      seedStarterTasksForStudent(newUserId);
    }

    const otpCode = String(crypto.randomInt(100000, 999999));
    const otpHash = hashToken(`${email}:${otpCode}`);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO otp_codes (email, code_hash, expires_at) VALUES (?, ?, ?)').run(
      email,
      otpHash,
      expiresAt
    );

    logActivity(newUserId, `Đăng ký tài khoản mới (${role})`, getClientIp(req));

    res.status(201).json({
      email,
      role,
      needsVerification: true,
      needsApproval: role === 'teacher',
      sandboxOtpCode: otpCode,
    });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const code = String(req.body?.code ?? '').trim();

    if (!email || code.length !== 6) {
      res.status(400).json({ error: 'Vui lòng nhập email và mã OTP gồm 6 chữ số.' });
      return;
    }

    const otpRecord = db
      .prepare(
        `SELECT id, code_hash, expires_at FROM otp_codes
         WHERE email = ? AND used_at IS NULL
         ORDER BY id DESC LIMIT 1`
      )
      .get(email) as { id: number; code_hash: string; expires_at: string } | undefined;

    if (!otpRecord) {
      res.status(400).json({ error: 'Không tìm thấy mã OTP khả dụng cho email này.' });
      return;
    }

    if (new Date(otpRecord.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.' });
      return;
    }

    const expectedHash = hashToken(`${email}:${code}`);
    const a = Buffer.from(otpRecord.code_hash, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(400).json({ error: 'Mã OTP không chính xác.' });
      return;
    }

    db.prepare("UPDATE otp_codes SET used_at = datetime('now') WHERE id = ?").run(otpRecord.id);
    db.prepare('UPDATE users SET is_verified = 1 WHERE email = ?').run(email);

    const user = db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get(email) as AuthenticatedUser | undefined;
    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
      return;
    }

    logActivity(user.id, 'Xác thực OTP email thành công', getClientIp(req));

    if (user.role === 'teacher' && !user.is_approved) {
      res.json({
        verified: true,
        awaitingApproval: true,
        message: 'Xác thực email thành công! Tài khoản giáo viên đang chờ Quản trị viên phê duyệt.',
      });
      return;
    }

    const token = createSessionForUser(user.id);
    res.json({
      verified: true,
      awaitingApproval: false,
      token,
      user: sanitizeUser(user),
    });
  });

  app.post('/api/auth/resend-otp', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = db.prepare('SELECT id, is_verified FROM users WHERE email = ? LIMIT 1').get(email) as
      | { id: number; is_verified: number }
      | undefined;

    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản với email này.' });
      return;
    }

    if (user.is_verified) {
      res.status(400).json({ error: 'Tài khoản này đã được xác thực.' });
      return;
    }

    const otpCode = String(crypto.randomInt(100000, 999999));
    const otpHash = hashToken(`${email}:${otpCode}`);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO otp_codes (email, code_hash, expires_at) VALUES (?, ?, ?)').run(
      email,
      otpHash,
      expiresAt
    );

    res.json({ sandboxOtpCode: otpCode });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      res.status(400).json({ error: 'Vui lòng nhập Gmail và mật khẩu.' });
      return;
    }

    // Check optional ADMIN_PASSCODE override from environment
    const envAdminPasscode = process.env.ADMIN_PASSCODE?.trim();
    if (envAdminPasscode && password === envAdminPasscode) {
      let adminUser = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'admin' LIMIT 1").get(email) as
        | AuthenticatedUser
        | undefined;

      if (!adminUser) {
        const anyAdmin = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get() as
          | AuthenticatedUser
          | undefined;
        if (!anyAdmin) {
          const created = db
            .prepare(
              `INSERT INTO users (full_name, email, password_hash, role, is_verified, is_approved, status)
               VALUES ('Quản trị viên hệ thống', ?, ?, 'admin', 1, 1, 'active')`
            )
            .run(email, hashPassword(password));
          adminUser = db.prepare('SELECT * FROM users WHERE id = ?').get(created.lastInsertRowid) as AuthenticatedUser;
        }
      }

      if (adminUser && adminUser.status === 'active') {
        const token = createSessionForUser(adminUser.id);
        logActivity(adminUser.id, 'Đăng nhập quản trị bằng mã bảo mật hệ thống', getClientIp(req));
        res.json({ token, user: sanitizeUser(adminUser) });
        return;
      }
    }

    const userRow = db
      .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
      .get(email) as (AuthenticatedUser & { password_hash: string }) | undefined;

    if (!userRow || !verifyPassword(password, userRow.password_hash)) {
      res.status(401).json({ error: 'Thông tin đăng nhập không chính xác.' });
      return;
    }

    if (userRow.status !== 'active') {
      res.status(403).json({ error: 'Tài khoản hiện đang bị khóa. Vui lòng liên hệ Quản trị viên.' });
      return;
    }

    if (!userRow.is_verified) {
      res.status(403).json({
        error: 'Tài khoản chưa xác thực mã OTP email.',
        needsVerification: true,
        email: userRow.email,
      });
      return;
    }

    if (userRow.role === 'teacher' && !userRow.is_approved) {
      res.status(403).json({ error: 'Tài khoản giáo viên đang chờ Quản trị viên phê duyệt.' });
      return;
    }

    const token = createSessionForUser(userRow.id);
    logActivity(userRow.id, `Đăng nhập cổng ${userRow.role}`, getClientIp(req));

    res.json({ token, user: sanitizeUser(userRow) });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    let assignedClasses: Array<{ id: number; class_name: string; grade: number }> = [];
    if (user.role === 'teacher') {
      assignedClasses = db
        .prepare(
          `SELECT c.id, c.class_name, c.grade
           FROM teacher_classes tc
           JOIN classes c ON c.id = tc.class_id
           WHERE tc.teacher_id = ?
           ORDER BY c.grade ASC, c.class_name ASC`
        )
        .all(user.id) as Array<{ id: number; class_name: string; grade: number }>;
    }
    res.json({ user: sanitizeUser(user), assignedClasses });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
    if (req.tokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.tokenHash);
    }
    logActivity(req.user!.id, 'Đăng xuất khỏi hệ thống', getClientIp(req));
    res.json({ ok: true });
  });

  // ============================================================================
  // STUDENT ROUTES
  // ============================================================================
  app.get('/api/student/tasks', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    const tasks = db
      .prepare('SELECT * FROM study_tasks WHERE student_id = ? ORDER BY created_at DESC, id DESC')
      .all(req.user!.id);
    res.json({ tasks });
  });

  app.post('/api/student/tasks', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    const subject = String(req.body?.subject ?? '').trim();
    const taskName = String(req.body?.task_name ?? '').trim();
    const goal = String(req.body?.goal ?? '').trim();
    const deadline = req.body?.deadline ? String(req.body.deadline).trim() : null;

    if (!subject || !taskName) {
      res.status(400).json({ error: 'Vui lòng nhập môn học và tên nhiệm vụ.' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO study_tasks (student_id, subject, task_name, goal, deadline, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      )
      .run(req.user!.id, subject, taskName, goal, deadline);

    const created = db.prepare('SELECT * FROM study_tasks WHERE id = ?').get(result.lastInsertRowid);
    logActivity(req.user!.id, `Tạo nhiệm vụ Study Plan: ${taskName}`, getClientIp(req));
    res.status(201).json({ task: created });
  });

  app.patch('/api/student/tasks/:id', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    const taskId = parseId(req.params.id);
    if (!taskId) {
      res.status(400).json({ error: 'ID nhiệm vụ không hợp lệ.' });
      return;
    }

    const status = String(req.body?.status ?? '');
    if (!['pending', 'processing', 'completed'].includes(status)) {
      res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM study_tasks WHERE id = ? AND student_id = ?')
      .get(taskId, req.user!.id);
    if (!existing) {
      res.status(404).json({ error: 'Không tìm thấy nhiệm vụ.' });
      return;
    }

    db.prepare('UPDATE study_tasks SET status = ? WHERE id = ? AND student_id = ?').run(
      status,
      taskId,
      req.user!.id
    );
    const updated = db.prepare('SELECT * FROM study_tasks WHERE id = ?').get(taskId);
    res.json({ task: updated });
  });

  app.delete('/api/student/tasks/:id', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    const taskId = parseId(req.params.id);
    if (!taskId) {
      res.status(400).json({ error: 'ID nhiệm vụ không hợp lệ.' });
      return;
    }

    const info = db.prepare('DELETE FROM study_tasks WHERE id = ? AND student_id = ?').run(taskId, req.user!.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Không tìm thấy nhiệm vụ để xóa.' });
      return;
    }
    res.json({ ok: true });
  });

  // Think First
  app.get('/api/student/thinking', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    const records = db
      .prepare('SELECT * FROM thinking_records WHERE student_id = ? ORDER BY id DESC')
      .all(req.user!.id);
    res.json({ records });
  });

  app.post('/api/student/thinking', requireAuth, requireRole(['student']), async (req: AuthedRequest, res) => {
    const subject = String(req.body?.subject ?? 'Tổng hợp').trim() || 'Tổng hợp';
    const question = String(req.body?.question ?? '').trim();
    const initialThinking = String(req.body?.initial_thinking ?? '').trim();
    const confidence = Math.max(1, Math.min(5, Number(req.body?.confidence) || 3));
    const requestAiFeedback = Boolean(req.body?.request_ai_feedback);

    if (!question || !initialThinking) {
      res.status(400).json({ error: 'Vui lòng nhập câu hỏi và suy nghĩ ban đầu của bạn.' });
      return;
    }

    let aiFeedback: string | null = null;
    if (requestAiFeedback) {
      try {
        aiFeedback = await generateThinkFirstReflection(subject, question, initialThinking, confidence);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Lỗi kết nối AI.';
        res.status(502).json({ error: msg });
        return;
      }
    }

    const result = db
      .prepare(
        `INSERT INTO thinking_records (student_id, subject, question, initial_thinking, confidence, ai_feedback)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(req.user!.id, subject, question, initialThinking, confidence, aiFeedback);

    const record = db.prepare('SELECT * FROM thinking_records WHERE id = ?').get(result.lastInsertRowid);
    logActivity(req.user!.id, `Lưu nhật ký Think First (${subject})`, getClientIp(req));
    res.status(201).json({ record });
  });

  app.post('/api/student/thinking/:id/reflect', requireAuth, requireRole(['student']), async (req: AuthedRequest, res) => {
    const recordId = parseId(req.params.id);
    if (!recordId) {
      res.status(400).json({ error: 'ID không hợp lệ.' });
      return;
    }

    const row = db
      .prepare('SELECT * FROM thinking_records WHERE id = ? AND student_id = ?')
      .get(recordId, req.user!.id) as
      | { id: number; subject: string; question: string; initial_thinking: string; confidence: number }
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Không tìm thấy bản ghi tư duy.' });
      return;
    }

    try {
      const feedback = await generateThinkFirstReflection(
        row.subject,
        row.question,
        row.initial_thinking,
        row.confidence || 3
      );
      db.prepare('UPDATE thinking_records SET ai_feedback = ? WHERE id = ?').run(feedback, row.id);
      const updated = db.prepare('SELECT * FROM thinking_records WHERE id = ?').get(row.id);
      res.json({ record: updated });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Không thể gọi AI lúc này.' });
    }
  });

  // AI Coach
  app.get('/api/student/ai-coach', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    const messages = db
      .prepare('SELECT * FROM ai_coach_messages WHERE student_id = ? ORDER BY id ASC')
      .all(req.user!.id);
    res.json({ messages });
  });

  app.post('/api/student/ai-coach', requireAuth, requireRole(['student']), async (req: AuthedRequest, res) => {
    const subject = String(req.body?.subject ?? 'Tổng hợp').trim() || 'Tổng hợp';
    const message = String(req.body?.message ?? '').trim();

    if (!message) {
      res.status(400).json({ error: 'Vui lòng nhập câu hỏi hoặc nội dung cần cố vấn.' });
      return;
    }

    const history = db
      .prepare('SELECT role, content FROM ai_coach_messages WHERE student_id = ? ORDER BY id ASC LIMIT 20')
      .all(req.user!.id) as CoachHistoryItem[];

    let reply: string;
    try {
      reply = await generateCoachReply(subject, history, message);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'AI Coach hiện đang bận.' });
      return;
    }

    const insertMsg = db.prepare(
      'INSERT INTO ai_coach_messages (student_id, subject, role, content) VALUES (?, ?, ?, ?)'
    );
    insertMsg.run(req.user!.id, subject, 'user', message);
    const assistantRes = insertMsg.run(req.user!.id, subject, 'assistant', reply);

    logActivity(req.user!.id, `Trao đổi với AI Coach (${subject})`, getClientIp(req));
    const messages = db
      .prepare('SELECT * FROM ai_coach_messages WHERE student_id = ? ORDER BY id ASC')
      .all(req.user!.id);
    res.status(201).json({ messages, replyId: assistantRes.lastInsertRowid });
  });

  app.delete('/api/student/ai-coach', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM ai_coach_messages WHERE student_id = ?').run(req.user!.id);
    res.json({ ok: true });
  });

  // Fact Check
  app.get('/api/student/fact-check', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    const logs = db
      .prepare('SELECT * FROM fact_check_logs WHERE student_id = ? ORDER BY id DESC')
      .all(req.user!.id);
    res.json({ logs });
  });

  app.post('/api/student/fact-check', requireAuth, requireRole(['student']), async (req: AuthedRequest, res) => {
    const claim = String(req.body?.claim ?? '').trim();
    if (claim.length < 5) {
      res.status(400).json({ error: 'Vui lòng nhập nhận định cần kiểm chứng (tối thiểu 5 ký tự).' });
      return;
    }

    try {
      const result = await runFactCheck(claim);
      const inserted = db
        .prepare(
          'INSERT INTO fact_check_logs (student_id, claim, verdict, explanation, study_tip) VALUES (?, ?, ?, ?, ?)'
        )
        .run(req.user!.id, claim, result.verdict, result.explanation, result.studyTip);

      const record = db.prepare('SELECT * FROM fact_check_logs WHERE id = ?').get(inserted.lastInsertRowid);
      logActivity(req.user!.id, 'Sử dụng công cụ Fact Check', getClientIp(req));
      res.status(201).json({ record });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Không thể kiểm chứng thông tin lúc này.' });
    }
  });

  // Self Test
  app.get('/api/student/self-test', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    const attempts = db
      .prepare('SELECT * FROM self_test_attempts WHERE student_id = ? ORDER BY id DESC')
      .all(req.user!.id) as Array<{
      id: number;
      subject: string;
      topic: string;
      questions_json: string;
      score: number;
      total: number;
      created_at: string;
    }>;

    res.json({
      attempts: attempts.map((a) => ({
        ...a,
        questions: JSON.parse(a.questions_json),
      })),
    });
  });

  app.post('/api/student/self-test/generate', requireAuth, requireRole(['student']), async (req: AuthedRequest, res) => {
    const subject = String(req.body?.subject ?? '').trim();
    const topic = String(req.body?.topic ?? '').trim();

    if (!subject || !topic) {
      res.status(400).json({ error: 'Vui lòng chọn môn học và nhập chủ đề cần kiểm tra.' });
      return;
    }

    try {
      const questions = await generateSelfTestQuestions(subject, topic);
      if (questions.length === 0) {
        res.status(502).json({ error: 'Không tạo được câu hỏi phù hợp. Vui lòng thử chủ đề cụ thể hơn.' });
        return;
      }
      res.json({ subject, topic, questions });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Lỗi khi tạo bộ câu hỏi Self Test.' });
    }
  });

  app.post('/api/student/self-test/submit', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    const subject = String(req.body?.subject ?? '').trim();
    const topic = String(req.body?.topic ?? '').trim();
    const questions = req.body?.questions as SelfTestQuestion[] | undefined;
    const answers = req.body?.answers as number[] | undefined;

    if (!subject || !topic || !Array.isArray(questions) || !Array.isArray(answers) || questions.length === 0) {
      res.status(400).json({ error: 'Dữ liệu nộp bài không hợp lệ.' });
      return;
    }

    let score = 0;
    const graded = questions.map((q, idx) => {
      const userAnswer = Number(answers[idx]);
      const isCorrect = userAnswer === q.correctIndex;
      if (isCorrect) score += 1;
      return {
        ...q,
        userAnswer: Number.isInteger(userAnswer) ? userAnswer : -1,
        isCorrect,
      };
    });

    const inserted = db
      .prepare(
        `INSERT INTO self_test_attempts (student_id, subject, topic, questions_json, score, total)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(req.user!.id, subject, topic, JSON.stringify(graded), score, questions.length);

    logActivity(req.user!.id, `Hoàn thành Self Test (${subject}: ${score}/${questions.length})`, getClientIp(req));

    const attempt = db.prepare('SELECT * FROM self_test_attempts WHERE id = ?').get(inserted.lastInsertRowid) as {
      id: number;
      subject: string;
      topic: string;
      questions_json: string;
      score: number;
      total: number;
      created_at: string;
    };

    res.status(201).json({
      attempt: {
        ...attempt,
        questions: JSON.parse(attempt.questions_json),
      },
    });
  });

  // Student Surveys
  app.get('/api/student/surveys', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    const rows = db
      .prepare('SELECT * FROM survey_responses WHERE student_id = ? ORDER BY id DESC')
      .all(req.user!.id) as Array<{ id: number; survey_type: 'before' | 'after'; answers: string; created_at: string }>;

    res.json({
      surveys: rows.map((r) => ({
        ...r,
        answers: JSON.parse(r.answers),
      })),
    });
  });

  app.post('/api/student/surveys', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    const surveyType = req.body?.survey_type === 'after' ? 'after' : 'before';
    const answers = req.body?.answers;

    if (!answers || typeof answers !== 'object') {
      res.status(400).json({ error: 'Vui lòng hoàn thành các câu hỏi khảo sát.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM survey_responses WHERE student_id = ? AND survey_type = ?')
      .get(req.user!.id, surveyType) as { id: number } | undefined;

    const jsonStr = JSON.stringify(answers);
    let recordId: number;
    if (existing) {
      db.prepare("UPDATE survey_responses SET answers = ?, created_at = datetime('now') WHERE id = ?").run(
        jsonStr,
        existing.id
      );
      recordId = existing.id;
    } else {
      const inserted = db
        .prepare('INSERT INTO survey_responses (student_id, survey_type, answers) VALUES (?, ?, ?)')
        .run(req.user!.id, surveyType, jsonStr);
      recordId = Number(inserted.lastInsertRowid);
    }

    logActivity(
      req.user!.id,
      `Nộp khảo sát ${surveyType === 'before' ? 'Trước khi học' : 'Sau khi học'}`,
      getClientIp(req)
    );

    const saved = db.prepare('SELECT * FROM survey_responses WHERE id = ?').get(recordId) as {
      id: number;
      survey_type: string;
      answers: string;
      created_at: string;
    };
    res.status(201).json({ survey: { ...saved, answers: JSON.parse(saved.answers) } });
  });

  // Student Progress & Class Learning Materials
  app.get('/api/student/progress', requireAuth, requireRole(['student']), (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const tasks = db.prepare('SELECT status, subject FROM study_tasks WHERE student_id = ?').all(userId) as Array<{
      status: string;
      subject: string;
    }>;
    const thinking = db.prepare('SELECT confidence, subject FROM thinking_records WHERE student_id = ?').all(userId) as Array<{
      confidence: number;
      subject: string;
    }>;
    const tests = db
      .prepare('SELECT score, total, subject, topic, created_at FROM self_test_attempts WHERE student_id = ? ORDER BY id DESC')
      .all(userId) as Array<{ score: number; total: number; subject: string; topic: string; created_at: string }>;
    const factChecks = (
      db.prepare('SELECT COUNT(*) as c FROM fact_check_logs WHERE student_id = ?').get(userId) as { c: number }
    ).c;

    const materials = req.user!.class_name
      ? db
          .prepare(
            `SELECT m.*, u.full_name as teacher_name
             FROM learning_materials m
             JOIN users u ON u.id = m.teacher_id
             WHERE m.class_name = ?
             ORDER BY m.id DESC`
          )
          .all(req.user!.class_name)
      : [];

    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const avgConfidence =
      thinking.length > 0
        ? Number((thinking.reduce((acc, r) => acc + (r.confidence || 0), 0) / thinking.length).toFixed(1))
        : 0;
    const avgScorePct =
      tests.length > 0
        ? Math.round(
            (tests.reduce((acc, t) => acc + (t.total > 0 ? t.score / t.total : 0), 0) / tests.length) * 100
          )
        : 0;

    res.json({
      summary: {
        totalTasks: tasks.length,
        completedTasks,
        processingTasks: tasks.filter((t) => t.status === 'processing').length,
        pendingTasks: tasks.filter((t) => t.status === 'pending').length,
        totalThinking: thinking.length,
        avgConfidence,
        totalSelfTests: tests.length,
        avgScorePct,
        totalFactChecks: factChecks,
      },
      recentTests: tests.slice(0, 6),
      materials,
    });
  });

  // ============================================================================
  // TEACHER ROUTES
  // ============================================================================
  function getTeacherAssignedClassNames(teacherId: number): string[] {
    const rows = db
      .prepare(
        `SELECT c.class_name
         FROM teacher_classes tc
         JOIN classes c ON c.id = tc.class_id
         WHERE tc.teacher_id = ?`
      )
      .all(teacherId) as Array<{ class_name: string }>;
    return rows.map((r) => r.class_name);
  }

  app.get('/api/teacher/classes', requireAuth, requireRole(['teacher']), (req: AuthedRequest, res) => {
    const classes = db
      .prepare(
        `SELECT c.id, c.class_name, c.grade,
                (SELECT COUNT(*) FROM users u WHERE u.role = 'student' AND u.class_name = c.class_name) as student_count,
                (SELECT COUNT(*) FROM study_tasks st JOIN users u ON u.id = st.student_id WHERE u.class_name = c.class_name) as task_count,
                (SELECT COUNT(*) FROM learning_materials lm WHERE lm.class_name = c.class_name AND lm.teacher_id = ?) as material_count
         FROM teacher_classes tc
         JOIN classes c ON c.id = tc.class_id
         WHERE tc.teacher_id = ?
         ORDER BY c.grade ASC, c.class_name ASC`
      )
      .all(req.user!.id, req.user!.id);

    res.json({ classes });
  });

  app.get('/api/teacher/students', requireAuth, requireRole(['teacher']), (req: AuthedRequest, res) => {
    const classNames = getTeacherAssignedClassNames(req.user!.id);
    if (classNames.length === 0) {
      res.json({ students: [], tasks: [], thinkingRecords: [] });
      return;
    }

    const placeholders = classNames.map(() => '?').join(',');
    const students = db
      .prepare(
        `SELECT u.id, u.full_name, u.class_name, u.email, u.phone, u.birthday, u.status, u.created_at,
                (SELECT COUNT(*) FROM study_tasks st WHERE st.student_id = u.id) as total_tasks,
                (SELECT COUNT(*) FROM study_tasks st WHERE st.student_id = u.id AND st.status = 'completed') as completed_tasks,
                (SELECT COUNT(*) FROM thinking_records tr WHERE tr.student_id = u.id) as thinking_count,
                (SELECT ROUND(AVG(tr.confidence), 1) FROM thinking_records tr WHERE tr.student_id = u.id) as avg_confidence
         FROM users u
         WHERE u.role = 'student' AND u.class_name IN (${placeholders})
         ORDER BY u.class_name ASC, u.full_name ASC`
      )
      .all(...classNames);

    const tasks = db
      .prepare(
        `SELECT st.*, u.full_name as student_name, u.class_name
         FROM study_tasks st
         JOIN users u ON u.id = st.student_id
         WHERE u.role = 'student' AND u.class_name IN (${placeholders})
         ORDER BY st.id DESC LIMIT 60`
      )
      .all(...classNames);

    const thinkingRecords = db
      .prepare(
        `SELECT tr.*, u.full_name as student_name, u.class_name
         FROM thinking_records tr
         JOIN users u ON u.id = tr.student_id
         WHERE u.role = 'student' AND u.class_name IN (${placeholders})
         ORDER BY tr.id DESC LIMIT 50`
      )
      .all(...classNames);

    res.json({ students, tasks, thinkingRecords });
  });

  app.post('/api/teacher/thinking/:id/note', requireAuth, requireRole(['teacher']), (req: AuthedRequest, res) => {
    const recordId = parseId(req.params.id);
    const note = String(req.body?.note ?? '').trim();
    if (!recordId || !note) {
      res.status(400).json({ error: 'Vui lòng nhập nhận xét hợp lệ.' });
      return;
    }

    const classNames = getTeacherAssignedClassNames(req.user!.id);
    const record = db
      .prepare(
        `SELECT tr.id, u.class_name
         FROM thinking_records tr
         JOIN users u ON u.id = tr.student_id
         WHERE tr.id = ?`
      )
      .get(recordId) as { id: number; class_name: string | null } | undefined;

    if (!record || !record.class_name || !classNames.includes(record.class_name)) {
      res.status(403).json({ error: 'Bạn chỉ có thể nhận xét học sinh thuộc lớp được phân công.' });
      return;
    }

    db.prepare('UPDATE thinking_records SET teacher_note = ? WHERE id = ?').run(note, recordId);
    logActivity(req.user!.id, `Gửi nhận xét Think First #${recordId}`, getClientIp(req));
    res.json({ ok: true });
  });

  app.get('/api/teacher/surveys', requireAuth, requireRole(['teacher']), (req: AuthedRequest, res) => {
    const classNames = getTeacherAssignedClassNames(req.user!.id);
    if (classNames.length === 0) {
      res.json({ surveys: [] });
      return;
    }
    const placeholders = classNames.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT sr.*, u.full_name as student_name, u.class_name
         FROM survey_responses sr
         JOIN users u ON u.id = sr.student_id
         WHERE u.role = 'student' AND u.class_name IN (${placeholders})
         ORDER BY sr.id DESC`
      )
      .all(...classNames) as Array<{
      id: number;
      student_id: number;
      student_name: string;
      class_name: string;
      survey_type: 'before' | 'after';
      answers: string;
      created_at: string;
    }>;

    res.json({
      surveys: rows.map((r) => ({ ...r, answers: JSON.parse(r.answers) })),
    });
  });

  app.get('/api/teacher/materials', requireAuth, requireRole(['teacher']), (req: AuthedRequest, res) => {
    const materials = db
      .prepare('SELECT * FROM learning_materials WHERE teacher_id = ? ORDER BY id DESC')
      .all(req.user!.id);
    res.json({ materials });
  });

  app.post('/api/teacher/materials', requireAuth, requireRole(['teacher']), (req: AuthedRequest, res) => {
    const className = String(req.body?.class_name ?? '').trim();
    const subject = String(req.body?.subject ?? req.user!.subject ?? '').trim();
    const title = String(req.body?.title ?? '').trim();
    const content = String(req.body?.content ?? '').trim();
    const resourceUrl = req.body?.resource_url ? String(req.body.resource_url).trim() : null;

    if (!className || !subject || !title || !content) {
      res.status(400).json({ error: 'Vui lòng nhập đầy đủ lớp học, môn học, tiêu đề và nội dung học liệu.' });
      return;
    }

    if (resourceUrl && !/^https?:\/\//i.test(resourceUrl)) {
      res.status(400).json({ error: 'Liên kết học liệu phải bắt đầu bằng http:// hoặc https://.' });
      return;
    }

    const assigned = getTeacherAssignedClassNames(req.user!.id);
    if (!assigned.includes(className)) {
      res.status(403).json({ error: 'Bạn chỉ có thể đăng học liệu cho lớp được phân công.' });
      return;
    }

    const inserted = db
      .prepare(
        `INSERT INTO learning_materials (teacher_id, class_name, subject, title, content, resource_url)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(req.user!.id, className, subject, title, content, resourceUrl);

    const material = db.prepare('SELECT * FROM learning_materials WHERE id = ?').get(inserted.lastInsertRowid);
    logActivity(req.user!.id, `Đăng học liệu "${title}" cho lớp ${className}`, getClientIp(req));
    res.status(201).json({ material });
  });

  app.delete('/api/teacher/materials/:id', requireAuth, requireRole(['teacher']), (req: AuthedRequest, res) => {
    const materialId = parseId(req.params.id);
    if (!materialId) {
      res.status(400).json({ error: 'ID học liệu không hợp lệ.' });
      return;
    }

    const info = db
      .prepare('DELETE FROM learning_materials WHERE id = ? AND teacher_id = ?')
      .run(materialId, req.user!.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Không tìm thấy học liệu.' });
      return;
    }
    res.json({ ok: true });
  });

  // ============================================================================
  // ADMIN ROUTES
  // ============================================================================
  app.get('/api/admin/overview', requireAuth, requireRole(['admin']), (_req, res) => {
    const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
    const totalStudents = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student'").get() as { c: number }).c;
    const totalTeachers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'teacher'").get() as { c: number }).c;
    const pendingTeachers = (
      db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'teacher' AND is_approved = 0").get() as { c: number }
    ).c;
    const totalClasses = (db.prepare('SELECT COUNT(*) as c FROM classes').get() as { c: number }).c;
    const totalTasks = (db.prepare('SELECT COUNT(*) as c FROM study_tasks').get() as { c: number }).c;
    const completedTasks = (
      db.prepare("SELECT COUNT(*) as c FROM study_tasks WHERE status = 'completed'").get() as { c: number }
    ).c;
    const totalSurveys = (db.prepare('SELECT COUNT(*) as c FROM survey_responses').get() as { c: number }).c;

    const recentLogs = db
      .prepare(
        `SELECT l.*, u.full_name, u.role
         FROM activity_logs l
         LEFT JOIN users u ON u.id = l.user_id
         ORDER BY l.id DESC LIMIT 15`
      )
      .all();

    res.json({
      metrics: {
        totalUsers,
        totalStudents,
        totalTeachers,
        pendingTeachers,
        totalClasses,
        totalTasks,
        completedTasks,
        totalSurveys,
      },
      recentLogs,
    });
  });

  app.get('/api/admin/users', requireAuth, requireRole(['admin']), (_req, res) => {
    const users = db
      .prepare(
        `SELECT id, full_name, birthday, class_name, subject, phone, email, role, is_verified, is_approved, status, created_at
         FROM users
         ORDER BY id DESC`
      )
      .all()
      .map((u) => sanitizeUser(u as AuthenticatedUser));

    const assignments = db
      .prepare(
        `SELECT tc.teacher_id, c.id as class_id, c.class_name, c.grade
         FROM teacher_classes tc
         JOIN classes c ON c.id = tc.class_id`
      )
      .all();

    res.json({ users, assignments });
  });

  app.post('/api/admin/users', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const fullName = String(req.body?.full_name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const role = req.body?.role === 'teacher' || req.body?.role === 'admin' ? req.body.role : 'student';
    const className = req.body?.class_name ? String(req.body.class_name).trim() : null;
    const subject = req.body?.subject ? String(req.body.subject).trim() : null;
    const phone = req.body?.phone ? String(req.body.phone).trim() : null;

    if (!fullName || !email.includes('@') || password.length < 6) {
      res.status(400).json({ error: 'Họ tên, email và mật khẩu (>= 6 ký tự) là bắt buộc.' });
      return;
    }

    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) {
      res.status(409).json({ error: 'Email đã tồn tại.' });
      return;
    }

    const inserted = db
      .prepare(
        `INSERT INTO users (full_name, class_name, subject, phone, email, password_hash, role, is_verified, is_approved, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'active')`
      )
      .run(fullName, className, subject, phone, email, hashPassword(password), role);

    const newId = Number(inserted.lastInsertRowid);
    if (role === 'student') {
      seedStarterTasksForStudent(newId);
    }

    logActivity(req.user!.id, `Admin tạo tài khoản ${email} (${role})`, getClientIp(req));
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(newId) as AuthenticatedUser;
    res.status(201).json({ user: sanitizeUser(user) });
  });

  app.patch('/api/admin/users/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const userId = parseId(req.params.id);
    if (!userId) {
      res.status(400).json({ error: 'ID người dùng không hợp lệ.' });
      return;
    }

    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as AuthenticatedUser | undefined;
    if (!target) {
      res.status(404).json({ error: 'Không tìm thấy người dùng.' });
      return;
    }

    if (typeof req.body?.status === 'string' && ['active', 'locked'].includes(req.body.status)) {
      if (target.id === req.user!.id && req.body.status === 'locked') {
        res.status(400).json({ error: 'Không thể tự khóa tài khoản quản trị đang đăng nhập.' });
        return;
      }
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(req.body.status, userId);
    }

    if (typeof req.body?.is_approved === 'boolean') {
      db.prepare('UPDATE users SET is_approved = ? WHERE id = ?').run(req.body.is_approved ? 1 : 0, userId);
    }

    if (typeof req.body?.is_verified === 'boolean') {
      db.prepare('UPDATE users SET is_verified = ? WHERE id = ?').run(req.body.is_verified ? 1 : 0, userId);
    }

    if (typeof req.body?.class_name === 'string') {
      db.prepare('UPDATE users SET class_name = ? WHERE id = ?').run(req.body.class_name.trim() || null, userId);
    }

    logActivity(req.user!.id, `Admin cập nhật tài khoản #${userId} (${target.email})`, getClientIp(req));
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as AuthenticatedUser;
    res.json({ user: sanitizeUser(updated) });
  });

  app.delete('/api/admin/users/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const userId = parseId(req.params.id);
    if (!userId) {
      res.status(400).json({ error: 'ID không hợp lệ.' });
      return;
    }
    if (userId === req.user!.id) {
      res.status(400).json({ error: 'Không thể xóa tài khoản quản trị đang sử dụng.' });
      return;
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    logActivity(req.user!.id, `Admin xóa tài khoản #${userId}`, getClientIp(req));
    res.json({ ok: true });
  });

  app.post('/api/admin/teachers/assign', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const teacherId = parseId(req.body?.teacher_id);
    const classIds = Array.isArray(req.body?.class_ids)
      ? (req.body.class_ids as unknown[]).map(parseId).filter((x): x is number => x !== null)
      : [];

    if (!teacherId) {
      res.status(400).json({ error: 'ID giáo viên không hợp lệ.' });
      return;
    }

    const teacher = db.prepare("SELECT id, full_name FROM users WHERE id = ? AND role = 'teacher'").get(teacherId) as
      | { id: number; full_name: string }
      | undefined;
    if (!teacher) {
      res.status(404).json({ error: 'Không tìm thấy giáo viên.' });
      return;
    }

    const tx = db.transaction(() => {
      db.prepare('UPDATE users SET is_approved = 1, is_verified = 1 WHERE id = ?').run(teacherId);
      db.prepare('DELETE FROM teacher_classes WHERE teacher_id = ?').run(teacherId);
      const insert = db.prepare('INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)');
      for (const cid of classIds) {
        insert.run(teacherId, cid);
      }
    });
    tx();

    logActivity(req.user!.id, `Phê duyệt & phân công lớp cho ${teacher.full_name}`, getClientIp(req));
    res.json({ ok: true });
  });

  app.get('/api/admin/classes', requireAuth, requireRole(['admin']), (_req, res) => {
    const classes = db
      .prepare(
        `SELECT c.*,
                (SELECT COUNT(*) FROM users u WHERE u.role = 'student' AND u.class_name = c.class_name) as student_count,
                (SELECT COUNT(*) FROM teacher_classes tc WHERE tc.class_id = c.id) as teacher_count
         FROM classes c
         ORDER BY c.grade ASC, c.class_name ASC`
      )
      .all();
    res.json({ classes });
  });

  app.post('/api/admin/classes', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const className = String(req.body?.class_name ?? '').trim().toUpperCase();
    const grade = Number(req.body?.grade);

    if (!className || !Number.isInteger(grade) || grade < 1 || grade > 12) {
      res.status(400).json({ error: 'Tên lớp và khối lớp (1-12) không hợp lệ.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM classes WHERE class_name = ?').get(className);
    if (existing) {
      res.status(409).json({ error: 'Lớp học này đã tồn tại.' });
      return;
    }

    const inserted = db.prepare('INSERT INTO classes (class_name, grade) VALUES (?, ?)').run(className, grade);
    logActivity(req.user!.id, `Tạo lớp học ${className}`, getClientIp(req));
    const created = db.prepare('SELECT * FROM classes WHERE id = ?').get(inserted.lastInsertRowid);
    res.status(201).json({ classItem: created });
  });

  app.delete('/api/admin/classes/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const classId = parseId(req.params.id);
    if (!classId) {
      res.status(400).json({ error: 'ID lớp không hợp lệ.' });
      return;
    }
    db.prepare('DELETE FROM classes WHERE id = ?').run(classId);
    logActivity(req.user!.id, `Xóa lớp học #${classId}`, getClientIp(req));
    res.json({ ok: true });
  });

  app.get('/api/admin/learning', requireAuth, requireRole(['admin']), (_req, res) => {
    const tasks = db
      .prepare(
        `SELECT st.*, u.full_name as student_name, u.class_name
         FROM study_tasks st
         JOIN users u ON u.id = st.student_id
         ORDER BY st.id DESC LIMIT 100`
      )
      .all();
    const thinkingRecords = db
      .prepare(
        `SELECT tr.*, u.full_name as student_name, u.class_name
         FROM thinking_records tr
         JOIN users u ON u.id = tr.student_id
         ORDER BY tr.id DESC LIMIT 100`
      )
      .all();
    const materials = db
      .prepare(
        `SELECT lm.*, u.full_name as teacher_name
         FROM learning_materials lm
         JOIN users u ON u.id = lm.teacher_id
         ORDER BY lm.id DESC LIMIT 60`
      )
      .all();
    res.json({ tasks, thinkingRecords, materials });
  });

  app.get('/api/admin/surveys', requireAuth, requireRole(['admin']), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT sr.*, u.full_name as student_name, u.class_name
         FROM survey_responses sr
         JOIN users u ON u.id = sr.student_id
         ORDER BY sr.id DESC`
      )
      .all() as Array<{
      id: number;
      student_id: number;
      student_name: string;
      class_name: string | null;
      survey_type: 'before' | 'after';
      answers: string;
      created_at: string;
    }>;

    res.json({
      surveys: rows.map((r) => ({ ...r, answers: JSON.parse(r.answers) })),
    });
  });

  app.get('/api/admin/reports', requireAuth, requireRole(['admin']), (_req, res) => {
    const byClass = db
      .prepare(
        `SELECT c.class_name, c.grade,
                (SELECT COUNT(*) FROM users u WHERE u.role = 'student' AND u.class_name = c.class_name) as students,
                (SELECT COUNT(*) FROM study_tasks st JOIN users u ON u.id = st.student_id WHERE u.class_name = c.class_name) as tasks,
                (SELECT COUNT(*) FROM study_tasks st JOIN users u ON u.id = st.student_id WHERE u.class_name = c.class_name AND st.status = 'completed') as completed_tasks,
                (SELECT ROUND(AVG(tr.confidence), 1) FROM thinking_records tr JOIN users u ON u.id = tr.student_id WHERE u.class_name = c.class_name) as avg_confidence
         FROM classes c
         ORDER BY c.grade ASC, c.class_name ASC`
      )
      .all();

    const bySubject = db
      .prepare(
        `SELECT subject,
                COUNT(*) as total_tasks,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
         FROM study_tasks
         GROUP BY subject
         ORDER BY total_tasks DESC`
      )
      .all();

    const logs = db
      .prepare(
        `SELECT l.*, u.full_name, u.role
         FROM activity_logs l
         LEFT JOIN users u ON u.id = l.user_id
         ORDER BY l.id DESC LIMIT 40`
      )
      .all();

    res.json({ byClass, bySubject, logs });
  });

  app.get('/api/admin/backup', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    logActivity(req.user!.id, 'Xuất bản sao lưu dữ liệu toàn hệ thống', getClientIp(req));
    const snapshot = {
      exportedAt: new Date().toISOString(),
      classes: db.prepare('SELECT * FROM classes').all(),
      users: db
        .prepare(
          'SELECT id, full_name, birthday, class_name, subject, phone, email, role, is_verified, is_approved, status, created_at FROM users'
        )
        .all(),
      teacher_classes: db.prepare('SELECT * FROM teacher_classes').all(),
      study_tasks: db.prepare('SELECT * FROM study_tasks').all(),
      thinking_records: db.prepare('SELECT * FROM thinking_records').all(),
      survey_responses: db.prepare('SELECT * FROM survey_responses').all(),
      learning_materials: db.prepare('SELECT * FROM learning_materials').all(),
      self_test_attempts: db.prepare('SELECT * FROM self_test_attempts').all(),
      fact_check_logs: db.prepare('SELECT * FROM fact_check_logs').all(),
      activity_logs: db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 200').all(),
    };
    res.json(snapshot);
  });

  // Vite dev middleware or static dist serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EDU SMART server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start EDU SMART server:', err);
  process.exit(1);
});
