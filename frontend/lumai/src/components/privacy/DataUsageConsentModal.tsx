import { useEffect, useRef, useState } from 'react';
import './DataUsageConsentModal.css';

interface DataUsageConsentModalProps {
  mode: 'pending' | 'declined' | 'loading';
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onReview: () => void;
  isSubmitting?: boolean;
  error?: string | null;
}

const DataUsageConsentModal = ({
  mode,
  open,
  onAccept,
  onDecline,
  onReview,
  isSubmitting = false,
  error = null
}: DataUsageConsentModalProps) => {
  const [hasScrolledDetails, setHasScrolledDetails] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const detailsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (mode !== 'pending') {
      setHasScrolledDetails(false);
      setAcknowledged(false);
      return;
    }
    setHasScrolledDetails(false);
    setAcknowledged(false);
    if (detailsRef.current) {
      detailsRef.current.scrollTop = 0;
    }
  }, [mode, open]);

  if (!open) {
    return null;
  }

  const shouldDisableAcknowledge = !hasScrolledDetails;
  const acceptDisabled = !acknowledged;

  return (
    <div className="data-consent-backdrop" role="presentation">
      <div
        className="data-consent-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-consent-title"
      >
        <header className="data-consent-header">
          <span className="data-consent-badge" aria-hidden>🔒</span>
          <h2 id="data-consent-title">Lumai Data Usage Consent</h2>
          <p className="data-consent-subtitle">
            We care about privacy. Please review the practices below so you can decide how you would
            like to proceed.
          </p>
        </header>

        {mode === 'loading' ? (
          <div className="data-consent-loading" aria-busy="true">
            <span className="data-consent-spinner" aria-hidden />
            <p>Checking your current consent status…</p>
          </div>
        ) : mode === 'pending' ? (
          <>
            <div
              className="data-consent-details"
              onScroll={(event) => {
                const target = event.currentTarget;
                if (target.scrollTop + target.clientHeight >= target.scrollHeight - 16) {
                  setHasScrolledDetails(true);
                }
              }}
              ref={detailsRef}
            >
              <section>
                <h3>Data we collect</h3>
                <ul>
                  <li>Account details such as your name, email, and authentication metadata.</li>
                  <li>
                    Wellness inputs you log (habits, workouts, and goals) to power personalized
                    insights.
                  </li>
                  <li>App usage telemetry (session timestamps, device type, feature engagement).</li>
                </ul>
              </section>

              <section>
                <h3>How we use your data</h3>
                <ul>
                  <li>To provide tailored coaching prompts and AI-driven recommendations.</li>
                  <li>To maintain secure sessions, detect suspicious activity, and prevent abuse.</li>
                  <li>To improve the Lumai experience by studying aggregated, de-identified trends.</li>
                </ul>
              </section>

              <section>
                <h3>Your choices</h3>
                <ul>
                  <li>You can export or delete your account data at any time from the privacy settings.</li>
                  <li>
                    You may withdraw consent by declining below, which will end your current session.
                  </li>
                  <li>
                    Questions? Contact the Lumai privacy team at{' '}
                    <a href="mailto:privacy@lumai.ai">privacy@lumai.ai</a>.
                  </li>
                </ul>
              </section>
            </div>

            <div className="data-consent-acknowledgement">
              <label>
                <input
                  type="checkbox"
                  disabled={shouldDisableAcknowledge}
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>
                  I have read and understand how Lumai collects and uses my data for this experience.
                </span>
              </label>
            </div>

            <div className="data-consent-actions">
              <button
                type="button"
                className="data-consent-decline"
                onClick={onDecline}
                disabled={isSubmitting}
              >
                Decline and sign out
              </button>
              <button
                type="button"
                className="data-consent-accept"
                onClick={onAccept}
                disabled={acceptDisabled || isSubmitting}
              >
                Accept and continue
              </button>
            </div>
          </>
        ) : (
          <div className="data-consent-declined">
            <p>
              You have declined data usage consent, so we have ended your session. Without minimal data
              collection we cannot deliver personalized wellness insights.
            </p>
            <p>
              If you change your mind you can review the full statement again. Otherwise you can close
              this window securely.
            </p>
            <div className="data-consent-actions">
              <button
                type="button"
                className="data-consent-secondary"
                onClick={onReview}
                disabled={isSubmitting}
              >
                Review consent again
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="data-consent-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

export default DataUsageConsentModal;
