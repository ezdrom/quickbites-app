export default function AuthLayout({ children }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-panel-left">
          <div className="auth-seal-placeholder" aria-label="JRCC seal placeholder" role="img" />
        </div>
        <div className="auth-panel-right">
          <div className="auth-brand">
            <span className="auth-brand-name">quickbites.</span>
            <span className="auth-brand-sub">by JRCC</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
