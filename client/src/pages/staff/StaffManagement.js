import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import StaffForm from './StaffForm';
import StaffList from './StaffList';

const StaffManagement = () => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState({
    department: '',
    employment_type: '',
    search: ''
  });

  // Initial fetch
  useEffect(() => {
    fetchDepartments();
    fetchStaff();
  }, []);

  // Fetch staff when filters change
  useEffect(() => {
    if (!loading) fetchStaff();
  }, [filters]);

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      const depts = response.data?.departments || [];
      setDepartments(Array.isArray(depts) ? depts : []);
    } catch (error) {
      console.error('Error fetching departments:', error);
      setDepartments([]);
    }
  };

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.department) params.append('department', filters.department);
      if (filters.employment_type) params.append('employment_type', filters.employment_type);
      if (filters.search) params.append('search', filters.search);

      const response = await api.get(`/staff?${params.toString()}`);
      console.log('Staff API response:', response.data); // debug log

      const staffList = response.data?.staff || response.data || [];
      setStaff(Array.isArray(staffList) ? staffList : []);
    } catch (error) {
      console.error('Error fetching staff:', error);
      setStaff([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingStaff(null);
    setShowForm(true);
  };

  const handleEdit = (staffMember) => {
    if (!staffMember || !staffMember.id) {
      alert('Error: Invalid staff member data');
      return;
    }
    setEditingStaff(staffMember);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!id) {
      alert('Error: Invalid staff ID');
      return;
    }
    if (window.confirm('Are you sure you want to delete this staff member?')) {
      try {
        await api.delete(`/staff/${id}`);
        fetchStaff();
      } catch (error) {
        console.error('Delete staff error:', error);
        alert(error.response?.data?.error || 'Error deleting staff member');
      }
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingStaff(null);
    fetchStaff();
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="row mb-4">
        <div className="col-12 d-flex justify-content-between align-items-center">
          <h1 className="h3 mb-0">Staff Management</h1>
          <button className="btn btn-primary" onClick={handleAdd}>
            <i className="bi bi-plus-circle me-2"></i>Add Staff Member
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="row mb-3">
        <div className="col-md-4">
          <input
            type="text"
            className="form-control"
            placeholder="Search by name, email, or ID..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <div className="col-md-3">
          <select
            className="form-select"
            value={filters.department}
            onChange={(e) => setFilters({ ...filters, department: e.target.value })}
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.name}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-3">
          <select
            className="form-select"
            value={filters.employment_type}
            onChange={(e) => setFilters({ ...filters, employment_type: e.target.value })}
          >
            <option value="">All Types</option>
            <option value="Full-time">Full-time</option>
            <option value="Part-time">Part-time</option>
            <option value="Internship">Internship</option>
          </select>
        </div>
        <div className="col-md-2">
          <button
            className="btn btn-outline-secondary w-100"
            onClick={() => setFilters({ department: '', employment_type: '', search: '' })}
          >
            Clear
          </button>
        </div>
      </div>

      <StaffList staff={staff} onEdit={handleEdit} onDelete={handleDelete} />

      {showForm && <StaffForm staff={editingStaff} onClose={handleFormClose} />}
    </div>
  );
};

export default StaffManagement;
