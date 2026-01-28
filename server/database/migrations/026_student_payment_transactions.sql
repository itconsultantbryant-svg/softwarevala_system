-- Migration: 026_student_payment_transactions.sql
-- Adds payment transactions with approval workflow for student payments

CREATE TABLE IF NOT EXISTS student_payment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_payment_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date DATE DEFAULT CURRENT_DATE,
    payment_method TEXT,
    payment_reference TEXT,
    proof_attachment TEXT, -- optional file path / URL
    notes TEXT,
    status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
    created_by INTEGER NOT NULL, -- user_id (student)
    approved_by INTEGER, -- user_id (finance/admin)
    approved_at DATETIME,
    admin_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_payment_id) REFERENCES student_payments(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_spt_student_payment_id ON student_payment_transactions(student_payment_id);
CREATE INDEX IF NOT EXISTS idx_spt_student_id ON student_payment_transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_spt_course_id ON student_payment_transactions(course_id);
CREATE INDEX IF NOT EXISTS idx_spt_status ON student_payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_spt_created_by ON student_payment_transactions(created_by);
