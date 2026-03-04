// ==================== CALENDAR VIEW ====================

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let isAllStudentsMode = false;

// Helper: determine billing bar segment class for a date
// Returns null if bar shouldn't show (not a scheduled day), or segment class string
function getBarSegment(year, month, day, bp, scheduleDays) {
  const dow = new Date(year, month, day).getDay();
  if (!scheduleDays.has(dow)) return null;

  const prevDate = new Date(year, month, day - 1);
  const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
  const prevHasBar = scheduleDays.has(prevDate.getDay()) && prevStr >= bp.start_date && prevStr <= bp.end_date;

  const nextDate = new Date(year, month, day + 1);
  const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
  const nextHasBar = scheduleDays.has(nextDate.getDay()) && nextStr >= bp.start_date && nextStr <= bp.end_date;

  if (!prevHasBar && !nextHasBar) return 'bar-single';
  if (!prevHasBar) return 'bar-start';
  if (!nextHasBar) return 'bar-end';
  return 'bar-mid';
}

// Initialize calendar navigation (single student)
document.getElementById('prev-month').addEventListener('click', () => {
  currentMonth--;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  if (currentStudentId) loadCalendarView(currentStudentId, currentYear, currentMonth);
});

document.getElementById('next-month').addEventListener('click', () => {
  currentMonth++;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  if (currentStudentId) loadCalendarView(currentStudentId, currentYear, currentMonth);
});

// All students navigation
document.getElementById('all-prev-month').addEventListener('click', () => {
  currentMonth--;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  showAllStudentsView(currentYear, currentMonth);
});

document.getElementById('all-next-month').addEventListener('click', () => {
  currentMonth++;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  showAllStudentsView(currentYear, currentMonth);
});

async function loadCalendarView(studentId, year, month) {
  const student = getStudentById(studentId);
  if (!student) return;

  // Show containers
  document.getElementById('calendar-container').style.display = 'block';
  document.getElementById('billing-periods-panel').style.display = 'block';

  // Show schedule
  const scheduleDisplay = document.getElementById('student-schedule-display');
  scheduleDisplay.style.display = 'block';
  scheduleDisplay.textContent = getScheduleText(student);

  // Update month label
  document.getElementById('calendar-month-label').textContent = `${MONTH_NAMES[month]} ${year}`;

  // Calculate date range for this month
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  try {
    // Fetch attendance, billing, and holidays in parallel
    const [attendanceRes, billingRes, holidaysRes] = await Promise.all([
      fetch(`${API_URL}/api/attendance/${studentId}?startDate=${startDate}&endDate=${endDate}`),
      fetch(`${API_URL}/api/billing/student/${studentId}`),
      fetch(`${API_URL}/api/holidays`)
    ]);

    const attendanceData = await attendanceRes.json();
    const billingData = await billingRes.json();
    const holidaysData = await holidaysRes.json();

    const attendance = attendanceData.success ? attendanceData.attendance : [];
    const billingPeriods = billingData.success ? billingData.periods : [];
    const holidays = holidaysData.success ? holidaysData.holidays : [];

    renderCalendar(year, month, student, attendance, billingPeriods, holidays);
    renderBillingPeriodsList(studentId, billingPeriods);
    renderCalendarSummary(attendance, student, year, month);
  } catch (error) {
    console.error('Error loading calendar data:', error);
  }
}

