import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { useNavigate, Link } from 'react-router-dom';
import { Droplet, Lock, User, AlertCircle } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmation) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await register(name, username, password);
      navigate('/products.html');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center px-4 py-12">
      <div className="card w-full max-w-md bg-white shadow-xl rounded-2xl border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-2">
            <Droplet className="w-12 h-12 text-secondary fill-secondary" />
          </div>
          <h2 className="text-2xl font-black text-primary tracking-wider">AQUALICIOUS</h2>
          <p className="text-xs text-slate-500 uppercase font-semibold mt-1">Customer Registration</p>
        </div>

        {error && (
          <div className="alert alert-error text-xs p-3 mb-4 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        <form id="auth-form" onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label text-xs font-bold text-slate-600 pb-1">Full Name</label>
            <input
              type="text"
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
              placeholder="e.g. Juan Dela Cruz"
            />
          </div>

          <div>
            <label className="label text-xs font-bold text-slate-600 pb-1">Username</label>
            <input
              type="text"
              name="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
              placeholder="e.g. juan123"
            />
          </div>

          <div>
            <label className="label text-xs font-bold text-slate-600 pb-1">Password</label>
            <input
              type="password"
              name="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
              placeholder="Enter password"
            />
          </div>

          <div>
            <label className="label text-xs font-bold text-slate-600 pb-1">Confirm Password</label>
            <input
              type="password"
              name="confirmation"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
              placeholder="Confirm password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary btn-sm w-full font-bold text-white shadow mt-4"
          >
            {isLoading ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <div className="text-center mt-6 pt-4 border-t border-slate-100">
          <Link to="/login" className="text-xs font-semibold text-secondary hover:underline">
            Already have an account? Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};
