import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

// Styles
import '../../styles/login.css'

// Assets
import greenBg from '../../assets/images/green-background.png'
import jrccLogo from '../../assets/images/jrcc-logo.png'
import quickbitesLogo from '../../assets/images/quickbites-logo.png'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        setError(updateError.message)
      } else {
        await supabase.auth.signOut()
        setDone(true)
        setMessage('Your password has been reset. You can now log in with your new password.')
      }
    } catch {
      setError("Can't reach the server right now. Please try again in a moment.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page" style={{ backgroundImage: `url(${greenBg})` }}>
      {/* Left Crest Panel */}
      <section className="left-panel">
        <img
          src={jrccLogo}
          alt="Jesus Reigns Christian College"
          className="jrcc-logo"
        />
      </section>

      {/* Right Form Panel */}
      <section className="right-panel">
        <div className="login-card">
          <img
            src={quickbitesLogo}
            alt="QuickBites by JRCC"
            className="quickbites-logo"
          />

          <h1>RESET PASSWORD</h1>
          <p style={{ fontSize: '12px', margin: '8px 0 16px', color: '#555', textAlign: 'center' }}>
            Enter a new password for your account.
          </p>

          {done ? (
            <>
              {message && <p style={{ color: '#2e7d32', marginTop: '12px', fontSize: '13px' }}>{message}</p>}
              <p style={{ marginTop: '24px', fontSize: '12px' }}>
                <Link to="/login" style={{ color: '#2e7d32', fontWeight: 'bold' }}>
                  BACK TO LOG IN
                </Link>
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* New Password Field */}
              <div className="form-group">
                <label htmlFor="password">New Password</label>
                <div className="input-box">
                  <input
                    type="password"
                    id="password"
                    placeholder="••••••••••••••••••••••"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Confirm Password Field */}
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <div className="input-box">
                  <input
                    type="password"
                    id="confirmPassword"
                    placeholder="••••••••••••••••••••••"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* RESET PASSWORD Button */}
              <button
                type="submit"
                className="dig-in-button"
                disabled={loading}
                style={{
                  backgroundColor: '#ffb703',
                  color: '#000',
                  fontWeight: 'bold',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px',
                  width: '100%',
                  marginTop: '16px',
                  cursor: 'pointer',
                }}
              >
                {loading ? 'RESETTING...' : 'RESET PASSWORD'}
              </button>

              {error && <p style={{ color: '#d32f2f', marginTop: '12px', fontSize: '13px' }}>{error}</p>}

              {/* Link back to login */}
              <p style={{ marginTop: '24px', fontSize: '12px' }}>
                Remember Password?{' '}
                <Link to="/login" style={{ color: '#2e7d32', fontWeight: 'bold' }}>
                  LOG IN
                </Link>
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
