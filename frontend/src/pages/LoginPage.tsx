import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { useNavigate, Link } from 'react-router-dom';
import { Droplet, Lock, User, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(username, password);
      navigate('/dashboard.html');
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
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
          <p className="text-xs text-slate-500 uppercase font-semibold mt-1">Water Station Sign In</p>
        </div>

        {error && (
          <div className="alert alert-error text-xs p-3 mb-4 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        <form id="auth-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label text-xs font-bold text-slate-600 pb-1">Username or Email</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                name="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input input-bordered input-sm w-full pl-9 bg-slate-50 text-slate-800"
                placeholder="Enter username"
              />
            </div>
          </div>

          <div>
            <label className="label text-xs font-bold text-slate-600 pb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="password"
                name="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input input-bordered input-sm w-full pl-9 bg-slate-50 text-slate-800"
                placeholder="Enter password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary btn-sm w-full font-bold text-white shadow mt-2"
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center mt-6 pt-4 border-t border-slate-100 flex flex-col gap-2">
          <Link
            to="/register"
            data-action="register"
            className="text-xs font-semibold text-secondary hover:underline"
          >
            Need a Customer Account? Register Here
          </Link>
          <Link to="/settings" className="text-[11px] text-slate-400 hover:text-slate-600">
            Configure Server Cluster
          </Link>
        </div>
      </div>
    </div>
  );
};
