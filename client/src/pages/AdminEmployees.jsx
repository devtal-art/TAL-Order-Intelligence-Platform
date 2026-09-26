import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { employeeService } from '../services/employeeService.js';

// Admin Portal — Manage Employees (new, additive). Admin-only (gated by
// ProtectedRoute's adminOnly prop in App.jsx). Reuses the existing dl-* list
// classes (dash-widgets.css) and the shared .modal-* chrome (review-screen.css)
// so the screen looks and behaves like every other list/modal in the app.
export default function AdminEmployees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // employee having their name/access edited
  const [deleteTarget, setDeleteTarget] = useState(null); // employee being confirmed for delete
  const [resetTarget, setResetTarget] = useState(null); // employee having their password reset
  const [busyId, setBusyId] = useState('');

  // Deleted Employees section — loaded separately from the active list above
  // (different endpoint, own loading/error state) so one failing never blocks
  // the other from rendering.
  const [deletedEmployees, setDeletedEmployees] = useState([]);
  const [loadingDeleted, setLoadingDeleted] = useState(true);
  const [errorDeleted, setErrorDeleted] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    employeeService
      .list()
      .then((r) => setEmployees(r.data || []))
      .catch((e) => setError(e.message || 'Could not load employees.'))
      .finally(() => setLoading(false));
  };

  const loadDeleted = () => {
    setLoadingDeleted(true);
    setErrorDeleted('');
    employeeService
      .listDeleted()
      .then((r) => setDeletedEmployees(r.data || []))
      .catch((e) => setErrorDeleted(e.message || 'Could not load deleted employees.'))
      .finally(() => setLoadingDeleted(false));
  };

  useEffect(load, []);
  useEffect(loadDeleted, []);

  const toggleDisabled = async (employee) => {
    setBusyId(employee.id);
    setError('');
    try {
      const updated = await employeeService.setDisabled(employee.id, !employee.disabled);
      setEmployees((list) => list.map((e) => (e.id === employee.id ? updated : e)));
    } catch (e) {
      setError(e.message || `Could not update ${employee.name}.`);
    } finally {
      setBusyId('');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setError('');
    try {
      const { reassignedOrders } = await employeeService.remove(deleteTarget.id);
      setEmployees((list) => list.filter((e) => e.id !== deleteTarget.id));
      setNotice(
        reassignedOrders > 0
          ? `${deleteTarget.name} was deleted. ${reassignedOrders} order${reassignedOrders === 1 ? '' : 's'} transferred to Chat Team.`
          : `${deleteTarget.name} was deleted.`
      );
      setDeleteTarget(null);
      loadDeleted(); // the just-deleted employee now belongs in this section
    } catch (e) {
      setError(e.message || `Could not delete ${deleteTarget.name}.`);
    } finally {
      setBusyId('');
    }
  };

  return (
    <Layout>
      <div className="screen active" id="s-admin-employees">
        <div className="dl-head">
          <h2 className="dl-title">
            <span className="os-badge os-released">Admin Portal</span>
            Manage Employees
          </h2>
          {!loading && <span className="dl-total">{employees.length} employee{employees.length === 1 ? '' : 's'}</span>}
          <button className="sol-btn" type="button" onClick={() => setShowAdd(true)} style={{ marginLeft: 'auto' }}>
            + Add Employee
          </button>
        </div>

        {error && <div className="sol-error">{error}</div>}
        {notice && <div className="ae-notice">{notice}</div>}

        {loading ? (
          <div className="dw-loading">Loading employees…</div>
        ) : employees.length === 0 ? (
          <div className="dl-empty">No employees yet. Add one to get started.</div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Access</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <td>{emp.name}</td>
                    <td>
                      <span className={`os-badge ${emp.permission === 'edit' ? 'os-released' : 'os-hold'}`}>
                        {emp.permission === 'edit' ? 'Editable' : 'View Only'}
                      </span>
                    </td>
                    <td>
                      <span className={`os-badge ${emp.disabled ? 'os-cancelled' : 'os-released'}`}>
                        {emp.disabled ? 'Disabled' : 'Enabled'}
                      </span>
                    </td>
                    <td>{emp.createdAt ? new Date(emp.createdAt).toLocaleDateString() : '—'}</td>
                    <td className="dl-act">
                      <button
                        className="sol-edit-btn"
                        type="button"
                        onClick={() => setEditTarget(emp)}
                        disabled={busyId === emp.id}
                      >
                        Edit
                      </button>{' '}
                      <button
                        className="sol-edit-btn"
                        type="button"
                        onClick={() => toggleDisabled(emp)}
                        disabled={busyId === emp.id}
                      >
                        {busyId === emp.id ? '…' : emp.disabled ? 'Enable' : 'Disable'}
                      </button>{' '}
                      <button
                        className="sol-edit-btn"
                        type="button"
                        onClick={() => setResetTarget(emp)}
                        disabled={busyId === emp.id}
                      >
                        Reset Password
                      </button>{' '}
                      <button
                        className="ae-delete-btn"
                        type="button"
                        onClick={() => setDeleteTarget(emp)}
                        disabled={busyId === emp.id}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deleted Employees (Admin Portal — additive). These accounts can no
          longer log in and don't count toward the active list above, but
          their processed orders weren't erased — Delete reassigns them to
          Chat Team while preserving the original name (Order.
          processed_by_original), which the order detail view shows struck
          through. This section is where an admin finds who used to process
          a given order after that employee is gone. */}
      <div className="screen active" id="s-admin-employees-deleted" style={{ marginTop: 32 }}>
        <div className="dl-head">
          <h2 className="dl-title">
            <span className="os-badge os-cancelled">Deleted</span>
            Deleted Employees
          </h2>
          {!loadingDeleted && (
            <span className="dl-total">
              {deletedEmployees.length} employee{deletedEmployees.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {errorDeleted && <div className="sol-error">{errorDeleted}</div>}

        {loadingDeleted ? (
          <div className="dw-loading">Loading deleted employees…</div>
        ) : deletedEmployees.length === 0 ? (
          <div className="dl-empty">No deleted employees.</div>
        ) : (
          <div className="dl-table-wrap">
            <table className="dl-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Deleted On</th>
                  <th>Orders Reassigned to Chat Team</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {deletedEmployees.map((emp) => (
                  <tr key={emp.id}>
                    <td>{emp.name}</td>
                    <td>{emp.deletedAt ? new Date(emp.deletedAt).toLocaleDateString() : '—'}</td>
                    <td className="dl-num">{emp.reassignedOrders}</td>
                    <td className="dl-act">
                      {emp.reassignedOrders > 0 ? (
                        <Link
                          className="sol-edit-btn"
                          style={{ textDecoration: 'none' }}
                          to={`/dashboard/orders?type=processorOriginal&value=${encodeURIComponent(emp.name)}`}
                        >
                          View Orders
                        </Link>
                      ) : (
                        <span className="dl-muted">No orders</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddEmployeeModal
          onClose={() => setShowAdd(false)}
          onCreated={(employee) => {
            setEmployees((list) => [...list, employee].sort((a, b) => a.name.localeCompare(b.name)));
            setShowAdd(false);
          }}
        />
      )}

      {editTarget && (
        <EditEmployeeModal
          employee={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setEmployees((list) =>
              list.map((e) => (e.id === editTarget.id ? updated : e)).sort((a, b) => a.name.localeCompare(b.name))
            );
            setEditTarget(null);
            setNotice(
              updated.name !== editTarget.name
                ? `Renamed ${editTarget.name} to ${updated.name}. Their orders and activity log now show the new name.`
                : `${updated.name}'s details were updated.`
            );
          }}
        />
      )}

      {deleteTarget && (
        <DeleteEmployeeModal
          employee={deleteTarget}
          busy={busyId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          employee={resetTarget}
          onClose={() => setResetTarget(null)}
          onReset={() => {
            setResetTarget(null);
            setNotice(`${resetTarget.name}'s password was reset.`);
          }}
        />
      )}
    </Layout>
  );
}

function AddEmployeeModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [permission, setPermission] = useState('edit');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const employee = await employeeService.create({ name: name.trim(), password, permission });
      onCreated(employee);
    } catch (e) {
      setFormError(e.message || 'Could not create the employee. Please try again.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add employee" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-heads">
            <div className="modal-title">Add Employee</div>
            <div className="modal-sub">Create a new login for the team.</div>
          </div>
          <button className="modal-x" type="button" onClick={onClose} aria-label="Close add employee">
            ×
          </button>
        </div>

        <form className="apm-form" onSubmit={submit}>
          <label className="apm-field">
            <span>Name</span>
            <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          </label>
          <label className="apm-field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
          </label>
          <div className="apm-field">
            <span>Access</span>
            <div className="ae-radio-group">
              <label className="ae-radio">
                <input
                  type="radio"
                  name="permission"
                  value="edit"
                  checked={permission === 'edit'}
                  onChange={() => setPermission('edit')}
                  disabled={busy}
                />
                Editable — can process orders
              </label>
              <label className="ae-radio">
                <input
                  type="radio"
                  name="permission"
                  value="view"
                  checked={permission === 'view'}
                  onChange={() => setPermission('view')}
                  disabled={busy}
                />
                View only — cannot process orders
              </label>
            </div>
          </div>

          {formError && <div className="apm-error">{formError}</div>}

          <div className="apm-actions">
            <button className="apm-cancel" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="sol-btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function EditEmployeeModal({ employee, onClose, onSaved }) {
  const [name, setName] = useState(employee.name);
  const [permission, setPermission] = useState(employee.permission);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Name is required.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const updated = await employeeService.update(employee.id, { name: trimmed, permission });
      onSaved(updated);
    } catch (e) {
      setFormError(e.message || `Could not update ${employee.name}. Please try again.`);
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Edit employee" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-heads">
            <div className="modal-title">Edit {employee.name}</div>
            <div className="modal-sub">Renaming updates their name everywhere it's used — orders, activity log, and login.</div>
          </div>
          <button className="modal-x" type="button" onClick={onClose} aria-label="Close edit employee">
            ×
          </button>
        </div>

        <form className="apm-form" onSubmit={submit}>
          <label className="apm-field">
            <span>Name</span>
            <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          </label>
          <div className="apm-field">
            <span>Access</span>
            <div className="ae-radio-group">
              <label className="ae-radio">
                <input
                  type="radio"
                  name="edit-permission"
                  value="edit"
                  checked={permission === 'edit'}
                  onChange={() => setPermission('edit')}
                  disabled={busy}
                />
                Editable — can process orders
              </label>
              <label className="ae-radio">
                <input
                  type="radio"
                  name="edit-permission"
                  value="view"
                  checked={permission === 'view'}
                  onChange={() => setPermission('view')}
                  disabled={busy}
                />
                View only — cannot process orders
              </label>
            </div>
          </div>

          {formError && <div className="apm-error">{formError}</div>}

          <div className="apm-actions">
            <button className="apm-cancel" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="sol-btn" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function ResetPasswordModal({ employee, onClose, onReset }) {
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await employeeService.resetPassword(employee.id, password);
      onReset();
    } catch (e) {
      setFormError(e.message || `Could not reset ${employee.name}'s password. Please try again.`);
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Reset password" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-heads">
            <div className="modal-title">Reset Password</div>
            <div className="modal-sub">New password for {employee.name}.</div>
          </div>
          <button className="modal-x" type="button" onClick={onClose} aria-label="Close reset password">
            ×
          </button>
        </div>

        <form className="apm-form" onSubmit={submit}>
          <label className="apm-field">
            <span>New Password</span>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>

          {formError && <div className="apm-error">{formError}</div>}

          <div className="apm-actions">
            <button className="apm-cancel" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="sol-btn" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Reset Password'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function DeleteEmployeeModal({ employee, busy, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Delete employee" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-heads">
            <div className="modal-title">Delete {employee.name}?</div>
            <div className="modal-sub">This can't be undone.</div>
          </div>
          <button className="modal-x" type="button" onClick={onCancel} aria-label="Cancel delete">
            ×
          </button>
        </div>

        <div className="apm-form">
          <div className="apm-error">
            Deleting {employee.name} will transfer all of their processed orders to <b>Chat Team</b>, and they will
            no longer be able to log in.
          </div>
          <div className="apm-actions">
            <button className="apm-cancel" type="button" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button className="ae-delete-btn ae-delete-btn--confirm" type="button" onClick={onConfirm} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete Employee'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
