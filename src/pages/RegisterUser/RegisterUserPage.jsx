import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

// Styles & Assets
import '../../styles/login.css';
import greenBg from '../../assets/images/green-background.png';
import jrccLogo from '../../assets/images/jrcc-logo.png';
import quickbitesLogo from '../../assets/images/quickbites-logo.png';

export default function RegisterUserPage() {
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Hover & Press states
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }
    setMessage('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: `${firstName} ${lastName}`.trim(),
          },
        },
      });

      if (error) {
        setMessage(error.message);
      } else if (data?.session) {
        navigate('/menu');
      } else {
        setMessage('Check your email to confirm your account before logging in.');
      }
    } catch {
      setMessage("Can't reach the server right now. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page" style={{ backgroundImage: `url(${greenBg})` }}>
      {/* LEFT PANEL */}
      <section className="left-panel">
        <img src={jrccLogo} alt="JRCC Logo" className="jrcc-logo" />
      </section>

      {/* RIGHT PANEL */}
      <section className="right-panel">
        <div className="login-card" style={{ width: '100%', maxWidth: '480px', padding: '30px 40px' }}>
          
          <img 
            src={quickbitesLogo} 
            alt="QuickBites Logo" 
            style={{ maxHeight: '60px', margin: '0 auto 10px', display: 'block' }} 
          />

          <h1 style={{ fontSize: '32px', fontWeight: '900', textAlign: 'center', margin: '5px 0', color: '#000' }}>
            CREATE ACCOUNT
          </h1>

          <p style={{ textAlign: 'center', fontSize: '13px', marginBottom: '20px', color: '#333' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#2e7d32', fontWeight: 'bold', textDecoration: 'underline' }}>
              LOG IN
            </Link>
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* FIRST NAME & LAST NAME */}
            <div className="register-name-row" style={{ width: '100%' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label htmlFor="firstName" style={{ fontSize: '13px', fontWeight: 'normal', marginBottom: '4px', color: '#000' }}>
                  First Name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  placeholder="John Michael"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1.5px solid #000',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label htmlFor="lastName" style={{ fontSize: '13px', fontWeight: 'normal', marginBottom: '4px', color: '#000' }}>
                  Last Name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  placeholder="Lee"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1.5px solid #000',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* EMAIL */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label htmlFor="email" style={{ fontSize: '13px', fontWeight: 'normal', marginBottom: '4px', color: '#000' }}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="johnmichael@lamona.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #000',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* PASSWORD */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label htmlFor="password" style={{ fontSize: '13px', fontWeight: 'normal', marginBottom: '2px', color: '#000' }}>
                Password
              </label>
              <span style={{ fontSize: '11px', color: '#555', marginBottom: '6px' }}>
                Must be at least 8 characters long with a mix of letters and numbers.
              </span>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #000',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* CONFIRM PASSWORD */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label htmlFor="confirmPassword" style={{ fontSize: '13px', fontWeight: 'normal', marginBottom: '4px', color: '#000' }}>
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="••••••••••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #000',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <p style={{ fontSize: '12px', color: '#555', margin: 0, textAlign: 'center' }}>
              Canteen staff accounts are set up by an administrator after you register.
            </p>

            {/* SIGN UP BUTTON */}
            <button
              type="submit"
              disabled={loading}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
              onMouseDown={() => setIsPressed(true)}
              onMouseUp={() => setIsPressed(false)}
              style={{
                width: '260px',
                padding: '12px 0',
                margin: '15px auto 0',
                display: 'block',
                backgroundColor: isHovered ? '#FFA000' : '#FFC107',
                color: '#000',
                fontSize: '24px',
                fontWeight: '900',
                letterSpacing: '0.5px',
                border: '1.5px solid #000',
                borderRadius: '12px',
                boxShadow: isPressed 
                  ? '0px 2px 6px rgba(0, 0, 0, 0.2)' 
                  : isHovered 
                    ? '0px 8px 20px rgba(0, 0, 0, 0.35)' 
                    : '0px 6px 16px rgba(0, 0, 0, 0.25)',
                transform: isPressed 
                  ? 'translateY(2px)' 
                  : isHovered 
                    ? 'translateY(-2px)' 
                    : 'translateY(0px)',
                transition: 'all 0.15s ease',
                cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              {loading ? 'CREATING...' : 'SIGN UP'}
            </button>

            {message && (
              <p style={{ color: '#d32f2f', textAlign: 'center', fontSize: '13px', marginTop: '5px' }}>
                {message}
              </p>
            )}

          </form>
        </div>
      </section>
    </div>
  );
}