// ==================== DASHBOARD ====================

// Track dismissed alerts per session
const dismissedAlerts = new Set();

async function loadDashboard() {
  try {
    const [billingRes] = await Promise.all([
      fetch(`${API_URL}/api/billing`)
    ]);

    const billingData = await billingRes.json();
    const allPeriods = billingData.success ? billingData.periods : [];

    updateSummaryCards(allPeriods);
    renderStudentBillingList(allPeriods);
    loadAlerts(allPeriods);
  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
}

// ==================== ALERTS ====================

async function loadAlerts(allPeriods) {
  const container = document.getElementById('alerts-container');
  const today = getLocalDateString();
  const alerts = [];

  // Group periods by student (latest period per student)
  const studentPeriods = {};
  allPeriods.forEach(p => {
    if (!studentPeriods[p.student_id]) {
      studentPeriods[p.student_id] = [];
    }
    studentPeriods[p.student_id].push(p);
  });

  // Check each local student
  for (const student of localStudents) {
    const periods = studentPeriods[student.id] || [];
    if (periods.length === 0) continue;

    // Sort by start_date DESC to find latest period
    periods.sort((a, b) => b.start_date.localeCompare(a.start_date));
    const latest = periods[0];

    // 1. EXPIRED: end_date has passed
    if (latest.end_date < today) {
      const daysPast = countCalendarDays(latest.end_date, today);

      // Check for absences in that period
      try {
        const summaryRes = await fetch(
          `${API_URL}/api/attendance/${student.id}/summary?startDate=${latest.start_date}&endDate=${latest.end_date}`
        );
        const summaryData = await summaryRes.json();
        const absences = summaryData.success ? summaryData.summary.absent_count : 0;

        const alertId = `expired-${latest.id}`;
        if (!dismissedAlerts.has(alertId)) {
          alerts.push({
            id: alertId,
            type: 'expired',
            student,
            period: latest,
            daysPast,
            absences
          });
        }
      } catch (e) {
        // Still show expired alert without absence info
        const alertId = `expired-${latest.id}`;
        if (!dismissedAlerts.has(alertId)) {
          alerts.push({ id: alertId, type: 'expired', student, period: latest, daysPast, absences: 0 });
        }
      }
    }
    // 2. ENDING SOON: end_date is within 3 days
    else if (latest.end_date >= today && latest.end_date <= addDaysToDate(today, 3)) {
      const daysLeft = countCalendarDays(today, latest.end_date);
      const alertId = `ending-${latest.id}`;
      if (!dismissedAlerts.has(alertId)) {
        alerts.push({ id: alertId, type: 'ending-soon', student, period: latest, daysLeft });
      }
    }
    // 3. ACTIVE period with absences
    else if (latest.start_date <= today && latest.end_date >= today) {
      try {
        const summaryRes = await fetch(
          `${API_URL}/api/attendance/${student.id}/summary?startDate=${latest.start_date}&endDate=${today}`
        );
        const summaryData = await summaryRes.json();
        const absences = summaryData.success ? summaryData.summary.absent_count : 0;

        if (absences > 0) {
          const alertId = `absences-${latest.id}`;
          if (!dismissedAlerts.has(alertId)) {
            alerts.push({ id: alertId, type: 'absences', student, period: latest, absences });
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  // Render alerts
  if (alerts.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Sort: expired first, then ending-soon, then absences
  const order = { expired: 0, 'ending-soon': 1, absences: 2 };
  alerts.sort((a, b) => order[a.type] - order[b.type]);

  container.innerHTML = `<div class="alerts-section">${alerts.map(renderAlert).join('')}</div>`;
}

function renderAlert(alert) {
  if (alert.type === 'expired') {
    const bizDays = countBusinessDays(alert.period.start_date, alert.period.end_date);
    const absenceText = alert.absences > 0
      ? `<br>This period had <strong>${alert.absences} absence(s)</strong>. You may want to extend the period or account for them in the next one.`
      : '';

    return `
      <div class="alert-card alert-expired" id="alert-${alert.id}">
        <span class="alert-icon">&#9888;</span>
        <div class="alert-body">
          <div class="alert-title">${escapeHtml(alert.student.name)} - Billing Period Expired</div>
          <div class="alert-detail">
            Period ${formatDateShort(alert.period.start_date)} - ${formatDateShort(alert.period.end_date)} (${bizDays} weekdays) ended ${alert.daysPast} day(s) ago.
            ${alert.period.payment_status === 'unpaid' ? '<strong>(Still unpaid!)</strong>' : ''}
            ${absenceText}
          </div>
          <div class="alert-actions">
            ${alert.absences > 0 ? `<button class="btn btn-sm btn-warning" onclick="extendPeriod(${alert.period.id}, ${alert.absences})">Extend +${alert.absences} weekday(s)</button>` : ''}
            <button class="btn btn-sm btn-primary" onclick="createNextPeriod('${alert.student.id}', '${alert.period.end_date}')">Create Next Period</button>
            <button class="btn btn-sm btn-secondary" onclick="viewStudentCalendar('${alert.student.id}')">View Calendar</button>
          </div>
        </div>
        <button class="alert-dismiss" onclick="dismissAlert('${alert.id}')" title="Dismiss">&times;</button>
      </div>
    `;
  }

  if (alert.type === 'ending-soon') {
    const bizDays = countBusinessDays(alert.period.start_date, alert.period.end_date);
    return `
      <div class="alert-card alert-ending-soon" id="alert-${alert.id}">
        <span class="alert-icon">&#128197;</span>
        <div class="alert-body">
          <div class="alert-title">${escapeHtml(alert.student.name)} - Period Ending Soon</div>
          <div class="alert-detail">
            Period ${formatDateShort(alert.period.start_date)} - ${formatDateShort(alert.period.end_date)} (${bizDays} weekdays) ends in ${alert.daysLeft} day(s).
            Prepare the next billing period.
          </div>
          <div class="alert-actions">
            <button class="btn btn-sm btn-primary" onclick="createNextPeriod('${alert.student.id}', '${alert.period.end_date}')">Create Next Period</button>
            <button class="btn btn-sm btn-secondary" onclick="viewStudentCalendar('${alert.student.id}')">View Calendar</button>
          </div>
        </div>
        <button class="alert-dismiss" onclick="dismissAlert('${alert.id}')" title="Dismiss">&times;</button>
      </div>
    `;
  }

  if (alert.type === 'absences') {
    const bizDays = countBusinessDays(alert.period.start_date, alert.period.end_date);
    return `
      <div class="alert-card alert-absences" id="alert-${alert.id}">
        <span class="alert-icon">&#9888;</span>
        <div class="alert-body">
          <div class="alert-title">${escapeHtml(alert.student.name)} - ${alert.absences} Absence(s) in Current Period</div>
          <div class="alert-detail">
            Active period ${formatDateShort(alert.period.start_date)} - ${formatDateShort(alert.period.end_date)} (${bizDays} weekdays) has ${alert.absences} absence(s) so far.
            Consider extending the period or noting for next billing.
          </div>
          <div class="alert-actions">
            <button class="btn btn-sm btn-warning" onclick="extendPeriod(${alert.period.id}, ${alert.absences})">Extend +${alert.absences} weekday(s)</button>
            <button class="btn btn-sm btn-secondary" onclick="viewStudentCalendar('${alert.student.id}')">View Calendar</button>
          </div>
        </div>
        <button class="alert-dismiss" onclick="dismissAlert('${alert.id}')" title="Dismiss">&times;</button>
      </div>
    `;
  }

  return '';
}

function dismissAlert(alertId) {
  dismissedAlerts.add(alertId);
  const el = document.getElementById(`alert-${alertId}`);
  if (el) el.remove();

  // Remove section if no alerts left
  const section = document.querySelector('.alerts-section');
  if (section && section.children.length === 0) {
    document.getElementById('alerts-container').innerHTML = '';
  }
}

async function extendPeriod(periodId, days) {
  try {
    const res = await fetch(`${API_URL}/api/billing/${periodId}`);
    const data = await res.json();
    if (!data.success) return;

    const bp = data.period;
    const newEndDate = addBusinessDays(bp.end_date, days);

    await fetch(`${API_URL}/api/billing/${periodId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: bp.start_date,
        endDate: newEndDate,
        tuitionAmount: bp.tuition_amount,
        currency: bp.currency,
        notes: bp.notes ? `${bp.notes} (extended +${days} weekday(s) for absences)` : `Extended +${days} weekday(s) for absences`
      })
    });

    refreshCurrentView();
  } catch (error) {
    console.error('Error extending period:', error);
    alert('Failed to extend period');
  }
}

function createNextPeriod(studentId, previousEndDate) {
  const nextStart = addDaysToDate(previousEndDate, 1);
  currentStudentId = studentId;
  document.getElementById('modal-student').value = studentId;
  openBillingModal('add');

  // Pre-fill start date after modal opens
  setTimeout(() => {
    if (modalStartPicker) modalStartPicker.setDate(nextStart);
  }, 100);
}

// ==================== DATE HELPERS ====================

function countCalendarDays(fromDate, toDate) {
  const [y1, m1, d1] = fromDate.split('-').map(Number);
  const [y2, m2, d2] = toDate.split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function countBusinessDays(fromDate, toDate) {
  const [y1, m1, d1] = fromDate.split('-').map(Number);
  const [y2, m2, d2] = toDate.split('-').map(Number);
  let count = 0;
  const current = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  while (current <= end) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function addDaysToDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addBusinessDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function updateSummaryCards(periods) {
  // Total local students
  document.getElementById('total-local').textContent = localStudents.length;

  // Unpaid periods
  const unpaidPeriods = periods.filter(p => p.payment_status === 'unpaid');
  document.getElementById('total-unpaid').textContent = unpaidPeriods.length;

  // Total unpaid amount
  const totalUnpaid = unpaidPeriods.reduce((sum, p) => sum + (p.tuition_amount || 0), 0);
  if (totalUnpaid > 0) {
    document.getElementById('total-unpaid-amount').textContent = `₱${totalUnpaid.toLocaleString()}`;
  } else {
    document.getElementById('total-unpaid-amount').textContent = '-';
  }

  // Paid this month
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const paidThisMonth = periods.filter(p =>
    p.payment_status === 'paid' && p.paid_date && p.paid_date.startsWith(thisMonth)
  );
  document.getElementById('total-paid-month').textContent = paidThisMonth.length;
}

function renderStudentBillingList(allPeriods) {
  const list = document.getElementById('student-billing-list');
  const filterStatus = document.getElementById('filter-status').value;
  const filterType = document.getElementById('filter-type').value;

  // Determine which students to show
  let students = filterType === 'local' ? localStudents : allStudents;

  // Build a map: studentId -> latest billing period
  const latestPeriodMap = {};
  const periodCountMap = {};
  allPeriods.forEach(p => {
    if (!latestPeriodMap[p.student_id] || p.start_date > latestPeriodMap[p.student_id].start_date) {
      latestPeriodMap[p.student_id] = p;
    }
    periodCountMap[p.student_id] = (periodCountMap[p.student_id] || 0) + 1;
  });

  // Filter by payment status
  if (filterStatus === 'unpaid') {
    students = students.filter(s => {
      const lp = latestPeriodMap[s.id];
      return lp && lp.payment_status === 'unpaid';
    });
  } else if (filterStatus === 'paid') {
    students = students.filter(s => {
      const lp = latestPeriodMap[s.id];
      return lp && lp.payment_status === 'paid';
    });
  }

  if (students.length === 0) {
    list.innerHTML = '<div class="empty-state">No students match the current filter.</div>';
    return;
  }

  list.innerHTML = students.map(s => {
    const latest = latestPeriodMap[s.id];
    const count = periodCountMap[s.id] || 0;
    const isLocal = s.student_type === 'Local';

    let statusBadge = '<span class="status-badge status-no-period">No Period</span>';
    let periodInfo = '-';
    let amountInfo = '-';

    if (latest) {
      const bizDays = countBusinessDays(latest.start_date, latest.end_date);
      const paidDateText = latest.payment_status === 'paid' && latest.paid_date
        ? `<span class="paid-date-label">${formatDateShort(latest.paid_date)} paid</span>` : '';
      statusBadge = `<div class="status-with-date">
        <span class="status-badge ${latest.payment_status === 'paid' ? 'status-paid' : 'status-unpaid'}">
          ${latest.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
        </span>
        ${paidDateText}
      </div>`;
      periodInfo = `${formatDateShort(latest.start_date)} - ${formatDateShort(latest.end_date)} <span class="bizdays-label">(${bizDays}d)</span>`;
      amountInfo = formatCurrency(latest.tuition_amount, latest.currency);
    }

    return `
      <div class="student-billing-row">
        <div class="student-info">
          <div>
            <span class="student-name">${escapeHtml(s.name)}</span>
            <span class="type-badge ${isLocal ? 'type-local' : 'type-camper'}">${s.student_type}</span>
          </div>
          <span class="student-meta">${getScheduleText(s)} ${count > 0 ? `| ${count} period(s)` : ''}</span>
        </div>
        <span class="student-meta">${periodInfo}</span>
        <span>${amountInfo}</span>
        ${statusBadge}
        <div class="billing-period-actions">
          <button class="btn btn-sm btn-primary" onclick="viewStudentCalendar('${s.id}')">Calendar</button>
          ${isLocal ? `<button class="btn btn-sm btn-secondary" onclick="addPeriodForStudent('${s.id}')">+ Period</button>` : ''}
          <button class="btn btn-sm btn-outline-danger" onclick="hideStudentFromList('${s.id}', '${escapeHtml(s.name)}')" title="Hide student">&#10005;</button>
        </div>
      </div>
    `;
  }).join('');
}

// Navigate to calendar for a specific student
function viewStudentCalendar(studentId) {
  isAllStudentsMode = false;
  currentStudentId = studentId;
  document.getElementById('calendar-student').value = studentId;
  hideAllStudentsView();
  switchTab('calendar');
  loadCalendarView(studentId, currentYear, currentMonth);
}

// Open add billing modal for a specific student
function addPeriodForStudent(studentId) {
  currentStudentId = studentId;
  document.getElementById('modal-student').value = studentId;
  openBillingModal('add');
}

// Filter change listeners
document.getElementById('filter-status').addEventListener('change', loadDashboard);
document.getElementById('filter-type').addEventListener('change', loadDashboard);

// ==================== SETTINGS ====================

async function loadSettings() {
  loadScheduleEditor();
  loadHolidays();
  loadHiddenStudents();
}

async function loadScheduleEditor() {
  const editor = document.getElementById('schedule-editor');
  const students = allStudents.filter(s => s.student_type === 'Local');

  if (students.length === 0) {
    editor.innerHTML = '<div class="empty-state">No local students found. Sync from Notion first.</div>';
    return;
  }

  editor.innerHTML = students.map(s => {
    const count = [s.schedule_mon, s.schedule_tue, s.schedule_wed, s.schedule_thu, s.schedule_fri]
      .filter(Boolean).length;

    return `
      <div class="schedule-row" data-student-id="${s.id}">
        <span class="student-name">${escapeHtml(s.name)}</span>
        <span class="schedule-count">${count}x/wk</span>
        <div style="text-align:center">
          <label>M</label>
          <input type="checkbox" data-day="mon" ${s.schedule_mon ? 'checked' : ''}>
        </div>
        <div style="text-align:center">
          <label>T</label>
          <input type="checkbox" data-day="tue" ${s.schedule_tue ? 'checked' : ''}>
        </div>
        <div style="text-align:center">
          <label>W</label>
          <input type="checkbox" data-day="wed" ${s.schedule_wed ? 'checked' : ''}>
        </div>
        <div style="text-align:center">
          <label>T</label>
          <input type="checkbox" data-day="thu" ${s.schedule_thu ? 'checked' : ''}>
        </div>
        <div style="text-align:center">
          <label>F</label>
          <input type="checkbox" data-day="fri" ${s.schedule_fri ? 'checked' : ''}>
        </div>
        <button class="btn btn-sm btn-primary" onclick="saveSchedule('${s.id}', this)">Save</button>
      </div>
    `;
  }).join('');
}

async function saveSchedule(studentId, btn) {
  const row = btn.closest('.schedule-row');
  const mon = row.querySelector('[data-day="mon"]').checked;
  const tue = row.querySelector('[data-day="tue"]').checked;
  const wed = row.querySelector('[data-day="wed"]').checked;
  const thu = row.querySelector('[data-day="thu"]').checked;
  const fri = row.querySelector('[data-day="fri"]').checked;

  try {
    const res = await fetch(`${API_URL}/api/students/${studentId}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mon, tue, wed, thu, fri })
    });

    const data = await res.json();
    if (data.success) {
      // Update local state
      const student = allStudents.find(s => s.id === studentId);
      if (student) {
        student.schedule_mon = mon ? 1 : 0;
        student.schedule_tue = tue ? 1 : 0;
        student.schedule_wed = wed ? 1 : 0;
        student.schedule_thu = thu ? 1 : 0;
        student.schedule_fri = fri ? 1 : 0;
      }

      // Update count display
      const count = [mon, tue, wed, thu, fri].filter(Boolean).length;
      row.querySelector('.schedule-count').textContent = `${count}x/wk`;

      btn.textContent = 'Saved!';
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-success');
      setTimeout(() => {
        btn.textContent = 'Save';
        btn.classList.remove('btn-success');
        btn.classList.add('btn-primary');
      }, 1500);
    }
  } catch (error) {
    console.error('Error saving schedule:', error);
    alert('Failed to save schedule');
  }
}

// ==================== HOLIDAYS ====================

async function loadHolidays() {
  try {
    const res = await fetch(`${API_URL}/api/holidays`);
    const data = await res.json();

    if (data.success) {
      renderHolidaysList(data.holidays);
    }
  } catch (error) {
    console.error('Error loading holidays:', error);
  }
}

function renderHolidaysList(holidays) {
  const list = document.getElementById('holidays-list');

  if (holidays.length === 0) {
    list.innerHTML = '<div class="empty-state">No holidays set.</div>';
    return;
  }

  list.innerHTML = holidays.map(h => `
    <div class="holiday-row">
      <span><strong>${formatDate(h.date)}</strong> ${h.description ? `- ${escapeHtml(h.description)}` : ''}</span>
      <button class="btn btn-sm btn-danger" onclick="removeHoliday('${h.date}')">Remove</button>
    </div>
  `).join('');
}

document.getElementById('add-holiday-btn').addEventListener('click', async () => {
  const dateInput = document.getElementById('holiday-date');
  const descInput = document.getElementById('holiday-desc');
  const date = dateInput.value;
  const description = descInput.value.trim();

  if (!date) {
    alert('Please select a date');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/holidays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, description })
    });

    const data = await res.json();
    if (data.success) {
      dateInput.value = '';
      descInput.value = '';
      loadHolidays();
    }
  } catch (error) {
    console.error('Error adding holiday:', error);
  }
});

async function removeHoliday(date) {
  if (!confirm(`Remove holiday on ${date}?`)) return;

  try {
    await fetch(`${API_URL}/api/holidays/${date}`, { method: 'DELETE' });
    loadHolidays();
  } catch (error) {
    console.error('Error removing holiday:', error);
  }
}

// ==================== HIDDEN STUDENTS ====================

async function hideStudentFromList(studentId, studentName) {
  if (!confirm(`"${studentName}" 학생을 목록에서 숨기시겠습니까?\n(Settings에서 복원할 수 있습니다)`)) return;

  try {
    const res = await fetch(`${API_URL}/api/students/${studentId}/hide`, { method: 'PATCH' });
    const data = await res.json();
    if (data.success) {
      // Reload students and refresh views
      await loadStudents();
      loadDashboard();
    }
  } catch (error) {
    console.error('Error hiding student:', error);
    alert('Failed to hide student');
  }
}

async function unhideStudent(studentId) {
  try {
    const res = await fetch(`${API_URL}/api/students/${studentId}/unhide`, { method: 'PATCH' });
    const data = await res.json();
    if (data.success) {
      await loadStudents();
      loadDashboard();
      loadHiddenStudents();
    }
  } catch (error) {
    console.error('Error restoring student:', error);
    alert('Failed to restore student');
  }
}

async function loadHiddenStudents() {
  const list = document.getElementById('hidden-students-list');

  try {
    const res = await fetch(`${API_URL}/api/students/hidden`);
    const data = await res.json();

    if (!data.success || data.students.length === 0) {
      list.innerHTML = '<div class="empty-state">No hidden students.</div>';
      return;
    }

    list.innerHTML = data.students.map(s => `
      <div class="hidden-student-row">
        <div>
          <span class="student-name">${escapeHtml(s.name)}</span>
          <span class="type-badge ${s.student_type === 'Local' ? 'type-local' : 'type-camper'}">${s.student_type}</span>
        </div>
        <button class="btn btn-sm btn-primary" onclick="unhideStudent('${s.id}')">Restore</button>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading hidden students:', error);
    list.innerHTML = '<div class="empty-state">Failed to load hidden students.</div>';
  }
}

// Sync from Notion button
document.getElementById('sync-notion-btn').addEventListener('click', async () => {
  const btn = document.getElementById('sync-notion-btn');
  btn.textContent = 'Syncing...';
  btn.disabled = true;

  try {
    await loadStudents();
    loadScheduleEditor();
    btn.textContent = 'Synced!';
    setTimeout(() => {
      btn.textContent = 'Sync from Notion';
      btn.disabled = false;
    }, 2000);
  } catch (error) {
    btn.textContent = 'Sync Failed';
    setTimeout(() => {
      btn.textContent = 'Sync from Notion';
      btn.disabled = false;
    }, 2000);
  }
});
