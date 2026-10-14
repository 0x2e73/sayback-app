import { Component, type ReactNode } from 'react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  className?: string;
  onReload?(): void;
}

interface ErrorBoundaryState {
  failed: boolean;
}

function reloadWindow(): void {
  window.location.reload();
}

/** A rendering failure leaves a message and a way out instead of a blank window. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { className = '', onReload = reloadWindow } = this.props;
    return (
      <div className={`error-fallback ${className}`.trim()} role="alert">
        <p>L’affichage a rencontré un problème.</p>
        <Button variant="secondary" onClick={onReload}>
          Recharger
        </Button>
      </div>
    );
  }
}
