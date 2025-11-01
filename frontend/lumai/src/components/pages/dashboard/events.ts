export const DASHBOARD_LOG_WORKOUT_EVENT = 'dashboard:log-workout';

export const dispatchLogWorkoutEvent = () => {
  window.dispatchEvent(new CustomEvent(DASHBOARD_LOG_WORKOUT_EVENT));
};
