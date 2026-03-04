// ==================== GLOBAL STATE ====================
let allStudents = [];
let localStudents = [];
let currentStudentId = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

// API URL - adapts to deployment
const API_URL = '';

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  setTodayDate();
  loadStudents();
});

function setTodayDate() {
  const today = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('today-date').textContent = today.toLocaleDateString('en-US', options);
}

// ==================== TAB SWITCHING ====================
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById(`${tabId}-tab`).classList.add('active');

  if (tabId === 'dashboard') loadDashboard();
  if (tabId === 'settings') loadSettings();
}

// ==================== STUDENT LOADING ====================
async function loadStudents() {
  try {
    const res = await fetch(`${API_URL}/api/students`);
    const data = await res.json();

    if (data.success) {
      allStudents = data.students;
      localStudents = allStudents.filter(s => s.student_type === 'Local');
      populateStudentDropdowns();
      loadDashboard();
    }
  } catch (error) {
    console.error('Error loading students:', error);
    // Try cached local data
    try {
      const res = await fetch(`${API_URL}/api/students/local`);
      const data = await res.json();
      if (data.success) {
        localStudents = data.students;
        allStudents = localStudents;
        populateStudentDropdowns();
        loadDashboard();
      }
    } catch (e) {
      document.getElementById('student-billing-list').innerHTML =
        '<div class="empty-state">Failed to load students. Check server connection.</div>';
    }
  }
}

function populateStudentDropdowns() {
  // Calendar student selector
  const calSelect = document.getElementById('calendar-student');
  calSelect.innerHTML = '<option value="">Select a student</option>';
  calSelect.innerHTML += '<option value="__all__">All Students</option>';
  localStudents.forEach(s => {
    calSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
  });

  // Modal student selector
  const modalSelect = document.getElementById('modal-student');
  modalSelect.innerHTML = '';
  localStudents.forEach(s => {
    modalSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
  });

  // Calendar student change handler
  calSelect.addEventListener('change', (e) => {
    const value = e.target.value;
    if (value === '__all__') {
      currentStudentId = null;
      showAllStudentsView(currentYear, currentMonth);
    } else if (value) {
      currentStudentId = value;
      hideAllStudentsView();
      loadCalendarView(currentStudentId, currentYear, currentMonth);
    } else {
      currentStudentId = null;
      document.getElementById('calendar-container').style.display = 'none';
      document.getElementById('billing-periods-panel').style.display = 'none';
      document.getElementById('student-schedule-display').style.display = 'none';
      hideAllStudentsView();
    }
  });
}

function hideAllStudentsView() {
  document.getElementById('all-students-container').style.display = 'none';
}

function getScheduleShortText(student) {
  const count = [student.schedule_mon, student.schedule_tue, student.schedule_wed, student.schedule_thu, student.schedule_fri].filter(Boolean).length;
  return `${count}x/wk`;
}

// ==================== HELPERS ====================
function getStudentById(id) {
  return allStudents.find(s => s.id === id);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

function formatCurrency(amount, currency) {
  if (!amount && amount !== 0) return '-';
  const formatted = Number(amount).toLocaleString();
  return `${currency || '₱'}${formatted}`;
}

function getScheduleText(student) {
  const days = [];
  if (student.schedule_mon) days.push('Mon');
  if (student.schedule_tue) days.push('Tue');
  if (student.schedule_wed) days.push('Wed');
  if (student.schedule_thu) days.push('Thu');
  if (student.schedule_fri) days.push('Fri');

  if (days.length === 5) return 'Mon-Fri (5x/week)';
  if (days.length === 0) return 'No schedule set';
  return `${days.join(', ')} (${days.length}x/week)`;
}

function getLocalDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
