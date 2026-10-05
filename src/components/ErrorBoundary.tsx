import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Ловит ошибки рендера и эффектов, чтобы приложение не превращалось в пустой
 * экран, а показывало понятное сообщение и кнопку перезапуска.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Ошибка приложения:", error, info);
  }

  private reload = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="app">
        <section className="panel">
          <div className="panel__head">
            <h2>Что-то пошло не так</h2>
          </div>
          <p className="alert">
            Приложение столкнулось с ошибкой. Нажмите кнопку, чтобы продолжить.
          </p>
          <pre className="result">{error.message || String(error)}</pre>
          <div className="controls">
            <button className="btn btn--primary" onClick={this.reload}>
              🔄 Перезапустить
            </button>
          </div>
        </section>
      </div>
    );
  }
}
