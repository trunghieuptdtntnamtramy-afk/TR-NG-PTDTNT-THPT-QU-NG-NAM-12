import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'edu_smart.db');
export const db = new Database(dbPath);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hexHash] = parts;
  if (!salt || !hexHash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hexHash, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      birthday TEXT,
      class_name TEXT,
      subject TEXT,
      phone TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student','teacher','admin')),
      is_verified INTEGER NOT NULL DEFAULT 0,
      is_approved INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','locked')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_name TEXT NOT NULL UNIQUE,
      grade INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teacher_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      UNIQUE (teacher_id, class_id)
    );

    CREATE TABLE IF NOT EXISTS study_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      task_name TEXT NOT NULL,
      goal TEXT,
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS thinking_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      subject TEXT NOT NULL DEFAULT 'Tổng hợp',
      question TEXT NOT NULL,
      initial_thinking TEXT NOT NULL,
      confidence INTEGER CHECK(confidence BETWEEN 1 AND 5),
      ai_feedback TEXT,
      teacher_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS survey_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      survey_type TEXT NOT NULL CHECK(survey_type IN ('before','after')),
      answers TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS learning_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      class_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      resource_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS self_test_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      questions_json TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fact_check_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      claim TEXT NOT NULL,
      verdict TEXT NOT NULL,
      explanation TEXT NOT NULL,
      study_tip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_coach_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  seedInitialData();
}

