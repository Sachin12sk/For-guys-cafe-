import { Component, type ErrorInfo, type ReactNode } from 'react';
import { STORAGE_KEY } from '../data/defaultMenu';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected application error',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('FOUR GUYS CAFE runtime error:', error, info);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleResetCacheAndReload = (): void => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[#FAF9F6] text-stone-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl bg-white border border-stone-200 shadow-lg p-6 space-y-4 text-center">
          <div className="font-display text-xl font-extrabold text-stone-900">
            FOUR GUYS CAFE
          </div>
          <p className="text-sm text-stone-600 leading-relaxed">
            Something interrupted the menu view. Tap below to reload cleanly.
          </p>
          {this.state.errorMessage && (
            <p className="text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-xl p-2.5 break-words">
              {this.state.errorMessage}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] text-white text-sm font-semibold transition-colors"
            >
              Reload Menu
            </button>
            <button
              type="button"
              onClick={this.handleResetCacheAndReload}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-sm font-semibold transition-colors"
            >
              Reset Menu Cache
            </button>
          </div>
        </div>
      </div>
    );
  }
}
