import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { helpService } from '../services/helpService.js';

const MESSAGE_MAX_LENGTH = 3000;

// Fixed, always-available "contact the team" entry point (new, additive).
// Rendered once from Layout.jsx, so it appears on every protected page.
// Sends the logged-in user's message to the team via the server's Brevo
// integration — the sender's NAME comes from the JWT (useAuth), never typed
// by the user, so it can't be spoofed.
export default function HelpButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const close = () => {
    setOpen(false);
    setMessage('');
    setSending(false);
    setError('');
    setSent(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close() is stable enough for this
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    setSending(true);
    setError('');
    try {
      await helpService.send(trimmed);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send your message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <button type="button" className="help-fab" onClick={() => setOpen(true)} aria-label="Help — contact the team">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.8-2.4 2.1-2.4 3.6" />
          <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
        </svg>
        <span>Help</span>
      </button>

      {open &&
        createPortal(
          <div className="modal-overlay" onClick={close}>
            <div
              className="modal help-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Contact the team"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-head">
                <div className="modal-heads">
                  <div className="modal-title">Contact the team</div>
                  <div className="modal-sub">Sent as {user.name}</div>
                </div>
                <button className="modal-x" type="button" onClick={close} aria-label="Close">
                  ×
                </button>
              </div>

              <div className="help-modal-body">
                {sent ? (
                  <div className="help-sent">
                    <div className="help-sent-title">Message sent</div>
                    <div className="help-sent-sub">The team will get back to you.</div>
                    <button type="button" className="sol-btn" onClick={close}>
                      Close
                    </button>
                  </div>
                ) : (
                  <form onSubmit={submit}>
                    <textarea
                      className="help-textarea"
                      rows={6}
                      maxLength={MESSAGE_MAX_LENGTH}
                      placeholder="Describe your question or issue…"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      aria-label="Message"
                      autoFocus
                      disabled={sending}
                    />
                    {error && <div className="sol-error">{error}</div>}
                    <div className="help-modal-actions">
                      <button type="button" className="sol-edit-btn" onClick={close} disabled={sending}>
                        Cancel
                      </button>
                      <button type="submit" className="sol-btn" disabled={sending || !message.trim()}>
                        {sending ? 'Sending…' : 'Submit'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
