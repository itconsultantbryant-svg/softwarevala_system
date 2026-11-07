-- PostgreSQL role constraint extension for provisioned agent portal accounts.
-- The original users table was created before the FreelanceMarketingAgent role
-- existed, so its check constraint rejects otherwise-valid provisioning writes.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_new_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
  role IN ('Admin', 'Staff', 'Instructor', 'Student', 'Client', 'Partner', 'DepartmentHead', 'FreelanceMarketingAgent')
);
