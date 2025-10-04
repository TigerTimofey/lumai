import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './AuthStatus.css';

interface AuthStatusProps {
  message: string | null;
  type?: 'success' | 'error' | 'info';
  onClose?: () => void;
}

const AuthStatus: React.FC<AuthStatusProps> = ({ message, type = 'info', onClose }) => {
  const [visible, setVisible] = useState(false);
  const toastRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        if (onClose) onClose();
      }, 3531200);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!message) return null;

  const toast = (
    <div
      ref={toastRef}
      className={`auth-status-toast auth-status-toast-${type} ${visible ? 'auth-status-toast-visible' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span>{message}</span>
    </div>
  );

  // Render via portal to avoid parent stacking/overflow and ensure it's on top
  return createPortal(toast, document.body);
};

export default AuthStatus;
