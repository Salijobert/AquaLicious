import React, { useState } from 'react';
import { resolver, ServerNode, EXPECTED_CLUSTER_ID } from '../api/multiServerResolver.js';
import { Server, CheckCircle2, XCircle, RefreshCw, Plus, ShieldCheck } from 'lucide-react';

export const ServerSettingsPage: React.FC = () => {
  const [servers, setServers] = useState<ServerNode[]>(resolver.getServers());
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const checkNodes = async () => {
    setIsChecking(true);
    setStatusMessage('Checking cluster nodes health...');
    const updated = await Promise.all(
      servers.map(async (s) => {
        const start = Date.now();
        const valid = await resolver.verifyCluster(s.url);
        const latency = Date.now() - start;
        return {
          ...s,
          status: valid ? ('online' as const) : ('offline' as const),
          latencyMs: valid ? latency : undefined
        };
      })
    );
    setServers(updated);
    resolver.setServers(updated);
    setIsChecking(false);
    setStatusMessage('Cluster health check complete.');
  };

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) return;

    let cleanUrl = newUrl.trim().replace(/\/$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `http://${cleanUrl}`;
    }

    const isValid = await resolver.verifyCluster(cleanUrl);
    if (!isValid) {
      alert(`Server ${cleanUrl} failed cluster verification! Expected cluster ID: ${EXPECTED_CLUSTER_ID}`);
      return;
    }

    const newNode: ServerNode = {
      url: cleanUrl,
      label: newLabel.trim() || `Node (${cleanUrl})`,
      isPrimary: servers.length === 0,
      status: 'online'
    };

    const updated = [...servers, newNode];
    setServers(updated);
    resolver.setServers(updated);
    setNewUrl('');
    setNewLabel('');
  };

  const removeServer = (url: string) => {
    if (servers.length <= 1) {
      alert('Must retain at least one configured cluster node.');
      return;
    }
    const updated = servers.filter((s) => s.url !== url);
    setServers(updated);
    resolver.setServers(updated);
  };

  return (
    <div className="page-content space-y-6">
      <div id="page-error" className="text-error text-xs empty:hidden"></div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Multi-Server Resolver</h1>
          <p className="text-xs text-slate-500 font-semibold">Cluster Endpoint Routing, Verification & Automatic Failover</p>
        </div>

        <button
          onClick={checkNodes}
          disabled={isChecking}
          className="btn btn-outline btn-sm gap-2 font-bold"
        >
          <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          Verify Cluster Nodes
        </button>
      </div>

      <div className="card bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 p-4 bg-slate-50 border rounded-xl mb-6">
          <ShieldCheck className="w-8 h-8 text-secondary flex-shrink-0" />
          <div className="text-xs">
            <div className="font-bold text-slate-800">Authoritative Cluster Enforced: <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-primary font-bold">{EXPECTED_CLUSTER_ID}</code></div>
            <p className="text-slate-500 mt-0.5">
              The custom resolver automatically validates all cluster members before allowing transaction routing. Failover preserves idempotency keys and prevents split-brain writes against untrusted or independent databases.
            </p>
          </div>
        </div>

        {statusMessage && (
          <div className="alert alert-info text-xs p-2 mb-4 text-white font-semibold">
            <span>{statusMessage}</span>
          </div>
        )}

        <div className="overflow-x-auto mb-6">
          <table className="table table-sm text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th>Node Label</th>
                <th>API Endpoint URL</th>
                <th>Cluster Status</th>
                <th>Latency</th>
                <th>Role</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.url} className="hover">
                  <td className="font-bold text-slate-800">{s.label}</td>
                  <td className="font-mono text-primary">{s.url}</td>
                  <td>
                    <span
                      className={`badge badge-sm font-bold gap-1 ${
                        s.status === 'online'
                          ? 'badge-success text-white'
                          : s.status === 'offline'
                          ? 'badge-error text-white'
                          : 'badge-ghost'
                      }`}
                    >
                      {s.status === 'online' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {s.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="text-slate-500 font-mono">
                    {s.latencyMs !== undefined ? `${s.latencyMs} ms` : '-'}
                  </td>
                  <td>
                    {s.url === resolver.getActiveServer() ? (
                      <span className="badge badge-primary badge-xs text-white font-bold">ACTIVE</span>
                    ) : (
                      <span className="badge badge-outline badge-xs text-slate-400">STANDBY</span>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => removeServer(s.url)}
                      className="btn btn-ghost btn-xs text-error font-bold"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Node Form */}
        <div className="border-t pt-4">
          <h3 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Register Failover Node
          </h3>
          <form onSubmit={handleAddServer} className="flex flex-col sm:flex-row gap-2 text-xs">
            <input
              type="text"
              placeholder="Node Label (e.g. Backup Node 2)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="input input-bordered input-sm flex-1 bg-slate-50 text-slate-800"
            />
            <input
              type="text"
              placeholder="http://192.168.1.50:8088"
              required
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="input input-bordered input-sm flex-1 font-mono bg-slate-50 text-slate-800"
            />
            <button type="submit" className="btn btn-primary btn-sm font-bold">
              Add & Verify Node
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
