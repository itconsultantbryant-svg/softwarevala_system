import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { useAuth } from '../../hooks/useAuth';

const FinanceReportForm = ({ report, onClose }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [department, setDepartment] = useState(null);
  const [activeSection, setActiveSection] = useState(1);
  
  // Form state for all 11 sections
  const [formData, setFormData] = useState({
    // Section 1: Reporting Period
    reportingPeriod: {
      month: new Date().toLocaleString('default', { month: 'long' }),
      year: new Date().getFullYear(),
      dateSubmitted: new Date().toISOString().split('T')[0],
      submittedBy: '',
      position: ''
    },
    
    // Section 2: Revenue Summary
    revenue: {
      prinstineConsult: '',
      prinstineAcademy: '',
      microfinanceInterest: '',
      otherRevenue: '',
      otherRevenueComments: ''
    },
    
    // Section 3: Expense Summary
    expenses: {
      operational: '',
      administrative: '',
      salariesWages: '',
      utilities: '',
      marketingAdvertising: '',
      expenseComments: ''
    },
    
    // Section 4: Cash Flow Update
    cashFlow: {
      openingBalance: '',
      cashMovements: []
    },
    
    // Section 5: Accounts Receivable
    accountsReceivable: {
      newCreditSales: '',
      collectionsMade: '',
      topClients: [],
      arComments: ''
    },
    
    // Section 6: Accounts Payable
    accountsPayable: {
      newPayables: '',
      paymentsMade: '',
      topSuppliers: [],
      apComments: ''
    },
    
    // Section 7: Payroll Summary
    payroll: {
      totalGrossPayroll: '',
      totalDeductions: '',
      netPayrollPaid: '',
      employeeCount: {
        fullTime: '',
        partTime: '',
        interns: ''
      },
      payrollNotes: ''
    },
    
    // Section 8: Compliance & Tax Updates
    compliance: {
      gstVatFiled: '',
      citStatus: '',
      payrollTaxesPaid: false,
      pendingIssues: '',
      complianceFiles: []
    },
    
    // Section 9: Variance & Financial Risk Alerts
    variance: {
      risksIdentified: '',
      mitigationActions: ''
    },
    
    // Section 10: Attachments
    attachments: {
      bankStatements: [],
      payrollReport: null,
      invoicesReceipts: []
    },
    
    // Section 11: Approval Workflow
    approval: {
      preparedBy: '',
      preparedSignature: '',
      reviewedBy: '',
      reviewedSignature: '',
      approvedBy: '',
      approvedSignature: ''
    }
  });

  useEffect(() => {
    fetchDepartment();
    if (report) {
      loadReportData();
    } else {
      // Set default values
      setFormData(prev => ({
        ...prev,
        reportingPeriod: {
          ...prev.reportingPeriod,
          month: prev.reportingPeriod?.month || new Date().toLocaleString('default', { month: 'long' }),
          year: prev.reportingPeriod?.year || new Date().getFullYear(),
          dateSubmitted: prev.reportingPeriod?.dateSubmitted || new Date().toISOString().split('T')[0],
          submittedBy: user?.name || prev.reportingPeriod?.submittedBy || '',
          position: user?.position || prev.reportingPeriod?.position || ''
        }
      }));
    }
  }, [report, user]);

  const fetchDepartment = async () => {
    try {
      const response = await api.get('/departments');
      const userEmailLower = user.email.toLowerCase().trim();
      const dept = response.data.departments.find(d => 
        d.manager_id === user.id || 
        (d.head_email && d.head_email.toLowerCase().trim() === userEmailLower)
      );
      setDepartment(dept);
    } catch (error) {
      console.error('Error fetching department:', error);
    }
  };

  const loadReportData = () => {
    // Parse report content if editing
    // This would need to parse the formatted content back into formData
    // For now, we'll just set basic info
    if (report.title) {
      const titleMatch = report.title.match(/(\w+)\s+(\d{4})/);
      if (titleMatch) {
        const parsedYear = parseInt(titleMatch[2], 10);
        setFormData(prev => ({
          ...prev,
          reportingPeriod: {
            ...prev.reportingPeriod,
            month: titleMatch[1] || prev.reportingPeriod.month,
            year: isNaN(parsedYear) ? prev.reportingPeriod.year : parsedYear
          }
        }));
      }
    }
  };

  const handleChange = (section, field, value) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleNestedChange = (section, field, subField, value) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: {
          ...prev[section][field],
          [subField]: value
        }
      }
    }));
  };

  const addCashMovement = () => {
    setFormData(prev => ({
      ...prev,
      cashFlow: {
        ...prev.cashFlow,
        cashMovements: [
          ...prev.cashFlow.cashMovements,
          { description: '', amount: '', reason: '' }
        ]
      }
    }));
  };

  const removeCashMovement = (index) => {
    setFormData(prev => ({
      ...prev,
      cashFlow: {
        ...prev.cashFlow,
        cashMovements: prev.cashFlow.cashMovements.filter((_, i) => i !== index)
      }
    }));
  };

  const updateCashMovement = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      cashFlow: {
        ...prev.cashFlow,
        cashMovements: prev.cashFlow.cashMovements.map((movement, i) =>
          i === index ? { ...movement, [field]: value } : movement
        )
      }
    }));
  };

  const addTopClient = () => {
    setFormData(prev => ({
      ...prev,
      accountsReceivable: {
        ...prev.accountsReceivable,
        topClients: [
          ...prev.accountsReceivable.topClients,
          { clientName: '', amount: '', daysOverdue: '' }
        ]
      }
    }));
  };

  const removeTopClient = (index) => {
    setFormData(prev => ({
      ...prev,
      accountsReceivable: {
        ...prev.accountsReceivable,
        topClients: prev.accountsReceivable.topClients.filter((_, i) => i !== index)
      }
    }));
  };

  const updateTopClient = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      accountsReceivable: {
        ...prev.accountsReceivable,
        topClients: prev.accountsReceivable.topClients.map((client, i) =>
          i === index ? { ...client, [field]: value } : client
        )
      }
    }));
  };

  const addTopSupplier = () => {
    setFormData(prev => ({
      ...prev,
      accountsPayable: {
        ...prev.accountsPayable,
        topSuppliers: [
          ...prev.accountsPayable.topSuppliers,
          { supplier: '', amount: '', dueDate: '' }
        ]
      }
    }));
  };

  const removeTopSupplier = (index) => {
    setFormData(prev => ({
      ...prev,
      accountsPayable: {
        ...prev.accountsPayable,
        topSuppliers: prev.accountsPayable.topSuppliers.filter((_, i) => i !== index)
      }
    }));
  };

  const updateTopSupplier = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      accountsPayable: {
        ...prev.accountsPayable,
        topSuppliers: prev.accountsPayable.topSuppliers.map((supplier, i) =>
          i === index ? { ...supplier, [field]: value } : supplier
        )
      }
    }));
  };

  const handleFileUpload = async (file, section, field) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (field === 'bankStatements' || field === 'invoicesReceipts') {
        setFormData(prev => ({
          ...prev,
          attachments: {
            ...prev.attachments,
            [field]: [...prev.attachments[field], response.data.url]
          }
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          attachments: {
            ...prev.attachments,
            [field]: response.data.url
          }
        }));
      }
    } catch (error) {
      console.error('File upload error:', error);
      alert('Failed to upload file');
    }
  };

  const calculateTotalRevenue = () => {
    const consult = parseFloat(formData.revenue.prinstineConsult) || 0;
    const academy = parseFloat(formData.revenue.prinstineAcademy) || 0;
    const microfinance = parseFloat(formData.revenue.microfinanceInterest) || 0;
    const other = parseFloat(formData.revenue.otherRevenue) || 0;
    return consult + academy + microfinance + other;
  };

  const calculateTotalExpenses = () => {
    const operational = parseFloat(formData.expenses.operational) || 0;
    const administrative = parseFloat(formData.expenses.administrative) || 0;
    const salaries = parseFloat(formData.expenses.salariesWages) || 0;
    const utilities = parseFloat(formData.expenses.utilities) || 0;
    const marketing = parseFloat(formData.expenses.marketingAdvertising) || 0;
    return operational + administrative + salaries + utilities + marketing;
  };

  const calculateCashFlow = () => {
    const opening = parseFloat(formData.cashFlow.openingBalance) || 0;
    const totalRevenue = calculateTotalRevenue();
    const totalExpenses = calculateTotalExpenses();
    const cashInflows = totalRevenue;
    const cashOutflows = totalExpenses;
    const closing = opening + cashInflows - cashOutflows;
    
    return {
      opening,
      cashInflows,
      cashOutflows,
      closing
    };
  };

  const formatReportContent = () => {
    const cashFlow = calculateCashFlow();
    const totalRevenue = calculateTotalRevenue();
    const totalExpenses = calculateTotalExpenses();
    
    let content = `FINANCE DEPARTMENT REPORT\n`;
    content += `========================================\n\n`;
    
    content += `1. REPORTING PERIOD\n`;
    content += `----------------------------------------\n`;
    content += `Month: ${formData.reportingPeriod.month}\n`;
    content += `Year: ${formData.reportingPeriod.year}\n`;
    content += `Date Submitted: ${formData.reportingPeriod.dateSubmitted}\n`;
    content += `Submitted By: ${formData.reportingPeriod.submittedBy} (${formData.reportingPeriod.position})\n\n`;
    
    content += `2. REVENUE SUMMARY\n`;
    content += `----------------------------------------\n`;
    content += `Software Vala Consult: $${parseFloat(formData.revenue.prinstineConsult || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Software Vala Academy: $${parseFloat(formData.revenue.prinstineAcademy || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Microfinance & Lending Interest Income: $${parseFloat(formData.revenue.microfinanceInterest || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Other Revenue: $${parseFloat(formData.revenue.otherRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    if (formData.revenue.otherRevenueComments) {
      content += `Other Revenue Comments: ${formData.revenue.otherRevenueComments}\n`;
    }
    content += `TOTAL REVENUE: $${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
    
    content += `3. EXPENSE SUMMARY\n`;
    content += `----------------------------------------\n`;
    content += `Operational Expenses: $${parseFloat(formData.expenses.operational || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Administrative Expenses: $${parseFloat(formData.expenses.administrative || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Salaries & Wages: $${parseFloat(formData.expenses.salariesWages || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Utilities: $${parseFloat(formData.expenses.utilities || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Marketing & Advertising: $${parseFloat(formData.expenses.marketingAdvertising || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    if (formData.expenses.expenseComments) {
      content += `Comments: ${formData.expenses.expenseComments}\n`;
    }
    content += `TOTAL EXPENSES: $${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
    
    content += `4. CASH FLOW UPDATE\n`;
    content += `----------------------------------------\n`;
    content += `Opening Cash Balance: $${cashFlow.opening.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Cash Inflows (Total): $${cashFlow.cashInflows.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Cash Outflows (Total): $${cashFlow.cashOutflows.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Closing Cash Balance: $${cashFlow.closing.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    if (formData.cashFlow.cashMovements.length > 0) {
      content += `\nMajor Cash Movements:\n`;
      formData.cashFlow.cashMovements.forEach((movement, idx) => {
        content += `  ${idx + 1}. ${movement.description}: $${parseFloat(movement.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - ${movement.reason}\n`;
      });
    }
    content += `\n`;
    
    content += `5. ACCOUNTS RECEIVABLE (A/R)\n`;
    content += `----------------------------------------\n`;
    content += `New Credit Sales This Month: $${parseFloat(formData.accountsReceivable.newCreditSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Collections Made: $${parseFloat(formData.accountsReceivable.collectionsMade || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    if (formData.accountsReceivable.topClients.length > 0) {
      content += `\nTop 3 Outstanding Clients:\n`;
      formData.accountsReceivable.topClients.forEach((client, idx) => {
        content += `  ${idx + 1}. ${client.clientName}: $${parseFloat(client.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${client.daysOverdue} days overdue)\n`;
      });
    }
    if (formData.accountsReceivable.arComments) {
      content += `\nComments: ${formData.accountsReceivable.arComments}\n`;
    }
    content += `\n`;
    
    content += `6. ACCOUNTS PAYABLE (A/P)\n`;
    content += `----------------------------------------\n`;
    content += `New Payables Incurred: $${parseFloat(formData.accountsPayable.newPayables || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Payments Made: $${parseFloat(formData.accountsPayable.paymentsMade || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    if (formData.accountsPayable.topSuppliers.length > 0) {
      content += `\nTop 3 Outstanding Suppliers:\n`;
      formData.accountsPayable.topSuppliers.forEach((supplier, idx) => {
        content += `  ${idx + 1}. ${supplier.supplier}: $${parseFloat(supplier.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Due: ${supplier.dueDate})\n`;
      });
    }
    if (formData.accountsPayable.apComments) {
      content += `\nComments: ${formData.accountsPayable.apComments}\n`;
    }
    content += `\n`;
    
    content += `7. PAYROLL SUMMARY\n`;
    content += `----------------------------------------\n`;
    content += `Total Gross Payroll: $${parseFloat(formData.payroll.totalGrossPayroll || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Total Deductions: $${parseFloat(formData.payroll.totalDeductions || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Net Payroll Paid: $${parseFloat(formData.payroll.netPayrollPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    content += `Employee Count:\n`;
    content += `  Full-time: ${formData.payroll.employeeCount.fullTime || 0}\n`;
    content += `  Part-time: ${formData.payroll.employeeCount.partTime || 0}\n`;
    content += `  Interns: ${formData.payroll.employeeCount.interns || 0}\n`;
    if (formData.payroll.payrollNotes) {
      content += `Notes: ${formData.payroll.payrollNotes}\n`;
    }
    content += `\n`;
    
    content += `8. COMPLIANCE & TAX UPDATES\n`;
    content += `----------------------------------------\n`;
    content += `GST/VAT Filed: ${formData.compliance.gstVatFiled || 'N/A'}\n`;
    content += `Corporate Income Tax (CIT) Status: ${formData.compliance.citStatus || 'N/A'}\n`;
    content += `Payroll Taxes Paid: ${formData.compliance.payrollTaxesPaid ? 'Yes' : 'No'}\n`;
    if (formData.compliance.pendingIssues) {
      content += `Pending Compliance Issues: ${formData.compliance.pendingIssues}\n`;
    }
    content += `\n`;
    
    content += `9. VARIANCE & FINANCIAL RISK ALERTS\n`;
    content += `----------------------------------------\n`;
    if (formData.variance.risksIdentified) {
      content += `Risks Identified: ${formData.variance.risksIdentified}\n`;
    }
    if (formData.variance.mitigationActions) {
      content += `Mitigation Actions: ${formData.variance.mitigationActions}\n`;
    }
    content += `\n`;
    
    content += `10. ATTACHMENTS\n`;
    content += `----------------------------------------\n`;
    if (formData.attachments.bankStatements.length > 0) {
      content += `Bank Statements: ${formData.attachments.bankStatements.length} file(s)\n`;
    }
    if (formData.attachments.payrollReport) {
      content += `Payroll Report: Attached\n`;
    }
    if (formData.attachments.invoicesReceipts.length > 0) {
      content += `Invoices/Receipts: ${formData.attachments.invoicesReceipts.length} file(s)\n`;
    }
    content += `\n`;
    
    content += `11. APPROVAL WORKFLOW\n`;
    content += `----------------------------------------\n`;
    content += `Prepared By: ${formData.approval.preparedBy || formData.reportingPeriod.submittedBy}\n`;
    if (formData.approval.preparedSignature) {
      content += `Prepared Signature: ${formData.approval.preparedSignature}\n`;
    }
    if (formData.approval.reviewedBy) {
      content += `Reviewed By: ${formData.approval.reviewedBy}\n`;
      if (formData.approval.reviewedSignature) {
        content += `Reviewed Signature: ${formData.approval.reviewedSignature}\n`;
      }
    }
    if (formData.approval.approvedBy) {
      content += `Approved By: ${formData.approval.approvedBy}\n`;
      if (formData.approval.approvedSignature) {
        content += `Approved Signature: ${formData.approval.approvedSignature}\n`;
      }
    }
    
    return content;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const reportContent = formatReportContent();
      const reportTitle = report?.title || `Finance Department Report - ${formData.reportingPeriod.month} ${formData.reportingPeriod.year}`;

      if (report && report.id) {
        await api.put(`/department-reports/${report.id}`, {
          title: reportTitle,
          content: reportContent
        });
      } else {
        await api.post('/department-reports', {
          title: reportTitle,
          content: reportContent
        });
      }

      onClose();
    } catch (err) {
      console.error('Error submitting report:', err);
      setError(err.response?.data?.error || 'Failed to submit report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const sections = [
    { id: 1, name: 'Reporting Period', icon: 'bi-calendar' },
    { id: 2, name: 'Revenue Summary', icon: 'bi-cash-stack' },
    { id: 3, name: 'Expense Summary', icon: 'bi-receipt' },
    { id: 4, name: 'Cash Flow', icon: 'bi-arrow-left-right' },
    { id: 5, name: 'Accounts Receivable', icon: 'bi-arrow-down-circle' },
    { id: 6, name: 'Accounts Payable', icon: 'bi-arrow-up-circle' },
    { id: 7, name: 'Payroll Summary', icon: 'bi-people' },
    { id: 8, name: 'Compliance & Tax', icon: 'bi-shield-check' },
    { id: 9, name: 'Variance & Risks', icon: 'bi-exclamation-triangle' },
    { id: 10, name: 'Attachments', icon: 'bi-paperclip' },
    { id: 11, name: 'Approval', icon: 'bi-check-circle' }
  ];

  const renderSection = () => {
    switch (activeSection) {
      case 1:
        return (
          <div className="section-content">
            <h5 className="section-title">1. Reporting Period</h5>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Month *</label>
                <select
                  className="form-select"
                  value={formData.reportingPeriod.month}
                  onChange={(e) => handleChange('reportingPeriod', 'month', e.target.value)}
                  required
                >
                  <option value="">Select Month</option>
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(month => (
                    <option key={month} value={month}>{month}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Year *</label>
                <input
                  type="number"
                  className="form-control"
                  value={formData.reportingPeriod?.year ?? new Date().getFullYear()}
                  onChange={(e) => {
                    const val = e.target.value;
                    const yearValue = val === '' ? new Date().getFullYear() : (parseInt(val, 10) || new Date().getFullYear());
                    handleChange('reportingPeriod', 'year', yearValue);
                  }}
                  min="2020"
                  max="2100"
                  required
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Date Submitted *</label>
                <input
                  type="date"
                  className="form-control"
                  value={formData.reportingPeriod.dateSubmitted}
                  onChange={(e) => handleChange('reportingPeriod', 'dateSubmitted', e.target.value)}
                  required
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Submitted By (Name) *</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.reportingPeriod.submittedBy}
                  onChange={(e) => handleChange('reportingPeriod', 'submittedBy', e.target.value)}
                  required
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Position *</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.reportingPeriod.position}
                  onChange={(e) => handleChange('reportingPeriod', 'position', e.target.value)}
                  placeholder="e.g., Finance Manager"
                  required
                />
              </div>
            </div>
          </div>
        );

      case 2:
        const totalRevenue = calculateTotalRevenue();
        return (
          <div className="section-content">
            <h5 className="section-title">2. Revenue Summary</h5>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Software Vala Consult *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.revenue?.prinstineConsult ?? ''}
                    onChange={(e) => handleChange('revenue', 'prinstineConsult', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Software Vala Academy *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.revenue?.prinstineAcademy ?? ''}
                    onChange={(e) => handleChange('revenue', 'prinstineAcademy', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Microfinance & Lending Interest Income *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.revenue?.microfinanceInterest ?? ''}
                    onChange={(e) => handleChange('revenue', 'microfinanceInterest', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Other Revenue</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.revenue.otherRevenue}
                    onChange={(e) => handleChange('revenue', 'otherRevenue', e.target.value)}
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>
              <div className="col-12 mb-3">
                <label className="form-label">Other Revenue Comments/Notes</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={formData.revenue.otherRevenueComments}
                  onChange={(e) => handleChange('revenue', 'otherRevenueComments', e.target.value)}
                  placeholder="Additional notes about other revenue..."
                />
              </div>
              <div className="col-12">
                <div className="alert alert-info">
                  <strong>Total Revenue: ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        const totalExpenses = calculateTotalExpenses();
        return (
          <div className="section-content">
            <h5 className="section-title">3. Expense Summary</h5>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Operational Expenses *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.expenses.operational}
                    onChange={(e) => handleChange('expenses', 'operational', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Administrative Expenses *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.expenses.administrative}
                    onChange={(e) => handleChange('expenses', 'administrative', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Salaries & Wages *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.expenses.salariesWages}
                    onChange={(e) => handleChange('expenses', 'salariesWages', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Utilities *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.expenses.utilities}
                    onChange={(e) => handleChange('expenses', 'utilities', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Marketing & Advertising</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.expenses.marketingAdvertising}
                    onChange={(e) => handleChange('expenses', 'marketingAdvertising', e.target.value)}
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>
              <div className="col-12 mb-3">
                <label className="form-label">Comments/Notes</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={formData.expenses.expenseComments}
                  onChange={(e) => handleChange('expenses', 'expenseComments', e.target.value)}
                  placeholder="Additional notes about expenses..."
                />
              </div>
              <div className="col-12">
                <div className="alert alert-info">
                  <strong>Total Expenses: ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        const cashFlow = calculateCashFlow();
        return (
          <div className="section-content">
            <h5 className="section-title">4. Cash Flow Update</h5>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Opening Cash Balance *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.cashFlow.openingBalance}
                    onChange={(e) => handleChange('cashFlow', 'openingBalance', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
                <small className="text-muted">Auto-calculated from previous month closing balance</small>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Cash Inflows (Total)</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="text"
                    className="form-control"
                    value={cashFlow.cashInflows.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    readOnly
                    style={{ backgroundColor: '#f8f9fa' }}
                  />
                </div>
                <small className="text-muted">Auto-calculated from Revenue</small>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Cash Outflows (Total)</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="text"
                    className="form-control"
                    value={cashFlow.cashOutflows.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    readOnly
                    style={{ backgroundColor: '#f8f9fa' }}
                  />
                </div>
                <small className="text-muted">Auto-calculated from Expenses</small>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Closing Cash Balance</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="text"
                    className="form-control"
                    value={cashFlow.closing.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    readOnly
                    style={{ backgroundColor: '#f8f9fa' }}
                  />
                </div>
                <small className="text-muted">Auto-calculated: Opening + Inflows - Outflows</small>
              </div>
              <div className="col-12 mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label className="form-label mb-0">Major Cash Movements & Justifications</label>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={addCashMovement}
                  >
                    <i className="bi bi-plus"></i> Add Movement
                  </button>
                </div>
                {formData.cashFlow.cashMovements.map((movement, index) => (
                  <div key={index} className="card mb-2">
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-4 mb-2">
                          <label className="form-label">Description</label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={movement.description}
                            onChange={(e) => updateCashMovement(index, 'description', e.target.value)}
                            placeholder="e.g., Loan disbursement"
                          />
                        </div>
                        <div className="col-md-3 mb-2">
                          <label className="form-label">Amount</label>
                          <div className="input-group input-group-sm">
                            <span className="input-group-text">$</span>
                            <input
                              type="number"
                              className="form-control"
                              value={movement.amount}
                              onChange={(e) => updateCashMovement(index, 'amount', e.target.value)}
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <div className="col-md-4 mb-2">
                          <label className="form-label">Reason</label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={movement.reason}
                            onChange={(e) => updateCashMovement(index, 'reason', e.target.value)}
                            placeholder="Justification"
                          />
                        </div>
                        <div className="col-md-1 mb-2 d-flex align-items-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => removeCashMovement(index)}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="section-content">
            <h5 className="section-title">5. Accounts Receivable (A/R)</h5>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">New Credit Sales This Month *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.accountsReceivable.newCreditSales}
                    onChange={(e) => handleChange('accountsReceivable', 'newCreditSales', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Collections Made *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.accountsReceivable.collectionsMade}
                    onChange={(e) => handleChange('accountsReceivable', 'collectionsMade', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-12 mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label className="form-label mb-0">Top 3 Outstanding Clients</label>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={addTopClient}
                  >
                    <i className="bi bi-plus"></i> Add Client
                  </button>
                </div>
                {formData.accountsReceivable.topClients.map((client, index) => (
                  <div key={index} className="card mb-2">
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-4 mb-2">
                          <label className="form-label">Client Name</label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={client.clientName}
                            onChange={(e) => updateTopClient(index, 'clientName', e.target.value)}
                            placeholder="Client name"
                          />
                        </div>
                        <div className="col-md-3 mb-2">
                          <label className="form-label">Amount</label>
                          <div className="input-group input-group-sm">
                            <span className="input-group-text">$</span>
                            <input
                              type="number"
                              className="form-control"
                              value={client.amount}
                              onChange={(e) => updateTopClient(index, 'amount', e.target.value)}
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <div className="col-md-4 mb-2">
                          <label className="form-label">Days Overdue</label>
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            value={client.daysOverdue}
                            onChange={(e) => updateTopClient(index, 'daysOverdue', e.target.value)}
                            min="0"
                            placeholder="0"
                          />
                        </div>
                        <div className="col-md-1 mb-2 d-flex align-items-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => removeTopClient(index)}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="col-12 mb-3">
                <label className="form-label">Comments/Notes</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={formData.accountsReceivable.arComments}
                  onChange={(e) => handleChange('accountsReceivable', 'arComments', e.target.value)}
                  placeholder="Additional notes about accounts receivable..."
                />
              </div>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="section-content">
            <h5 className="section-title">6. Accounts Payable (A/P)</h5>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">New Payables Incurred *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.accountsPayable.newPayables}
                    onChange={(e) => handleChange('accountsPayable', 'newPayables', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Payments Made *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.accountsPayable.paymentsMade}
                    onChange={(e) => handleChange('accountsPayable', 'paymentsMade', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-12 mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label className="form-label mb-0">Top 3 Outstanding Suppliers</label>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={addTopSupplier}
                  >
                    <i className="bi bi-plus"></i> Add Supplier
                  </button>
                </div>
                {formData.accountsPayable.topSuppliers.map((supplier, index) => (
                  <div key={index} className="card mb-2">
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-4 mb-2">
                          <label className="form-label">Supplier</label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={supplier.supplier}
                            onChange={(e) => updateTopSupplier(index, 'supplier', e.target.value)}
                            placeholder="Supplier name"
                          />
                        </div>
                        <div className="col-md-3 mb-2">
                          <label className="form-label">Amount</label>
                          <div className="input-group input-group-sm">
                            <span className="input-group-text">$</span>
                            <input
                              type="number"
                              className="form-control"
                              value={supplier.amount}
                              onChange={(e) => updateTopSupplier(index, 'amount', e.target.value)}
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <div className="col-md-4 mb-2">
                          <label className="form-label">Due Date</label>
                          <input
                            type="date"
                            className="form-control form-control-sm"
                            value={supplier.dueDate}
                            onChange={(e) => updateTopSupplier(index, 'dueDate', e.target.value)}
                          />
                        </div>
                        <div className="col-md-1 mb-2 d-flex align-items-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => removeTopSupplier(index)}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="col-12 mb-3">
                <label className="form-label">Comments/Notes</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={formData.accountsPayable.apComments}
                  onChange={(e) => handleChange('accountsPayable', 'apComments', e.target.value)}
                  placeholder="Additional notes about accounts payable..."
                />
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="section-content">
            <h5 className="section-title">7. Payroll Summary</h5>
            <div className="row">
              <div className="col-md-4 mb-3">
                <label className="form-label">Total Gross Payroll *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.payroll.totalGrossPayroll}
                    onChange={(e) => handleChange('payroll', 'totalGrossPayroll', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-md-4 mb-3">
                <label className="form-label">Total Deductions (Tax, Pension, etc.) *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.payroll.totalDeductions}
                    onChange={(e) => handleChange('payroll', 'totalDeductions', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-md-4 mb-3">
                <label className="form-label">Net Payroll Paid *</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.payroll.netPayrollPaid}
                    onChange={(e) => handleChange('payroll', 'netPayrollPaid', e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="col-md-4 mb-3">
                <label className="form-label">Full-time Employees</label>
                <input
                  type="number"
                  className="form-control"
                  value={formData.payroll.employeeCount.fullTime}
                  onChange={(e) => handleNestedChange('payroll', 'employeeCount', 'fullTime', e.target.value)}
                  min="0"
                />
              </div>
              <div className="col-md-4 mb-3">
                <label className="form-label">Part-time Employees</label>
                <input
                  type="number"
                  className="form-control"
                  value={formData.payroll.employeeCount.partTime}
                  onChange={(e) => handleNestedChange('payroll', 'employeeCount', 'partTime', e.target.value)}
                  min="0"
                />
              </div>
              <div className="col-md-4 mb-3">
                <label className="form-label">Interns</label>
                <input
                  type="number"
                  className="form-control"
                  value={formData.payroll.employeeCount.interns}
                  onChange={(e) => handleNestedChange('payroll', 'employeeCount', 'interns', e.target.value)}
                  min="0"
                />
              </div>
              <div className="col-12 mb-3">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={formData.payroll.payrollNotes}
                  onChange={(e) => handleChange('payroll', 'payrollNotes', e.target.value)}
                  placeholder="Additional notes about payroll..."
                />
              </div>
            </div>
          </div>
        );

      case 8:
        return (
          <div className="section-content">
            <h5 className="section-title">8. Compliance & Tax Updates</h5>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">GST/VAT Filed *</label>
                <select
                  className="form-select"
                  value={formData.compliance.gstVatFiled}
                  onChange={(e) => handleChange('compliance', 'gstVatFiled', e.target.value)}
                  required
                >
                  <option value="">Select Status</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Corporate Income Tax (CIT) Status *</label>
                <select
                  className="form-select"
                  value={formData.compliance.citStatus}
                  onChange={(e) => handleChange('compliance', 'citStatus', e.target.value)}
                  required
                >
                  <option value="">Select Status</option>
                  <option value="Paid">Paid</option>
                  <option value="Provisional">Provisional</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Payroll Taxes Paid *</label>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={formData.compliance.payrollTaxesPaid}
                    onChange={(e) => handleChange('compliance', 'payrollTaxesPaid', e.target.checked)}
                    id="payrollTaxesPaid"
                  />
                  <label className="form-check-label" htmlFor="payrollTaxesPaid">
                    Yes, payroll taxes have been paid
                  </label>
                </div>
              </div>
              <div className="col-12 mb-3">
                <label className="form-label">Any Pending Compliance Issues</label>
                <textarea
                  className="form-control"
                  rows="4"
                  value={formData.compliance.pendingIssues}
                  onChange={(e) => handleChange('compliance', 'pendingIssues', e.target.value)}
                  placeholder="Describe any pending compliance issues..."
                />
              </div>
            </div>
          </div>
        );

      case 9:
        return (
          <div className="section-content">
            <h5 className="section-title">9. Variance & Financial Risk Alerts</h5>
            <div className="row">
              <div className="col-12 mb-3">
                <label className="form-label">Risks Identified</label>
                <textarea
                  className="form-control"
                  rows="4"
                  value={formData.variance.risksIdentified}
                  onChange={(e) => handleChange('variance', 'risksIdentified', e.target.value)}
                  placeholder="Describe any financial risks identified..."
                />
              </div>
              <div className="col-12 mb-3">
                <label className="form-label">Mitigation Actions Taken/Proposed</label>
                <textarea
                  className="form-control"
                  rows="4"
                  value={formData.variance.mitigationActions}
                  onChange={(e) => handleChange('variance', 'mitigationActions', e.target.value)}
                  placeholder="Describe mitigation actions for identified risks..."
                />
              </div>
            </div>
          </div>
        );

      case 10:
        return (
          <div className="section-content">
            <h5 className="section-title">10. Attachments</h5>
            <div className="row">
              <div className="col-12 mb-3">
                <label className="form-label">Bank Statements (PDF) *</label>
                <input
                  type="file"
                  className="form-control"
                  accept=".pdf"
                  multiple
                  onChange={(e) => {
                    Array.from(e.target.files).forEach(file => {
                      handleFileUpload(file, 'attachments', 'bankStatements');
                    });
                  }}
                />
                <small className="text-muted">Upload one or more bank statement PDFs</small>
                {formData.attachments.bankStatements.length > 0 && (
                  <div className="mt-2">
                    <small>Uploaded: {formData.attachments.bankStatements.length} file(s)</small>
                  </div>
                )}
              </div>
              <div className="col-12 mb-3">
                <label className="form-label">Payroll Report (PDF) *</label>
                <input
                  type="file"
                  className="form-control"
                  accept=".pdf"
                  onChange={(e) => {
                    if (e.target.files[0]) {
                      handleFileUpload(e.target.files[0], 'attachments', 'payrollReport');
                    }
                  }}
                />
                <small className="text-muted">Upload payroll report PDF</small>
              </div>
              <div className="col-12 mb-3">
                <label className="form-label">Invoices / Receipts</label>
                <input
                  type="file"
                  className="form-control"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
                  onChange={(e) => {
                    Array.from(e.target.files).forEach(file => {
                      handleFileUpload(file, 'attachments', 'invoicesReceipts');
                    });
                  }}
                />
                <small className="text-muted">Upload invoices and receipts (PDF, JPG, PNG)</small>
                {formData.attachments.invoicesReceipts.length > 0 && (
                  <div className="mt-2">
                    <small>Uploaded: {formData.attachments.invoicesReceipts.length} file(s)</small>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 11:
        return (
          <div className="section-content">
            <h5 className="section-title">11. Approval Workflow</h5>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Prepared By *</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.approval.preparedBy || formData.reportingPeriod.submittedBy}
                  onChange={(e) => handleChange('approval', 'preparedBy', e.target.value)}
                  required
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Prepared Signature</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.approval.preparedSignature}
                  onChange={(e) => handleChange('approval', 'preparedSignature', e.target.value)}
                  placeholder="Signature or initials"
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Reviewed By (CFO/Finance Manager)</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.approval.reviewedBy}
                  onChange={(e) => handleChange('approval', 'reviewedBy', e.target.value)}
                  placeholder="Reviewer name"
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Reviewed Signature</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.approval.reviewedSignature}
                  onChange={(e) => handleChange('approval', 'reviewedSignature', e.target.value)}
                  placeholder="Signature or initials"
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Approved By (CEO/MD)</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.approval.approvedBy}
                  onChange={(e) => handleChange('approval', 'approvedBy', e.target.value)}
                  placeholder="Approver name"
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Approved Signature</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.approval.approvedSignature}
                  onChange={(e) => handleChange('approval', 'approvedSignature', e.target.value)}
                  placeholder="Signature or initials"
                />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header bg-success text-white">
            <h5 className="modal-title">
              <i className="bi bi-calculator me-2"></i>
              {report ? 'Edit Finance Department Report' : 'Finance Department Report Template'}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              disabled={loading}
            ></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && (
                <div className="alert alert-danger">{error}</div>
              )}

              {/* Section Navigation */}
              <div className="mb-4">
                <div className="d-flex flex-wrap gap-2">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className={`btn btn-sm ${activeSection === section.id ? 'btn-success' : 'btn-outline-success'}`}
                      onClick={() => setActiveSection(section.id)}
                    >
                      <i className={`bi ${section.icon} me-1`}></i>
                      {section.id}. {section.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section Content */}
              {renderSection()}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-success"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    {report ? 'Updating...' : 'Submitting...'}
                  </>
                ) : (
                  <>
                    <i className="bi bi-check-circle me-2"></i>
                    {report ? 'Update Report' : 'Submit Report'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default FinanceReportForm;

