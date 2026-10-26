import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { useNavigate, Link } from 'react-router-dom';
import { Droplet, Lock, User, AlertCircle, ShieldCheck, Truck, Clock } from 'lucide-react';

export const LandingPage: React.FC = () => {
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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="navbar bg-primary text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2">
          <Droplet className="w-8 h-8 text-secondary fill-secondary" />
          <span className="text-2xl font-black tracking-wider">AQUALICIOUS</span>
        </div>
        <div className="flex gap-3">
          <Link to="/register" className="btn btn-sm btn-secondary text-primary font-bold">
            Customer Register
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 flex-1 flex flex-col lg:flex-row items-center justify-between gap-12">
        {/* Left Hero */}
        <div className="lg:w-1/2 text-left">
          <div className="badge badge-secondary badge-outline font-bold mb-3">Pure · Safe · Refreshed</div>
          <h1 className="text-4xl sm:text-5xl font-black text-slate-900 leading-tight mb-4">
            Smart Water Station Management & POS
          </h1>
          <p className="text-slate-600 text-sm sm:text-base mb-6 leading-relaxed">
            Multi-barrier water purification platform with real-time inventory monitoring, atomic POS sales recording, reorder alerts, and mobile ordering.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
              <ShieldCheck className="w-6 h-6 text-secondary mb-1" />
              <div className="font-bold text-xs text-slate-800">Atomic Concurrency</div>
              <div className="text-[11px] text-slate-500">Row-locked POS transactions</div>
            </div>
            <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
              <Clock className="w-6 h-6 text-primary mb-1" />
              <div className="font-bold text-xs text-slate-800">Dynamic ROP Engine</div>
              <div className="text-[11px] text-slate-500">7-day usage & lead time alerts</div>
            </div>
          </div>
        </div>

        {/* Right Auth Card */}
        <div className="card w-full max-w-md bg-white shadow-xl rounded-2xl border border-slate-200 p-8">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-2">
              <Droplet className="w-10 h-10 text-secondary fill-secondary" />
            </div>
            <h2 className="text-xl font-black text-primary tracking-wider">Station Sign In</h2>
            <p className="text-xs text-slate-400 font-semibold mt-1">Access Station Management or POS</p>
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
      </main>

      <footer className="bg-primary text-slate-400 text-center py-4 text-xs border-t border-slate-800">
        © 2026 AquaLicious Water Refilling Station. All rights reserved.
      </footer>
    </div>
  );
};
