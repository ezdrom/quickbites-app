import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { appUrl } from '../../lib/env'

// Styles
import '../../styles/login.css'

// Assets
import greenBg from '../../assets/images/green-background.png'
import jrccLogo from '../../assets/images/jrcc-logo.png'
import quickbitesLogo from '../../assets/images/quickbites-logo.png'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
    setError('')
    setLoading(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl || window.location.origin}/reset-password`,
      })

      if (resetError) {
        setError(resetError.message)
      } else {
        setMessage('Password reset link sent! Check your email.')
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

          <h1>FORGOT PASSWORD</h1>
          <p style={{ fontSize: '12px', margin: '8px 0 16px', color: '#555', textAlign: 'center' }}>
            Enter your school email address, and we will send you a link to reset your password.
          </p>

          <form onSubmit={handleSubmit}>
            {/* Email Field */}
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <div className="input-box">
                <input
                  type="email"
                  id="email"
                  placeholder="johnmichael@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* SEND LINK Button */}
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
              {loading ? 'SENDING...' : 'SEND LINK'}
            </button>

            {message && <p style={{ color: '#2e7d32', marginTop: '12px', fontSize: '13px' }}>{message}</p>}
            {error && <p style={{ color: '#d32f2f', marginTop: '12px', fontSize: '13px' }}>{error}</p>}

            {/* Link back to login */}
            <p style={{ marginTop: '24px', fontSize: '12px' }}>
              Remember Password?{' '}
              <Link to="/login" style={{ color: '#2e7d32', fontWeight: 'bold' }}>
                LOG IN
              </Link>
            </p>
          </form>
        </div>
      </section>
    </div>
  )
}