function seedInitialData(): void {
  const classCount = (db.prepare('SELECT COUNT(*) as c FROM classes').get() as { c: number }).c;
  if (classCount > 0) return;

  const insertClass = db.prepare('INSERT INTO classes (class_name, grade) VALUES (?, ?)');
  const seedClasses = [
    ['10A1', 10],
    ['10A2', 10],
    ['11B1', 11],
    ['12C1', 12],
  ] as const;

  for (const [name, grade] of seedClasses) {
    insertClass.run(name, grade);
  }

  // Non-privileged curriculum sample roster (cannot log in with guessable passwords;
  // users register their own Student/Teacher accounts or claim Admin on first run).
  const lockedPlaceholderHash = hashPassword(crypto.randomBytes(24).toString('hex'));

  const insertUser = db.prepare(`
    INSERT INTO users (full_name, birthday, class_name, subject, phone, email, password_hash, role, is_verified, is_approved, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const teacher1 = insertUser.run(
    'Cô Nguyễn Minh Anh',
    '1990-05-14',
    null,
    'Toán học',
    '0901122334',
    'minhanh.toan@edusmart.edu.vn',
    lockedPlaceholderHash,
    'teacher',
    1,
    1,
    'active'
  );

  const teacher2 = insertUser.run(
    'Thầy Trần Quốc Bảo',
    '1988-11-22',
    null,
    'Vật lý',
    '0902233445',
    'quocbao.vatly@edusmart.edu.vn',
    lockedPlaceholderHash,
    'teacher',
    1,
    1,
    'active'
  );

  insertUser.run(
    'Cô Lê Thu Hà',
    '1994-03-08',
    null,
    'Ngữ văn',
    '0903344556',
    'thuha.nguvan@edusmart.edu.vn',
    lockedPlaceholderHash,
    'teacher',
    1,
    0,
    'active'
  );

  const student1 = insertUser.run(
    'Phạm Gia Huy',
    '2009-09-12',
    '10A1',
    null,
    '0914455667',
    'giahuy.10a1@edusmart.edu.vn',
    lockedPlaceholderHash,
    'student',
    1,
    1,
    'active'
  );

  const student2 = insertUser.run(
    'Trần Ngọc Khánh Linh',
    '2009-04-27',
    '10A1',
    null,
    '0915566778',
    'khanhlinh.10a1@edusmart.edu.vn',
    lockedPlaceholderHash,
    'student',
    1,
    1,
    'active'
  );

  const student3 = insertUser.run(
    'Hoàng Đức Mạnh',
    '2008-07-19',
    '11B1',
    null,
    '0916677889',
    'ducmanh.11b1@edusmart.edu.vn',
    lockedPlaceholderHash,
    'student',
    1,
    1,
    'active'
  );

  const class10A1 = db.prepare('SELECT id FROM classes WHERE class_name = ?').get('10A1') as { id: number };
  const class10A2 = db.prepare('SELECT id FROM classes WHERE class_name = ?').get('10A2') as { id: number };
  const class11B1 = db.prepare('SELECT id FROM classes WHERE class_name = ?').get('11B1') as { id: number };

  const assignClass = db.prepare('INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)');
  assignClass.run(teacher1.lastInsertRowid, class10A1.id);
  assignClass.run(teacher1.lastInsertRowid, class10A2.id);
  assignClass.run(teacher2.lastInsertRowid, class11B1.id);

  const insertTask = db.prepare(`
    INSERT INTO study_tasks (student_id, subject, task_name, goal, deadline, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertTask.run(student1.lastInsertRowid, 'Toán học', 'Ôn tập Hàm số bậc hai', 'Làm trọn vẹn 10 bài tập khảo sát parabol', '2026-11-28 20:00', 'completed');
  insertTask.run(student1.lastInsertRowid, 'Vật lý', 'Phân tích chuyển động thẳng biến đổi đều', 'Vẽ được đồ thị v-t và tính quãng đường', '2026-11-30 19:00', 'processing');
  insertTask.run(student2.lastInsertRowid, 'Toán học', 'Hệ bất phương trình bậc nhất hai ẩn', 'Xác định miền nghiệm trên mặt phẳng tọa độ', '2026-11-29 21:00', 'completed');
  insertTask.run(student3.lastInsertRowid, 'Vật lý', 'Dao động điều hòa con lắc lò xo', 'Nắm vững công thức chu kỳ T và cơ năng', '2026-12-01 20:00', 'pending');

  const insertThink = db.prepare(`
    INSERT INTO thinking_records (student_id, subject, question, initial_thinking, confidence, ai_feedback)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertThink.run(
    student1.lastInsertRowid,
    'Toán học',
    'Tại sao đỉnh parabol y = ax^2 + bx + c có hoành độ x = -b / (2a)?',
    'Em nghĩ là do lấy đạo hàm bằng 0 hoặc biến đổi hằng đẳng thức bình phương đủ a(x + b/2a)^2.',
    4,
    'Hướng tiếp cận bằng hằng đẳng thức rất chính xác cho chương trình lớp 10! Em hãy thử viết đầy đủ phần hằng số còn lại để xác định tung độ đỉnh nhé.'
  );
  insertThink.run(
    student2.lastInsertRowid,
    'Hóa học',
    'Liên kết cộng hóa trị phân cực khác liên kết ion ở điểm nào?',
    'Liên kết cộng hóa trị dùng chung electron còn liên kết ion thì cho nhận hẳn electron.',
    3,
    'Đúng bản chất! Em hãy kiểm tra thêm tiêu chí hiệu độ âm điện để phân biệt ranh giới giữa hai loại liên kết này.'
  );

  const insertSurvey = db.prepare(`
    INSERT INTO survey_responses (student_id, survey_type, answers)
    VALUES (?, ?, ?)
  `);
  insertSurvey.run(
    student1.lastInsertRowid,
    'before',
    JSON.stringify({
      selfPlanFrequency: 3,
      thinkBeforeAi: 2,
      verifyAiFacts: 2,
      learningConfidence: 3,
      reflection: 'Thường hỏi đáp án trực tiếp khi gặp bài khó.',
    })
  );
  insertSurvey.run(
    student1.lastInsertRowid,
    'after',
    JSON.stringify({
      selfPlanFrequency: 5,
      thinkBeforeAi: 5,
      verifyAiFacts: 4,
      learningConfidence: 5,
      reflection: 'Đã biết tự phác thảo hướng giải trước khi trao đổi với AI Coach.',
    })
  );

  const insertMaterial = db.prepare(`
    INSERT INTO learning_materials (teacher_id, class_name, subject, title, content, resource_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertMaterial.run(
    teacher1.lastInsertRowid,
    '10A1',
    'Toán học',
    'Chuyên đề Hàm số bậc hai & Bảng biến thiên',
    'Tổng hợp phương pháp xác định đỉnh parabol, trục đối xứng và xét dấu tam thức bậc hai kèm 15 bài tập tự luyện.',
    'https://edusmart.edu.vn/materials/toan-10-ham-so'
  );
  insertMaterial.run(
    teacher2.lastInsertRowid,
    '11B1',
    'Vật lý',
    'Sơ đồ tư duy Dao động cơ học',
    'Hệ thống hóa phương trình li độ, vận tốc, gia tốc và mối liên hệ với chuyển động tròn đều.',
    'https://edusmart.edu.vn/materials/vat-ly-11-dao-dong'
  );

  db.prepare('INSERT INTO activity_logs (user_id, action, ip_address) VALUES (?, ?, ?)').run(
    null,
    'Khởi tạo cơ sở dữ liệu EDU SMART và dữ liệu lớp học mẫu',
    '127.0.0.1'
  );
}

export function seedStarterTasksForStudent(studentId: number): void {
  const insertTask = db.prepare(`
    INSERT INTO study_tasks (student_id, subject, task_name, goal, deadline, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertTask.run(studentId, 'Toán học', 'Lập kế hoạch ôn tập chương mới', 'Hoàn thành 5 bài tập cơ bản trước khi tự kiểm tra', '2026-12-02 20:00', 'pending');
  insertTask.run(studentId, 'Ngữ văn', 'Lập dàn ý nghị luận xã hội', 'Ghi lại 3 luận điểm chính trong Think First', '2026-12-04 20:00', 'processing');
}

export function logActivity(userId: number | null, action: string, ipAddress?: string): void {
  db.prepare('INSERT INTO activity_logs (user_id, action, ip_address) VALUES (?, ?, ?)').run(
    userId,
    action,
    ipAddress ?? '127.0.0.1'
  );
}
