import React, { Component, type ReactNode } from 'react'
import { AlertCircle, RotateCcw, Home } from 'lucide-react'
import { Button } from './Button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled React error:', error, errorInfo)
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, error: null })
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[450px] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-[28px] border border-rose-200/90 shadow-[0_10px_35px_rgba(244,63,94,0.08)] p-6 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <AlertCircle size={28} />
            </div>

            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              An unexpected error occurred
            </h3>

            <p className="text-[12.5px] text-slate-500 mt-1.5 leading-relaxed">
              The page encountered an error while rendering this module. You can reload or navigate back to the workspace.
            </p>

            {this.state.error?.message && (
              <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-left overflow-x-auto max-h-24">
                <p className="text-[11px] font-mono text-rose-700 break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex items-center justify-center gap-2.5 mt-5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  this.handleReset()
                  window.location.href = '/'
                }}
                className="text-[12px] font-bold border-slate-200"
              >
                <Home size={14} className="mr-1.5" />
                Dashboard Home
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => {
                  this.handleReset()
                  window.location.reload()
                }}
                className="text-[12px] font-bold bg-teal-600 hover:bg-teal-700 text-white"
              >
                <RotateCcw size={14} className="mr-1.5" />
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
