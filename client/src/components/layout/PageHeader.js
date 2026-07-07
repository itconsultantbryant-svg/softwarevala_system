import React from 'react';

/**
 * Consistent page header for management pages, profile, forms, etc.
 */
const PageHeader = ({ title, subtitle, icon = 'bi-grid-1x2-fill', actions, children }) => (
  <div className="sv-page-header">
    <div className="sv-page-header__main">
      <div className="sv-page-header__icon">
        <i className={`bi ${icon}`} />
      </div>
      <div>
        <h2>{title}</h2>
        {subtitle && <p className="sv-page-header__sub">{subtitle}</p>}
        {children}
      </div>
    </div>
    {actions && <div className="sv-page-header__actions">{actions}</div>}
  </div>
);

export default PageHeader;
