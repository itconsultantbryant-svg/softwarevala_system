-- Migration: 027_student_invoices.sql
-- Adds invoice snapshots for student billing

CREATE TABLE IF NOT EXISTS student_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    invoice_number TEXT UNIQUE NOT NULL,
    period TEXT, -- optional e.g. "Cohort Q1 2026"
    status TEXT DEFAULT 'Generated' CHECK(status IN ('Generated', 'Sent_to_finance', 'Closed', 'Cancelled')),
    total_fee REAL DEFAULT 0,
    total_paid REAL DEFAULT 0,
    total_balance REAL DEFAULT 0,
    created_by INTEGER NOT NULL, -- user_id (student)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS student_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    course_fee REAL NOT NULL,
    amount_paid_at_generation REAL DEFAULT 0,
    balance_at_generation REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES student_invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_student_invoices_student_id ON student_invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_student_invoices_status ON student_invoices(status);
CREATE INDEX IF NOT EXISTS idx_student_invoice_items_invoice_id ON student_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_student_invoice_items_course_id ON student_invoice_items(course_id);
