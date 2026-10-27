import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { TermsPrivacyModal } from '../components/TermsPrivacyModal.js';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setError('A valid email address is required for account verification');
      return;
    }

    if (password !== confirmation) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    // Open Terms & Conditions and Data Privacy Modal for mandatory consent
    setIsTermsOpen(true);
  };

  const handleAcceptTermsAndRegister = async (termsVersion: string) => {
    setIsLoading(true);
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    try {
      await register(name.trim(), username.trim(), password, true, termsVersion, cleanEmail);
      setIsTermsOpen(false);
      navigate('/verify-email', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      setIsTermsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center px-4 py-12"
      style={{ background: 'linear-gradient(180deg, #e3eefa 0%, #d3e4f6 100%)' }}
    >
      <div className="card w-full max-w-md bg-white shadow-xl rounded-2xl border border-gray-200 p-8">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-[#1565c0] flex items-center justify-center text-white shadow-md">
              <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24">
                <path d="M12 2C8 7 4 10.5 4 14a8 8 0 0016 0c0-3.5-4-7-8-12z" />
              </svg>
            </div>
          </div>
          <h2 className="font-serif text-2xl font-bold text-[#0b3d91] tracking-tight">
            AquaLicious
          </h2>
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mt-1">
            Create Customer Account
          </p>
        </div>

        {error && (
          <div className="p-3 mb-4 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2 border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form id="auth-form" onSubmit={handleFormSubmit} className="space-y-3">
          <div className="form-group mb-2">
            <label className="form-label text-xs font-semibold text-gray-700">Full Name *</label>
            <input
              type="text"
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-control"
              placeholder="e.g. Juan Dela Cruz"
            />
          </div>

          <div className="form-group mb-2">
            <label className="form-label text-xs font-semibold text-gray-700">Username *</label>
            <input
              type="text"
              name="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-control"
              placeholder="e.g. juan123"
            />
          </div>

          <div className="form-group mb-2">
            <label className="form-label text-xs font-semibold text-gray-700">Email Address *</label>
            <input
              type="email"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-control"
              placeholder="e.g. juan@example.com"
            />
          </div>

          <div className="form-group mb-2">
            <label className="form-label text-xs font-semibold text-gray-700">Password *</label>
            <input
              type="password"
              name="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-control"
              placeholder="Enter password"
            />
          </div>

          <div className="form-group mb-2">
            <label className="form-label text-xs font-semibold text-gray-700">Confirm Password *</label>
            <input
              type="password"
              name="confirmation"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="form-control"
              placeholder="Re-enter password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary w-full font-bold shadow mt-2"
          >
            {isLoading ? 'Creating Account...' : 'Continue to Terms & Consent'}
          </button>
        </form>

        <div className="text-center mt-6 pt-4 border-t border-gray-100">
          <Link
            to="/login"
            className="text-xs font-semibold text-[#1565c0] hover:underline"
          >
            Already have an account? Sign In
          </Link>
        </div>
      </div>

      {/* Mandatory Terms & Data Privacy Act of 2012 Consent Modal */}
      <TermsPrivacyModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        onAccept={handleAcceptTermsAndRegister}
        isSubmitting={isLoading}
      />
    </div>
  );
};
