// ==================== BILLING MODAL & CRUD ====================

let editingBillingId = null;
let modalStartPicker = null;
let modalEndPicker = null;
let modalPaidDatePicker = null;

// Initialize modal elements
const billingModal = document.getElementById('billing-modal');
const modalTitle = document.getElementById('billing-modal-title');
const modalStudent = document.getElementById('modal-student');
const modalStartDate = document.getElementById('modal-start-date');
const modalEndDate = document.getElementById('modal-end-date');
const modalAmount = document.getElementById('modal-amount');
const modalCurrency = document.getElementById('modal-currency');
const modalNotes = document.getElementById('modal-notes');
const modalPaymentGroup = document.getElementById('modal-payment-group');
const modalStatusPaid = document.getElementById('modal-status-paid');
const modalStatusUnpaid = document.getElementById('modal-status-unpaid');
const modalPaidDate = document.getElementById('modal-paid-date');
const modalDeleteBtn = document.getElementById('billing-modal-delete');
const modalSaveBtn = document.getElementById('billing-modal-save');

// Initialize flatpickr
document.addEventListener('DOMContentLoaded', () => {
  modalStartPicker = flatpickr(modalStartDate, { dateFormat: 'Y-m-d' });
  modalEndPicker = flatpickr(modalEndDate, { dateFormat: 'Y-m-d' });
  modalPaidDatePicker = flatpickr(modalPaidDate, { dateFormat: 'Y-m-d' });
});

// Modal event listeners
document.getElementById('billing-modal-close').addEventListener('click', closeBillingModal);
document.getElementById('billing-modal-cancel').addEventListener('click', closeBillingModal);
billingModal.addEventListener('click', (e) => {
  if (e.target === billingModal) closeBillingModal();
});

// Add period button
document.getElementById('add-period-btn').addEventListener('click', () => {
  openBillingModal('add');
});

// Payment status toggle
modalStatusPaid.addEventListener('click', () => {
  modalStatusPaid.classList.add('active');
  modalStatusUnpaid.classList.remove('active');
  modalPaidDate.style.display = 'block';
  if (!modalPaidDate.value) {
    modalPaidDatePicker.setDate(getLocalDateString());
  }
});

modalStatusUnpaid.addEventListener('click', () => {
  modalStatusUnpaid.classList.add('active');
  modalStatusPaid.classList.remove('active');
  modalPaidDate.style.display = 'none';
});

// Save button
modalSaveBtn.addEventListener('click', saveBillingPeriod);