function renderCalendar(year, month, student, attendance, billingPeriods, holidays) {
  const grid = document.getElementById('calendar-grid');

  // Build schedule set (0=Sun, 1=Mon, ..., 6=Sat)
  const scheduleDays = new Set();
  if (student.schedule_mon) scheduleDays.add(1);
  if (student.schedule_tue) scheduleDays.add(2);
  if (student.schedule_wed) scheduleDays.add(3);
  if (student.schedule_thu) scheduleDays.add(4);
  if (student.schedule_fri) scheduleDays.add(5);

  // Build attendance map
  const attendanceMap = {};
  attendance.forEach(a => { attendanceMap[a.date] = a.status; });

  // Build holiday set
  const holidaySet = new Set(holidays.map(h => h.date));

  // Get month info
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const today = getLocalDateString();

  // Find billing periods overlapping this month
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`;
  const overlapping = billingPeriods.filter(bp =>
    bp.start_date <= monthEnd && bp.end_date >= monthStart
  );

  // Build HTML: headers + cells
  let html = DAY_NAMES.map(d => `<div class="cal-header">${d}</div>`).join('');

  // Empty cells before first day
  for (let i = 0; i < firstDayOfWeek; i++) {
    html += '<div class="cal-day-empty"></div>';
  }

  // Day cells
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month, day).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isScheduled = scheduleDays.has(dayOfWeek);
    const isHoliday = holidaySet.has(dateStr);
    const isToday = dateStr === today;
    const status = attendanceMap[dateStr];

    // CSS classes
    const classes = ['cal-day'];
    if (isWeekend) classes.push('weekend');
    if (!isScheduled && !isWeekend) classes.push('unscheduled');
    if (isHoliday) classes.push('holiday');
    if (isToday) classes.push('today');

    // Attendance indicator
    let indicator = '';
    if (status === 'present') {
      indicator = '<span class="cal-dot present">&#9679;</span>';
    } else if (status === 'late') {
      indicator = '<span class="cal-dot late">&#9679;</span>';
    } else if (status === 'absent') {
      indicator = '<span class="cal-dot absent">&#10005;</span>';
    }

    // Billing bars - only on scheduled days
    let barHtml = '';
    overlapping.forEach((bp, idx) => {
      if (dateStr >= bp.start_date && dateStr <= bp.end_date) {
        const segClass = getBarSegment(year, month, day, bp, scheduleDays);
        if (!segClass) return; // not a scheduled day, skip bar

        const barClass = bp.payment_status === 'paid' ? 'bar-paid' : 'bar-unpaid';
        const topOffset = 50 + idx * 10;
        const label = bp.payment_status === 'paid' ? 'Paid' : 'Unpaid';
        const bpBizDays = countBusinessDays(bp.start_date, bp.end_date);
        barHtml += `<div class="cal-bar ${barClass} ${segClass}"
                         data-billing-id="${bp.id}"
                         style="top: ${topOffset}px"
                         title="${label}: ${bp.start_date} ~ ${bp.end_date} (${bpBizDays} weekdays)"></div>`;
      }
    });

    html += `<div class="${classes.join(' ')}">
      <span class="cal-day-num">${day}</span>
      ${indicator}
      ${barHtml}
    </div>`;
  }

  grid.innerHTML = html;

  // Click handlers for billing bars
  grid.querySelectorAll('.cal-bar').forEach(bar => {
    bar.addEventListener('click', () => {
      const billingId = parseInt(bar.dataset.billingId);
      openBillingModal('edit', billingId);
    });
  });
}

function renderCalendarSummary(attendance, student, year, month) {
  const totalDays = new Date(year, month + 1, 0).getDate();
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;

  attendance.forEach(a => {
    if (a.status === 'present') presentCount++;
    else if (a.status === 'late') lateCount++;
    else if (a.status === 'absent') absentCount++;
  });

  // Count scheduled days in this month
  const scheduleDays = new Set();
  if (student.schedule_mon) scheduleDays.add(1);
  if (student.schedule_tue) scheduleDays.add(2);
  if (student.schedule_wed) scheduleDays.add(3);
  if (student.schedule_thu) scheduleDays.add(4);
  if (student.schedule_fri) scheduleDays.add(5);

  let scheduledCount = 0;
  for (let d = 1; d <= totalDays; d++) {
    const dow = new Date(year, month, d).getDay();
    if (scheduleDays.has(dow)) scheduledCount++;
  }

  const summaryEl = document.getElementById('calendar-summary');
  summaryEl.innerHTML = `
    <div class="summary-stat">
      <span class="summary-stat-dot" style="background:var(--success)"></span>
      Present: <strong>${presentCount}</strong>
    </div>
    <div class="summary-stat">
      <span class="summary-stat-dot" style="background:var(--warning)"></span>
      Late: <strong>${lateCount}</strong>
    </div>
    <div class="summary-stat">
      <span class="summary-stat-dot" style="background:var(--danger)"></span>
      Absent: <strong>${absentCount}</strong>
    </div>
    <div class="summary-stat">
      Attended: <strong>${presentCount + lateCount}</strong> / ${scheduledCount} scheduled days
    </div>
  `;
}

function renderBillingPeriodsList(studentId, periods) {
  const list = document.getElementById('billing-periods-list');

  if (periods.length === 0) {
    list.innerHTML = '<div class="empty-state">No billing periods yet. Click "+ Add Period" to create one.</div>';
    return;
  }

  list.innerHTML = periods.map(bp => {
    const bizDays = countBusinessDays(bp.start_date, bp.end_date);
    return `
    <div class="billing-period-row">
      <div>
        <span class="billing-period-dates">${formatDate(bp.start_date)} - ${formatDate(bp.end_date)}</span>
        <span class="billing-period-bizdays">${bizDays} weekdays</span>
        ${bp.notes ? `<span class="student-meta" style="margin-left:8px">${escapeHtml(bp.notes)}</span>` : ''}
      </div>
      <span class="billing-period-amount">${formatCurrency(bp.tuition_amount, bp.currency)}</span>
      <div class="status-with-date">
        <span class="status-badge ${bp.payment_status === 'paid' ? 'status-paid' : 'status-unpaid'}">
          ${bp.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
        </span>
        ${bp.payment_status === 'paid' && bp.paid_date ? `<span class="paid-date-label">${formatDate(bp.paid_date)}</span>` : ''}
      </div>
      <div class="billing-period-actions">
        <button class="btn btn-sm btn-secondary" onclick="openBillingModal('edit', ${bp.id})">Edit</button>
        <button class="btn btn-sm ${bp.payment_status === 'paid' ? 'btn-danger' : 'btn-success'}"
                onclick="togglePaymentStatus(${bp.id}, '${bp.payment_status === 'paid' ? 'unpaid' : 'paid'}')">
          ${bp.payment_status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteBillingPeriod(${bp.id})" title="Delete">&#10005;</button>
      </div>
    </div>
  `}).join('');
}

// ==================== ALL STUDENTS MATRIX VIEW ====================

async function showAllStudentsView(year, month) {
  isAllStudentsMode = true;

  // Hide single-student views
  document.getElementById('calendar-container').style.display = 'none';
  document.getElementById('billing-periods-panel').style.display = 'none';
  document.getElementById('student-schedule-display').style.display = 'none';

  // Show all-students container
  const container = document.getElementById('all-students-container');
  container.style.display = 'block';

  // Update month label
  document.getElementById('all-month-label').textContent = `${MONTH_NAMES[month]} ${year}`;

  const matrixEl = document.getElementById('all-students-matrix');
  matrixEl.innerHTML = '<div class="loading">Loading all students...</div>';

  // Calculate date range
  const mm = String(month + 1).padStart(2, '0');
  const startDate = `${year}-${mm}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const endDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  const today = getLocalDateString();

  try {
    // Fetch holidays once
    const holidaysRes = await fetch(`${API_URL}/api/holidays`);
    const holidaysData = await holidaysRes.json();
    const holidays = holidaysData.success ? holidaysData.holidays : [];
    const holidaySet = new Set(holidays.map(h => h.date));

    // Fetch attendance and billing for all local students in parallel
    const studentDataPromises = localStudents.map(async (student) => {
      const [attRes, billRes] = await Promise.all([
        fetch(`${API_URL}/api/attendance/${student.id}?startDate=${startDate}&endDate=${endDate}`),
        fetch(`${API_URL}/api/billing/student/${student.id}`)
      ]);
      const attData = await attRes.json();
      const billData = await billRes.json();
      return {
        student,
        attendance: attData.success ? attData.attendance : [],
        billingPeriods: billData.success ? billData.periods : []
      };
    });

    const allData = await Promise.all(studentDataPromises);

    renderMatrix(year, month, lastDay, today, holidaySet, allData);

  } catch (error) {
    console.error('Error loading all students:', error);
    matrixEl.innerHTML = '<div class="empty-state">Failed to load student data.</div>';
  }
}

function renderMatrix(year, month, totalDays, today, holidaySet, allData) {
  const matrixEl = document.getElementById('all-students-matrix');
  const mm = String(month + 1).padStart(2, '0');
  const shortDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Build header row: Name | 1 | 2 | 3 ... | 31 | Attended
  let headerHtml = '<th class="matrix-name-col">Student</th>';
  for (let d = 1; d <= totalDays; d++) {
    const dow = new Date(year, month, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    headerHtml += `<th class="matrix-day-header ${isWeekend ? 'weekend-header' : ''}">
      <span class="matrix-day-num">${d}</span>
      <span class="matrix-day-name">${shortDayNames[dow].charAt(0)}</span>
    </th>`;
  }
  headerHtml += '<th class="matrix-summary-col">Att.</th>';

  // Build body rows
  let bodyHtml = '';
  for (const { student, attendance, billingPeriods } of allData) {
    // Schedule set
    const scheduleDays = new Set();
    if (student.schedule_mon) scheduleDays.add(1);
    if (student.schedule_tue) scheduleDays.add(2);
    if (student.schedule_wed) scheduleDays.add(3);
    if (student.schedule_thu) scheduleDays.add(4);
    if (student.schedule_fri) scheduleDays.add(5);

    // Attendance map
    const attMap = {};
    attendance.forEach(a => { attMap[a.date] = a.status; });

    // Overlapping billing periods
    const monthStart = `${year}-${mm}-01`;
    const monthEnd = `${year}-${mm}-${String(totalDays).padStart(2, '0')}`;
    const overlapping = billingPeriods.filter(bp =>
      bp.start_date <= monthEnd && bp.end_date >= monthStart
    );

    // Count attendance
    let attended = 0;
    attendance.forEach(a => {
      if (a.status === 'present' || a.status === 'late') attended++;
    });

    // Student name cell
    bodyHtml += `<tr>`;
    bodyHtml += `<td class="matrix-name-col">
      <span class="matrix-student-name" onclick="viewStudentCalendar('${student.id}')" title="Click for detail">${escapeHtml(student.name)}</span>
    </td>`;

    // Day cells
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${mm}-${String(d).padStart(2, '0')}`;
      const dow = new Date(year, month, d).getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isScheduled = scheduleDays.has(dow);
      const isToday = dateStr === today;
      const isHoliday = holidaySet.has(dateStr);
      const status = attMap[dateStr];

      const classes = ['matrix-cell'];
      if (isWeekend) classes.push('weekend-cell');
      else if (!isScheduled) classes.push('unscheduled-cell');
      if (isToday) classes.push('today-cell');
      if (isHoliday) classes.push('holiday-cell');

      // Dot
      let dot = '';
      if (status === 'present') dot = '<span class="matrix-dot present">&#9679;</span>';
      else if (status === 'late') dot = '<span class="matrix-dot late">&#9679;</span>';
      else if (status === 'absent') dot = '<span class="matrix-dot absent">&#10005;</span>';

      // Billing bar at bottom of cell - only on scheduled days
      let barHtml = '';
      for (const bp of overlapping) {
        if (dateStr >= bp.start_date && dateStr <= bp.end_date) {
          const segClass = getBarSegment(year, month, d, bp, scheduleDays);
          if (!segClass) break; // not a scheduled day, skip bar

          const barClass = bp.payment_status === 'paid' ? 'bar-paid' : 'bar-unpaid';
          const bpBizDays = countBusinessDays(bp.start_date, bp.end_date);
          barHtml += `<div class="matrix-bar ${barClass} ${segClass}" data-billing-id="${bp.id}" title="${bp.payment_status === 'paid' ? 'Paid' : 'Unpaid'}: ${bp.start_date} ~ ${bp.end_date} (${bpBizDays} weekdays)"></div>`;
          break;
        }
      }

      bodyHtml += `<td class="${classes.join(' ')}">${dot}${barHtml}</td>`;
    }

    // Summary column
    bodyHtml += `<td class="matrix-summary-col"><strong>${attended}</strong></td>`;
    bodyHtml += `</tr>`;
  }

  matrixEl.innerHTML = `
    <table class="matrix-table">
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  `;

  // Click handlers for billing bars
  matrixEl.querySelectorAll('.matrix-bar').forEach(bar => {
    bar.addEventListener('click', (e) => {
      e.stopPropagation();
      const billingId = parseInt(bar.dataset.billingId);
      openBillingModal('edit', billingId);
    });
  });
}
