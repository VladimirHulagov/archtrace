/**
 * Error Boundary — catches React render errors,
 * sends them to the backend API for logging.
 */

import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorInfo {
  componentStack: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const payload = {
      message: error.message,
      stack: error.stack || '',
      componentStack: info.componentStack || '',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };

    // Fire-and-forget
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Server unreachable — nothing we can do
    });

    // Also log to console for devtools
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100vw', height: '100vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: '16px',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <h2 style={{ color: '#ff4d4f', margin: 0 }}>Something went wrong</h2>
          <p style={{ color: '#666', maxWidth: '400px', textAlign: 'center' }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 16px',
              border: '1px solid #1890ff',
              borderRadius: '4px',
              background: '#1890ff',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Global uncaught error handler — catches errors outside React.
 * Errors caught by ErrorBoundary won't trigger this (React swallows them).
 */
export function setupGlobalErrorHandler() {
  window.addEventListener('error', (event) => {
    sendClientError({
      message: event.message,
      stack: event.error?.stack || '',
      componentStack: '',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    sendClientError({
      message: `Unhandled promise rejection: ${err.message}`,
      stack: err.stack || '',
      componentStack: '',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });
  });
}

function sendClientError(payload: {
  message: string;
  stack: string;
  componentStack: string;
  url: string;
  timestamp: string;
  userAgent: string;
}) {
  fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
