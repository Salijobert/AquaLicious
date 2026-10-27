import React, { useState, useRef } from 'react';
import { useUsers, useCreateUser, useUpdateUser } from '../api/client.js';
import { UserPlus, Shield, UserCheck, UserX } from 'lucide-react';
import { VirtualTableBody, UserSkeletonRow } from '../components/virtual/index.js';

export const UsersPage: React.FC = () => {
  const { data: users, error } = useUsers();
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('Administrator');
  const [modalError, setModalError] = useState<string | null>(null);
  const usersContainerRef = useRef<HTMLDivElement>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    try {
      await createUserMutation.mutateAsync({ name, username, role, active: true });
      setIsCreateOpen(false);
      setName('');
      setUsername('');
      setRole('Administrator');
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
      <div id="page-error" className="text-red-500 text-xs empty:hidden">
        {error ? (error as any).message : ''}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">User Management</h1>
          <p className="text-xs text-slate-500 font-semibold">Administrator & Customer User Accounts</p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="btn btn-primary btn-sm gap-2 font-bold shadow"
        >
          <UserPlus className="w-4 h-4" /> Provision User
        </button>
      </div>

      {/* USERS TABLE */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">👥 User Accounts</span>
          <span className="text-xs text-gray-500">{users?.length || 0} user accounts</span>
        </div>
        <div ref={usersContainerRef} className="overflow-x-auto overflow-y-auto max-h-[500px] rounded-xl border border-gray-100">
          <table>
            <thead className="sticky top-0 bg-gray-50 z-10 shadow-xs">
              <tr>
                <th>User / Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <VirtualTableBody
              items={users}
              containerRef={usersContainerRef}
              rowHeight={56}
              colSpan={6}
              renderRow={(u: any) => (
                <tr key={u.id}>
                  <td>
                    <div className="font-bold text-gray-900">{u.name}</div>
                    <div className="text-[10px] text-gray-400">ID #{u.id}</div>
                  </td>
                  <td className="font-mono text-gray-700">@{u.username}</td>
                  <td>
                    <span
                      className={`badge ${
                        u.role === 'Administrator' ? 'badge-info' : 'badge-warning'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        u.active ? 'badge-success' : 'badge-danger'
                      }`}
                    >
                      {u.active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="text-gray-500">
                    {new Date(u.created_at || Date.now()).toLocaleDateString('en-PH')}
                  </td>
                  <td>
                    <button
                      onClick={() => toggleActive(u)}
                      className={`btn btn-xs ${
                        u.active ? 'btn-danger' : 'btn-primary'
                      }`}
                    >
                      {u.active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              )}
              renderSkeletonRow={(index) => <UserSkeletonRow key={index} />}
              emptyRow={
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    No user accounts found.
                  </td>
                </tr>
              }
            />
          </table>
        </div>
      </div>

      {/* PROVISION USER MODAL */}
      {isCreateOpen && (
        <div className="modal-overlay active">
          <div className="modal aq-modal" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <span className="modal-title">Provision User</span>
              <button className="modal-close" onClick={() => setIsCreateOpen(false)}>
                ✕
              </button>
            </div>
            {modalError && (
              <div className="p-2.5 mb-3 bg-red-50 text-red-600 rounded-lg text-xs border border-red-200">
                {modalError}
              </div>
            )}
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  required
                  className="form-control"
                  placeholder="e.g. Maria Santos"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Username *</label>
                <input
                  required
                  className="form-control"
                  placeholder="e.g. maria_admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Role *</label>
                <select
                  className="form-control"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="Administrator">Administrator (Owner / Manager)</option>
                  <option value="Customer">Customer</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end mt-4 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="btn btn-primary"
                >
                  {createUserMutation.isPending ? 'Provisioning...' : 'Save Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
