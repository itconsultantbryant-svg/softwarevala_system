// src/pages/StudentBilling.js
import React, { useState, useEffect } from 'react';
import api from '../../config/api'; // Make sure your API config is correct
import { useAuth } from '../../hooks/useAuth';
import { isAcademyStaff as isAcademyStaffUtils } from '../../utils/academyUtils';
import { useNavigate } from 'react-router-dom';

const StudentBilling = () => {
  const [billing, setBilling] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const isAcademyStaff = isAcademyStaffUtils(user);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAcademyStaff) {
      navigate('/academy');
      return;   }
    fetchBilling();
  }, []);

  const fetchBilling = async () => {
    try {
      const res = await api.get('/academy/billing'); // Replace with your real endpoint
      setBilling(res.data.billing || []);
    } catch (err) {
      console.error('Failed to fetch billing info:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="academy-page">
      <h1>Student Billing</h1>
      {loading ? (
        <p>Loading billing information...</p>
      ) : billing.length === 0 ? (
        <p>No billing records found.</p>
      ) : (
        <table className="billing-table">
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Course</th>
              <th>Amount Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {billing.map((b) => (
              <tr key={b.id}>
                <td>{b.student_name}</td>
                <td>{b.course_name}</td>
                <td>{b.amount_due}</td>
                <td>{b.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default StudentBilling;