// Delete button
modalDeleteBtn.addEventListener('click', async () => {
  if (!editingBillingId) return;
  if (!confirm('Are you sure you want to delete this billing period?')) return;

  try {
    const res = await fetch(`${API_URL}/api/billing/${editingBillingId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      closeBillingModal();
      refreshCurrentView();
    }
  } catch (error) {
    console.error('Error deleting billing period:', error);
    alert('Failed to delete billing period');
  }
});

// ==================== MODAL OPEN/CLOSE ====================

async function openBillingModal(mode, billingId) {
  editingBillingId = null;

  if (mode === 'add') {
    modalTitle.textContent = 'Add Billing Period';
    modalDeleteBtn.style.display = 'none';
    modalPaymentGroup.style.display = 'none';
    modalStudent.disabled = !currentStudentId;

    // Pre-select current student if on calendar tab
    if (currentStudentId) {
      modalStudent.value = currentStudentId;
    }

    // Clear fields
    modalStartPicker.clear();
    modalEndPicker.clear();
    modalAmount.value = '';
    modalCurrency.value = '₱';
    modalNotes.value = '';
    modalStatusUnpaid.classList.add('active');
    modalStatusPaid.classList.remove('active');
    modalPaidDate.style.display = 'none';
    modalPaidDatePicker.clear();
  } else if (mode === 'edit') {
    modalTitle.textContent = 'Edit Billing Period';
    modalDeleteBtn.style.display = 'block';
    modalPaymentGroup.style.display = 'block';

    try {
      const res = await fetch(`${API_URL}/api/billing/${billingId}`);
      const data = await res.json();
      if (!data.success) return;

      const bp = data.period;
      editingBillingId = bp.id;

      modalStudent.value = bp.student_id;
      modalStudent.disabled = true;
      modalStartPicker.setDate(bp.start_date);
      modalEndPicker.setDate(bp.end_date);
      modalAmount.value = bp.tuition_amount || '';
      modalCurrency.value = bp.currency || '₱';
      modalNotes.value = bp.notes || '';

      if (bp.payment_status === 'paid') {
        modalStatusPaid.classList.add('active');
        modalStatusUnpaid.classList.remove('active');
        modalPaidDate.style.display = 'block';
        if (bp.paid_date) modalPaidDatePicker.setDate(bp.paid_date);
      } else {
        modalStatusUnpaid.classList.add('active');
        modalStatusPaid.classList.remove('active');
        modalPaidDate.style.display = 'none';
      }
    } catch (error) {
      console.error('Error loading billing period:', error);
      return;
    }
  }

  billingModal.classList.add('show');
}

function closeBillingModal() {
  billingModal.classList.remove('show');
  editingBillingId = null;
}

// ==================== SAVE ====================

async function saveBillingPeriod() {
  const studentId = modalStudent.value;
  const startDate = modalStartDate.value;
  const endDate = modalEndDate.value;
  const amount = modalAmount.value ? parseFloat(modalAmount.value) : null;
  const currency = modalCurrency.value;
  const notes = modalNotes.value.trim();

  if (!studentId || !startDate || !endDate) {
    alert('Please fill in student, start date, and end date.');
    return;
  }

  if (startDate > endDate) {
    alert('Start date must be before end date.');
    return;
  }

  try {
    if (editingBillingId) {
      // Update existing
      const paymentStatus = modalStatusPaid.classList.contains('active') ? 'paid' : 'unpaid';
      const paidDate = paymentStatus === 'paid' ? modalPaidDate.value : null;

      await fetch(`${API_URL}/api/billing/${editingBillingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, tuitionAmount: amount, currency, notes })
      });

      await fetch(`${API_URL}/api/billing/${editingBillingId}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: paymentStatus, paidDate })
      });
    } else {
      // Create new
      await fetch(`${API_URL}/api/billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, startDate, endDate, tuitionAmount: amount, currency, notes })
      });
    }

    closeBillingModal();
    refreshCurrentView();
  } catch (error) {
    console.error('Error saving billing period:', error);
    alert('Failed to save billing period');
  }
}

// ==================== PAYMENT TOGGLE ====================

async function togglePaymentStatus(billingId, newStatus) {
  try {
    let paidDate = null;
    if (newStatus === 'paid') {
      paidDate = getLocalDateString();
    }

    const res = await fetch(`${API_URL}/api/billing/${billingId}/payment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, paidDate })
    });

    const data = await res.json();
    if (data.success) {
      refreshCurrentView();
    }
  } catch (error) {
    console.error('Error toggling payment:', error);
  }
}

// ==================== DELETE FROM LIST ====================

async function deleteBillingPeriod(billingId) {
  if (!confirm('이 수업비 기간을 삭제하시겠습니까?')) return;

  try {
    const res = await fetch(`${API_URL}/api/billing/${billingId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      refreshCurrentView();
    }
  } catch (error) {
    console.error('Error deleting billing period:', error);
    alert('Failed to delete billing period');
  }
}

// ==================== REFRESH ====================

function refreshCurrentView() {
  // Refresh calendar
  if (isAllStudentsMode) {
    showAllStudentsView(currentYear, currentMonth);
  } else if (currentStudentId) {
    loadCalendarView(currentStudentId, currentYear, currentMonth);
  }
  // Refresh dashboard
  loadDashboard();
}
