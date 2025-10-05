import React from 'react';
import './ToggleSwitch.css';

interface ToggleSwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, label, id, disabled, ...rest }) => {
  const autoId = React.useId();
  const switchId = id ?? autoId;
  return (
    <div className="cl-toggle-switch">
      <label htmlFor={switchId} className="cl-switch" aria-label={label}>
        <input
          id={switchId}
          role="switch"
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          {...rest}
        />
        <span aria-hidden="true" />
      </label>
    </div>
  );
};

export default ToggleSwitch;
