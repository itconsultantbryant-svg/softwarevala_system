import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container-fluid sv-page d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
          <div className="sv-panel text-center" style={{ maxWidth: '520px' }}>
            <div className="sv-panel__head justify-content-center">
              <i className="bi bi-bug-fill" />
              Something went wrong
            </div>
            <div className="sv-panel__body py-4">
              <img
                src="/softwarevala-logo.png"
                alt="Software Vala Liberia"
                style={{ maxWidth: '180px', marginBottom: '1rem', background: '#fff', padding: '6px 12px', borderRadius: '6px' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <p className="text-muted mb-4">
                We&apos;re sorry, but something unexpected happened. Please try refreshing the page.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
              >
                <i className="bi bi-arrow-clockwise me-2" />
                Refresh Page
              </button>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4 text-start">
                  <summary className="text-muted small">Error Details (Development Only)</summary>
                  <pre className="bg-light p-3 mt-2 rounded" style={{ fontSize: '0.8rem' }}>
                    {this.state.error.toString()}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
