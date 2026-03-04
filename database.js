const Database = require('better-sqlite3');
const path = require('path');

// Own database for tuition tracking
const db = new Database(path.join(__dirname, 'tuition-tracker.db'));

// Read-only connection to existing attendance database
const attendanceDb = new Database(
  path.join(__dirname, '..', 'student-attendance-checker', 'student-attendance.db'),
  { readonly: true }
);

// Initialize database schema
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      student_type TEXT DEFAULT 'Local',
      start_time TEXT,
      end_time TEXT,
      schedule_mon INTEGER DEFAULT 1,
      schedule_tue INTEGER DEFAULT 1,
      schedule_wed INTEGER DEFAULT 1,
      schedule_thu INTEGER DEFAULT 1,
      schedule_fri INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      last_synced DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      tuition_amount REAL,
      currency TEXT DEFAULT '₱',
      payment_status TEXT DEFAULT 'unpaid',
      paid_date TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bp_student ON billing_periods(student_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bp_status ON billing_periods(payment_status)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add hidden column (migration)
  try {
    db.exec(`ALTER TABLE students ADD COLUMN hidden INTEGER DEFAULT 0`);
  } catch (e) { /* already exists */ }

  console.log('Tuition tracker database initialized');
}

// ==================== STUDENT FUNCTIONS ====================

function upsertStudent(id, name, studentType, startTime, endTime) {
  const stmt = db.prepare(`
    INSERT INTO students (id, name, student_type, start_time, end_time, last_synced)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      student_type = excluded.student_type,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      last_synced = CURRENT_TIMESTAMP
  `);
  stmt.run(id, name, studentType, startTime, endTime);
}

function getStudents(onlyLocal = false, includeHidden = false) {
  const hiddenFilter = includeHidden ? '' : 'AND hidden = 0';
  if (onlyLocal) {
    return db.prepare(`SELECT * FROM students WHERE student_type = 'Local' AND is_active = 1 ${hiddenFilter} ORDER BY name`).all();
  }
  return db.prepare(`SELECT * FROM students WHERE is_active = 1 ${hiddenFilter} ORDER BY name`).all();
}

function getHiddenStudents() {
  return db.prepare(`SELECT * FROM students WHERE hidden = 1 ORDER BY name`).all();
}

function getStudentById(id) {
  return db.prepare(`SELECT * FROM students WHERE id = ?`).get(id);
}

function updateStudentSchedule(id, mon, tue, wed, thu, fri) {
  const stmt = db.prepare(`
    UPDATE students SET
      schedule_mon = ?,
      schedule_tue = ?,
      schedule_wed = ?,
      schedule_thu = ?,
      schedule_fri = ?
    WHERE id = ?
  `);
  stmt.run(mon ? 1 : 0, tue ? 1 : 0, wed ? 1 : 0, thu ? 1 : 0, fri ? 1 : 0, id);
}

function hideStudent(id) {
  db.prepare(`UPDATE students SET hidden = 1 WHERE id = ?`).run(id);
}

function unhideStudent(id) {
  db.prepare(`UPDATE students SET hidden = 0 WHERE id = ?`).run(id);
}

function deactivateAllStudents() {
  db.prepare(`UPDATE students SET is_active = 0`).run();
}

function activateStudent(id) {
  // Don't override manual hide - only set is_active
  db.prepare(`UPDATE students SET is_active = 1 WHERE id = ?`).run(id);
}

// ==================== BILLING PERIOD FUNCTIONS ====================

function createBillingPeriod(studentId, startDate, endDate, tuitionAmount, currency, notes) {
  const stmt = db.prepare(`
    INSERT INTO billing_periods (student_id, start_date, end_date, tuition_amount, currency, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(studentId, startDate, endDate, tuitionAmount, currency || '₱', notes || null);
  return { id: result.lastInsertRowid };
}

function getBillingPeriod(id) {
  return db.prepare(`SELECT * FROM billing_periods WHERE id = ?`).get(id);
}

function getBillingPeriodsByStudent(studentId) {
  return db.prepare(`
    SELECT * FROM billing_periods WHERE student_id = ? ORDER BY start_date DESC
  `).all(studentId);
}

function getAllBillingPeriods(status, limit) {
  let query = `SELECT bp.*, s.name as student_name FROM billing_periods bp LEFT JOIN students s ON bp.student_id = s.id`;
  const params = [];

  if (status) {
    query += ` WHERE bp.payment_status = ?`;
    params.push(status);
  }

  query += ` ORDER BY bp.start_date DESC`;

  if (limit) {
    query += ` LIMIT ?`;
    params.push(limit);
  }

  return db.prepare(query).all(...params);
}

function updateBillingPeriod(id, startDate, endDate, tuitionAmount, currency, notes) {
  const stmt = db.prepare(`
    UPDATE billing_periods SET
      start_date = ?,
      end_date = ?,
      tuition_amount = ?,
      currency = ?,
      notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(startDate, endDate, tuitionAmount, currency, notes, id);
}

function updatePaymentStatus(id, status, paidDate) {
  const stmt = db.prepare(`
    UPDATE billing_periods SET
      payment_status = ?,
      paid_date = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(status, status === 'paid' ? (paidDate || getLocalDateString()) : null, id);
}

function deleteBillingPeriod(id) {
  db.prepare(`DELETE FROM billing_periods WHERE id = ?`).run(id);
}

// ==================== ATTENDANCE (READ-ONLY) ====================

function getAttendanceForStudent(studentId, startDate, endDate) {
  const stmt = attendanceDb.prepare(`
    SELECT date, status, is_active, minutes_late, has_undertime
    FROM attendance
    WHERE student_id = ?
    AND date >= ?
    AND date <= ?
    AND is_active = 1
    ORDER BY date ASC
  `);
  return stmt.all(studentId, startDate, endDate);
}

function getAttendanceSummary(studentId, startDate, endDate) {
  const stmt = attendanceDb.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'present' THEN 1 END) as present_count,
      COUNT(CASE WHEN status = 'late' THEN 1 END) as late_count,
      COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_count,
      COUNT(*) as total
    FROM attendance
    WHERE student_id = ?
    AND date >= ?
    AND date <= ?
    AND is_active = 1
  `);
  return stmt.get(studentId, startDate, endDate);
}

// ==================== HOLIDAY FUNCTIONS ====================

function addHoliday(date, description) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO holidays (date, description) VALUES (?, ?)
  `);
  stmt.run(date, description || '');
}

function removeHoliday(date) {
  db.prepare(`DELETE FROM holidays WHERE date = ?`).run(date);
}

function getAllHolidays() {
  return db.prepare(`SELECT * FROM holidays ORDER BY date ASC`).all();
}

// ==================== HELPERS ====================

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = {
  db,
  attendanceDb,
  initializeDatabase,
  // Students
  upsertStudent,
  getStudents,
  getHiddenStudents,
  getStudentById,
  updateStudentSchedule,
  hideStudent,
  unhideStudent,
  deactivateAllStudents,
  activateStudent,
  // Billing
  createBillingPeriod,
  getBillingPeriod,
  getBillingPeriodsByStudent,
  getAllBillingPeriods,
  updateBillingPeriod,
  updatePaymentStatus,
  deleteBillingPeriod,
  // Attendance (read-only)
  getAttendanceForStudent,
  getAttendanceSummary,
  // Holidays
  addHoliday,
  removeHoliday,
  getAllHolidays
};
