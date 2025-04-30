import React from 'react';
import './ErrorBoundary.css'; // Import CSS

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-page">
          <div className="error-boundary-card">
            <div className="error-boundary-header">
              <span className="error-boundary-icon">⚠️</span>
              <h2 className="error-boundary-title">
                Something went wrong
              </h2>
              <p className="error-boundary-message">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
            </div>

            {this.state.errorInfo && (
              <div className="error-boundary-stacktrace">
                <pre>
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}

            <div className="error-boundary-actions">
              <button 
                onClick={() => window.location.reload()}
                className="error-boundary-button error-boundary-button-primary"
              >
                Reload Page
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="error-boundary-button error-boundary-button-secondary"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;