import React, { useState } from 'react';
import { useUsers, useCreateUser, useUpdateUser } from '../api/client.js';
import { Users, UserPlus, Shield, UserCheck, UserX } from 'lucide-react';

export const UsersPage: React.FC = () => {
  const { data: users, isLoading, error } = useUsers();
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('Staff');
  const [modalError, setModalError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    try {
      await createUserMutation.mutateAsync({ name, username, role, active: true });
      setIsCreateOpen(false);
      setName('');
      setUsername('');
      setRole('Staff');
    } catch (err: any) {
      setModalError(err.message || 'Failed to create user');
    }
  };

  const toggleActive = async (user: any) => {
    try {
      await updateUserMutation.mutateAsync({
        id: user.id,
        active: user.active ? 0 : 1
      });
    } catch (err: any) {
      alert(err.message || 'Cannot toggle user active state');
    }
  };

  return (
    <div className="page-content space-y-6">
      <div id="page-error" className="text-error text-xs empty:hidden">
        {error ? (error as any).message : ''}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">User Management</h1>
          <p className="text-xs text-slate-500 font-semibold">Administrator & Staff Role Provisioning</p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="btn btn-primary btn-sm gap-2 font-bold shadow"
        >
          <UserPlus className="w-4 h-4" /> Provision Employee
        </button>
      </div>

      <div className="card bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="overflow-x-auto">
          <table className="table table-sm text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u: any) => (
                <tr key={u.id} className="hover">
                  <td className="font-bold text-slate-800">{u.name}</td>
                  <td className="font-mono text-slate-500">{u.username}</td>
                  <td>
                    <span
                      className={`badge badge-sm font-bold ${
                        u.role === 'Administrator'
                          ? 'badge-primary text-white'
                          : u.role === 'Staff'
                          ? 'badge-secondary text-primary'
                          : 'badge-ghost'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge badge-xs font-semibold ${
                        u.active ? 'badge-success text-white' : 'badge-error text-white'
                      }`}
                    >
                      {u.active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="text-slate-400">
                    {new Date(u.created_at).toLocaleDateString('en-PH')}
                  </td>
                  <td>
                    <button
                      onClick={() => toggleActive(u)}
                      className={`btn btn-xs ${u.active ? 'btn-ghost text-error' : 'btn-ghost text-success'}`}
                    >
                      {u.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateOpen && (
        <dialog open className="modal modal-open z-50">
          <div className="modal-box bg-white text-slate-800 max-w-sm p-6 rounded-2xl shadow-2xl">
            <h3 className="font-bold text-lg text-primary mb-2">Provision Employee</h3>
            <p className="text-xs text-slate-500 mb-4">
              Create an operational Staff or Administrator account.
            </p>

            {modalError && (
              <div className="alert alert-error text-xs p-2 mb-3">
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="label font-bold pb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
                  placeholder="e.g. Maria Santos"
                />
              </div>

              <div>
                <label className="label font-bold pb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input input-bordered input-sm w-full bg-slate-50 text-slate-800"
                  placeholder="e.g. maria_cashier"
                />
              </div>

              <div>
                <label className="label font-bold pb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="select select-bordered select-sm w-full bg-slate-50 text-slate-800"
                >
                  <option value="Staff">Staff (POS & Inventory Checks)</option>
                  <option value="Administrator">Administrator (Full Access)</option>
                </select>
              </div>

              <div className="modal-action flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="btn btn-primary btn-sm font-bold"
                >
                  {createUserMutation.isPending ? 'Provisioning...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}
    </div>
  );
};
