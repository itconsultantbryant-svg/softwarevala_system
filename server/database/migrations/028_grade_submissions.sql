-- Migration: 028_grade_submissions.sql
-- Adds grade submission + admin approval workflow

CREATE TABLE IF NOT EXISTS grade_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    proposed_grade TEXT NOT NULL,
    status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
    submitted_by INTEGER NOT NULL, -- user_id (instructor/academy staff)
    approved_by INTEGER, -- user_id (admin)
    approved_at DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_grade_submissions_student_id ON grade_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_grade_submissions_course_id ON grade_submissions(course_id);
CREATE INDEX IF NOT EXISTS idx_grade_submissions_status ON grade_submissions(status);
CREATE INDEX IF NOT EXISTS idx_grade_submissions_submitted_by ON grade_submissions(submitted_by);
