-- Migration: 019_staff_attendance.sql
-- Create staff attendance system with sign-in/sign-out and approval workflow

CREATE TABLE IF NOT EXISTS staff_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_name TEXT,
    attendance_date DATE NOT NULL,
    sign_in_time DATETIME,
    sign_out_time DATETIME,
    sign_in_late BOOLEAN DEFAULT 0,
    sign_in_late_reason TEXT,
    sign_out_early BOOLEAN DEFAULT 0,
    sign_out_early_reason TEXT,
    status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
    approved_by INTEGER,
    approved_at DATETIME,
    admin_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(user_id, attendance_date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_staff_attendance_user_id ON staff_attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_status ON staff_attendance(status);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_approved_by ON staff_attendance(approved_by);
