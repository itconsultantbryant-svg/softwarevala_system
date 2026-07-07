import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/AppTheme.css';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import $ from 'jquery';
window.$ = window.jQuery = $;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

