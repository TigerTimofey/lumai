import React, { useState } from 'react';

import LogWorkoutModal from './LogWorkoutModal';
import './LogWorkoutTrigger.css';

type LogWorkoutTriggerProps = {
  uid: string;
  currentWeightKg?: number | null;
  onLogged?: () => void;
};

const LogWorkoutTrigger: React.FC<LogWorkoutTriggerProps> = ({ uid, currentWeightKg, onLogged }) => {
  const [open, setOpen] = useState(false);

  const handleClose = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className="log-workout-trigger"
        onClick={() => setOpen(true)}
      >
        Log workout
      </button>
      <LogWorkoutModal
        open={open}
        onClose={handleClose}
        uid={uid}
        currentWeightKg={currentWeightKg}
        onSaved={() => {
          onLogged?.();
        }}
      />
    </>
  );
};

export default LogWorkoutTrigger;
