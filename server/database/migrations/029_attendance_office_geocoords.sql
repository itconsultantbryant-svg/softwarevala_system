-- Store sign-in / sign-out coordinates for accountability (optional columns)
ALTER TABLE staff_attendance ADD COLUMN sign_in_latitude REAL;
ALTER TABLE staff_attendance ADD COLUMN sign_in_longitude REAL;
ALTER TABLE staff_attendance ADD COLUMN sign_out_latitude REAL;
ALTER TABLE staff_attendance ADD COLUMN sign_out_longitude REAL;
