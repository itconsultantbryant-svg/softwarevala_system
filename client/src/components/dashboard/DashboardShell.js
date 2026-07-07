import React from 'react';
import { Link } from 'react-router-dom';
import './DashboardTheme.css';

export const DashboardShell = ({ title, subtitle, badge, badgeIcon = 'bi-shield-check', actions, showLogo = true, children }) => (
  <div className="container-fluid sv-dashboard">
    <div className="sv-dashboard__hero">
      <div className="sv-dashboard__hero-main">
        {showLogo && (
          <img
            src="/softwarevala-logo.png"
            alt="Software Vala Liberia"
            className="sv-dashboard__hero-logo d-none d-sm-block"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="sv-dashboard__hero-sub">{subtitle}</p>}
          {badge && (
            <span className="sv-dashboard__hero-badge">
              <i className={`bi ${badgeIcon}`} />
              {badge}
            </span>
          )}
        </div>
      </div>
      {actions && <div className="sv-dashboard__hero-actions">{actions}</div>}
    </div>
    {children}
  </div>
);

export const MetricTile = ({ icon, label, value, sub, variant = 'navy' }) => (
  <div className={`sv-metric-tile sv-metric-tile--${variant}`}>
    <div>
      <div className="sv-metric-tile__label">{label}</div>
      <div className="sv-metric-tile__value">{value}</div>
      {sub && <div className="sv-metric-tile__sub">{sub}</div>}
    </div>
    <div className={`sv-metric-tile__icon sv-metric-tile__icon--${variant}`}>
      <i className={`bi ${icon}`} />
    </div>
  </div>
);

export const ActionTile = ({ icon, title, description, to, onClick, actionLabel, headVariant = 'navy', btnVariant = 'navy' }) => {
  const btnClass = btnVariant === 'red' ? 'sv-action-tile__btn sv-action-tile__btn--red' : 'sv-action-tile__btn';
  const inner = (
    <>
      <i className={`bi ${icon}`} />
      {actionLabel || 'Open'}
    </>
  );

  return (
    <div className="sv-action-tile">
      <div className={`sv-action-tile__head sv-action-tile__head--${headVariant}`}>
        <i className={`bi ${icon}`} />
        {title}
      </div>
      <div className="sv-action-tile__body">
        {description && <p className="sv-action-tile__desc">{description}</p>}
        {to ? (
          <Link to={to} className={btnClass}>{inner}</Link>
        ) : (
          <button type="button" className={btnClass} onClick={onClick}>{inner}</button>
        )}
      </div>
    </div>
  );
};

export const QuickLinks = ({ title = 'Quick Access', links = [] }) => (
  <div className="sv-quick-links">
    <div className="sv-dashboard__section-title mb-3">
      <i className="bi bi-grid-3x3-gap-fill" />
      {title}
    </div>
    <div className="sv-quick-links__grid">
      {links.map((link) =>
        link.to ? (
          <Link key={link.label} to={link.to} className="sv-quick-link">
            <i className={`bi ${link.icon}`} />
            {link.label}
          </Link>
        ) : (
          <button key={link.label} type="button" className="sv-quick-link border-0 w-100" onClick={link.onClick}>
            <i className={`bi ${link.icon}`} />
            {link.label}
          </button>
        )
      )}
    </div>
  </div>
);

export const InfoPanel = ({ title, icon = 'bi-person-badge', children }) => (
  <div className="sv-info-panel">
    <div className="sv-info-panel__head">
      <i className={`bi ${icon}`} />
      {title}
    </div>
    <div className="sv-info-panel__body">{children}</div>
  </div>
);
