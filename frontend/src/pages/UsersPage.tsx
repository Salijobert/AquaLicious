import React, { useState, useRef } from 'react';
import { Modal } from '../components/Modal.js';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { UserPlus, Shield, UserCheck, UserX, Trash2, AlertTriangle } from 'lucide-react';
import { VirtualTableBody, UserSkeletonRow } from '../components/virtual/index.js';
import { AdminPageHeader } from '../components/AdminPageHeader.js';

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { data: users, error } = useUsers();
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const deleteUserMutation = useDeleteUser();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('Administrator');
  const [search, setSearch] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const usersContainerRef = useRef<HTMLDivElement>(null);

  const filteredUsers = React.useMemo(() => {
    if (!users) return [];
    if (!search.trim()) return users;
    const q = search.toLowerCase().trim();
    return users.filter(
      (u: any) =>
        u.name?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        String(u.id).includes(q)
    );
  }, [users, search]);

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

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;
    setDeleteError(null);
    try {
      const res = await deleteUserMutation.mutateAsync(userToDelete.id);
      setDeleteSuccess(res.message || 'User successfully removed');
      setUserToDelete(null);
      setTimeout(() => setDeleteSuccess(null), 5000);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to remove user');
    }
  };

  return (
    <div className="page-content space-y-6">
      <div id="page-error" className="text-red-500 text-xs empty:hidden">
        {error ? (error as any).message : ''}
      </div>

      <AdminPageHeader
        title="Users"
        subtitle="Manage customer profiles, roles, and account verification statuses."
        actions={
          <button
            onClick={() => setIsCreateOpen(true)}
            className="btn btn-primary btn-sm gap-2 font-bold shadow"
          >
            <UserPlus className="w-4 h-4" /> Provision User
          </button>
        }
      />

      {deleteSuccess && (
        <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 text-xs font-semibold flex items-center justify-between shadow-xs">
          <span>✓ {deleteSuccess}</span>
          <button onClick={() => setDeleteSuccess(null)} className="text-emerald-600 hover:text-emerald-900 font-bold ml-2">✕</button>
        </div>
      )}

      {/* USERS TABLE */}
      <div className="card">
        <div className="card-header flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="card-title">👥 User Accounts</span>
            <span className="text-xs text-gray-500">
              {search.trim() ? `${filteredUsers.length} of ${users?.length || 0}` : (users?.length || 0)} user accounts
            </span>
          </div>
          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="Search by name, username, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-[#1565c0]"
            />
          </div>
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
              items={filteredUsers}
              containerRef={usersContainerRef}
              rowHeight={56}
              colSpan={6}
              renderRow={(u: any) => (
                <tr key={u.id}>
                  <td>
                    <div className="font-bold text-gray-900">{u.name}</div>
                    {u.email && (
                      <div className="text-[11px] text-gray-500 font-normal">{u.email}</div>
                    )}
                    <div className="text-[10px] text-gray-400">ID #{u.id}</div>
                  </td>
                  <td className="font-mono text-gray-700">{u.username}</td>
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
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleActive(u)}
                        className={`btn btn-xs ${
                          u.active ? 'btn-danger' : 'btn-primary'
                        }`}
                      >
                        {u.active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => {
                          setDeleteError(null);
                          setUserToDelete(u);
                        }}
                        className="btn btn-xs btn-outline border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
                        title="Delete or Anonymize Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        size="md"
        maxWidth="440px"
        title="Provision User"
        closeAriaLabel="Close provision user modal"
      >
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
      </Modal>

      {/* DELETE / ANONYMIZE USER CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(userToDelete)}
        onClose={() => {
          setUserToDelete(null);
          setDeleteError(null);
        }}
        size="md"
        maxWidth="480px"
        headerVariant="danger"
        disableClose={deleteUserMutation.isPending}
        closeAriaLabel="Close remove user modal"
        icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
        title="Remove User Account"
        bodyClassName="space-y-4 text-xs"
      >
        {userToDelete && (
          <>
              {deleteError && (
                <div className="p-2.5 bg-red-50 text-red-600 rounded-lg border border-red-200 font-semibold">
                  {deleteError}
                </div>
              )}

              <p className="text-gray-700 leading-relaxed">
                Are you sure you want to remove user account <strong className="text-gray-900 font-mono">#{userToDelete.id}</strong> (<em>{userToDelete.username}</em>)?
              </p>

              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-amber-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  Data Retention & Privacy Notice:
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800">
                  <li>If this account has orders, sales, or stock history, personal information will be <strong>anonymized</strong> ("Removed user") to preserve accounting and ledger integrity.</li>
                  <li>If this account has no transactional history, it will be <strong>permanently purged</strong> from both the database and Firebase Auth.</li>
                  <li>An administrator cannot delete their own account or the last administrator.</li>
                </ul>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setUserToDelete(null);
                    setDeleteError(null);
                  }}
                  disabled={deleteUserMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={deleteUserMutation.isPending}
                  className="btn btn-danger font-bold flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleteUserMutation.isPending ? 'Processing...' : 'Confirm Removal'}
                </button>
              </div>
          </>
        )}
      </Modal>
    </div>
  );
};
