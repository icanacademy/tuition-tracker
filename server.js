const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');
const {
  initializeDatabase,
  upsertStudent,
  getStudents,
  getHiddenStudents,
  getStudentById,
  updateStudentSchedule,
  hideStudent,
  unhideStudent,
  deactivateAllStudents,
  activateStudent,
  createBillingPeriod,
  getBillingPeriod,
  getBillingPeriodsByStudent,
  getAllBillingPeriods,
  updateBillingPeriod,
  updatePaymentStatus,
  deleteBillingPeriod,
  getAttendanceForStudent,
  getAttendanceSummary,
  addHoliday,
  removeHoliday,
  getAllHolidays
} = require('./database');

const app = express();
const PORT = 3004;

// Notion setup (same as attendance app - read only)
const NOTION_API_KEY = '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';
const STUDENT_DATABASE_ID = '1abd37d666308071bfe1e37d1d155035';

const notion = new Client({ auth: NOTION_API_KEY });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize database
initializeDatabase();

// Helper
function getTodayDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

// ==================== STUDENT ROUTES ====================

// Fetch students from Notion, sync to local DB, return all
app.get('/api/students', async (req, res) => {
  try {
    const response = await notion.databases.query({
      database_id: STUDENT_DATABASE_ID,
      filter: {
        property: 'Status',
        select: { equals: 'Active' }
      }
    });

    const notionStudents = response.results.map(page => {
      const props = page.properties;
      return {
        id: page.id,
        name: props['Full Name']?.title?.[0]?.plain_text || 'Unknown',
        studentType: props['Student Type']?.select?.name || 'Local',
        startTime: props['Start Time']?.select?.name || '',
        endTime: props['End Time']?.select?.name || ''
      };
    });

    // Sync to local DB: deactivate all, then upsert active ones
    deactivateAllStudents();
    for (const s of notionStudents) {
      upsertStudent(s.id, s.name, s.studentType, s.startTime, s.endTime);
      activateStudent(s.id);
    }

    // Return from local DB (includes schedule data)
    const students = getStudents(false);
    res.json({ success: true, students });
  } catch (error) {
    console.error('Error fetching students from Notion:', error);
    // Fallback: return cached data
    const students = getStudents(false);
    if (students.length > 0) {
      res.json({ success: true, students, cached: true });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// Get only local students
app.get('/api/students/local', (req, res) => {
  try {
    const students = getStudents(true);
    res.json({ success: true, students });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get hidden students (MUST be before :id route)
app.get('/api/students/hidden', (req, res) => {
  try {
    const students = getHiddenStudents();
    res.json({ success: true, students });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single student
app.get('/api/students/:id', (req, res) => {
  try {
    const student = getStudentById(req.params.id);
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });
    res.json({ success: true, student });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Hide a student
app.patch('/api/students/:id/hide', (req, res) => {
  try {
    hideStudent(req.params.id);
    res.json({ success: true, message: 'Student hidden' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Unhide a student
app.patch('/api/students/:id/unhide', (req, res) => {
  try {
    unhideStudent(req.params.id);
    res.json({ success: true, message: 'Student restored' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update student schedule
app.put('/api/students/:id/schedule', (req, res) => {
  try {
    const { mon, tue, wed, thu, fri } = req.body;
    updateStudentSchedule(req.params.id, mon, tue, wed, thu, fri);
    res.json({ success: true, message: 'Schedule updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== BILLING ROUTES ====================

// Get all billing periods
app.get('/api/billing', (req, res) => {
  try {
    const { status, limit } = req.query;
    const periods = getAllBillingPeriods(status || null, limit ? parseInt(limit) : null);
    res.json({ success: true, periods });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get billing periods for a student
app.get('/api/billing/student/:studentId', (req, res) => {
  try {
    const periods = getBillingPeriodsByStudent(req.params.studentId);
    res.json({ success: true, periods });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single billing period
app.get('/api/billing/:id', (req, res) => {
  try {
    const period = getBillingPeriod(parseInt(req.params.id));
    if (!period) return res.status(404).json({ success: false, error: 'Period not found' });
    res.json({ success: true, period });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create billing period
app.post('/api/billing', (req, res) => {
  try {
    const { studentId, startDate, endDate, tuitionAmount, currency, notes } = req.body;
    if (!studentId || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'studentId, startDate, endDate are required' });
    }
    const result = createBillingPeriod(studentId, startDate, endDate, tuitionAmount, currency, notes);
    res.json({ success: true, id: result.id, message: 'Billing period created' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update billing period
app.put('/api/billing/:id', (req, res) => {
  try {
    const { startDate, endDate, tuitionAmount, currency, notes } = req.body;
    updateBillingPeriod(parseInt(req.params.id), startDate, endDate, tuitionAmount, currency, notes);
    res.json({ success: true, message: 'Billing period updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update payment status
app.patch('/api/billing/:id/payment', (req, res) => {
  try {
    const { status, paidDate } = req.body;
    if (!status || !['paid', 'unpaid'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be "paid" or "unpaid"' });
    }
    updatePaymentStatus(parseInt(req.params.id), status, paidDate);
    res.json({ success: true, message: `Payment status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete billing period
app.delete('/api/billing/:id', (req, res) => {
  try {
    deleteBillingPeriod(parseInt(req.params.id));
    res.json({ success: true, message: 'Billing period deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ATTENDANCE ROUTES (READ-ONLY) ====================

// Get attendance for a student in date range
app.get('/api/attendance/:studentId', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate are required' });
    }
    const attendance = getAttendanceForStudent(req.params.studentId, startDate, endDate);
    res.json({ success: true, attendance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get attendance summary
app.get('/api/attendance/:studentId/summary', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate are required' });
    }
    const summary = getAttendanceSummary(req.params.studentId, startDate, endDate);
    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== HOLIDAY ROUTES ====================

app.get('/api/holidays', (req, res) => {
  try {
    const holidays = getAllHolidays();
    res.json({ success: true, holidays });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/holidays', (req, res) => {
  try {
    const { date, description } = req.body;
    if (!date) return res.status(400).json({ success: false, error: 'Date is required' });
    addHoliday(date, description);
    res.json({ success: true, message: 'Holiday added' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/holidays/:date', (req, res) => {
  try {
    removeHoliday(req.params.date);
    res.json({ success: true, message: 'Holiday removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tuition Tracker running on http://localhost:${PORT}`);
  console.log('Server is accessible from other devices on your network');
});
