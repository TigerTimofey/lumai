import React from 'react';
import './ProfileEditor.css';

import type { ProfileSummary } from './profileOptions/types';

interface ProfileCardProps {
    loading: boolean;
    error: string | null;
    profile: ProfileSummary | null;
    user: {
        displayName: string | null;
        email: string | null;
        emailVerified: boolean | null;
        metadata?: { creationTime?: string | null };
    };
    createdAtText: string;
    mode: 'required' | 'bonus';
}

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div>
        <strong>{label}:</strong> {value}
    </div>
);

const MessageRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div>
        <span className="profile-editor-message">{label}:</span> {value}
    </div>
);

const ProfileCard: React.FC<ProfileCardProps> = ({
    loading,
    error,
    profile,
    user,
    createdAtText,
    mode,
}) => {
    if (loading) {
        return (
            <section className="profile-editor-container">
                <h3 className="profile-editor-title">Profile card</h3>
                <div className="profile-editor-body">
                    <p>Loading…</p>
                </div>
            </section>
        );
    }

    if (error) {
        return (
            <section className="profile-editor-container">
                <h3 className="profile-editor-title">Profile card</h3>
                <div className="profile-editor-body">
                    <p className="profile-editor-error">{error}</p>
                </div>
            </section>
        );
    }

    const r = profile?.requiredProfile ?? {};
    // Use additionalProfile for extra data
    interface AdditionalProfile {
        desiredActivityLevel?: string;
        dietaryPreferences?: string[] | string;
        dietaryRestrictions?: string[] | string;
        endurance?: number | string;
        exerciseTypes?: string[] | string;
        fitnessLevel?: string;
        occupationType?: string;
        preferredEnvironment?: string;
        preferredTimeOfDay?: string;
        sessionDuration?: string | number;
        strengthMetrics?: {
            pushUps?: number | string;
            squats?: number | string;
            trainingDaysPerWeek?: number | string;
        };
        [key: string]: unknown;
    }

    const extra = (profile && (profile as unknown as { additionalProfile?: AdditionalProfile }).additionalProfile) ?? {};

    return (
        <section className="profile-editor-container">
            <h3 className="profile-editor-title">Profile card</h3>
            <div className="profile-editor-body">
                <div className="profile-editor-card-info">
                    <InfoRow label="Created" value={createdAtText} />
                    <InfoRow label="Name" value={profile?.displayName ?? user.displayName ?? '—'} />
                    <InfoRow label="Email" value={profile?.email ?? user.email ?? '—'} />
                    <InfoRow
                        label="Email verified"
                        value={(profile?.emailVerified ?? user.emailVerified) ? 'Yes' : 'No'}
                    />
                </div>
                <hr className="profile-editor-divider" />
                <div className="profile-editor-card-info">
                                    {mode === 'required' ? (
                                        <>
                                            <div><strong>Required profile</strong></div>
                                            <MessageRow label="Activity level" value={r.activityLevel ?? '—'} />
                                            <MessageRow label="Age" value={r.age ?? '—'} />
                                            <MessageRow label="Fitness goal" value={r.fitnessGoal ?? '—'} />
                                            <MessageRow label="Gender" value={r.gender ?? '—'} />
                                            <MessageRow label="Height" value={r.height ?? '—'} />
                                            <MessageRow label="Weight" value={r.weight ?? '—'} />
                                        </>
                                    ) : (
                                        <>
                                            <div><strong>Extra data</strong></div>
                                            <MessageRow label="Desired activity level" value={extra.desiredActivityLevel ?? '—'} />
                                            <MessageRow label="Dietary preferences" value={Array.isArray(extra.dietaryPreferences) ? extra.dietaryPreferences.join(', ') : (extra.dietaryPreferences ?? '—')} />
                                            <MessageRow label="Dietary restrictions" value={Array.isArray(extra.dietaryRestrictions) ? extra.dietaryRestrictions.join(', ') : (extra.dietaryRestrictions ?? '—')} />
                                            <MessageRow label="Endurance (minutes)" value={extra.endurance ?? '—'} />
                                            <MessageRow label="Exercise types" value={Array.isArray(extra.exerciseTypes) ? extra.exerciseTypes.join(', ') : (extra.exerciseTypes ?? '—')} />
                                            <MessageRow label="Fitness level" value={extra.fitnessLevel ?? '—'} />
                                            <MessageRow label="Occupation type" value={extra.occupationType ?? '—'} />
                                            <MessageRow label="Preferred environment" value={extra.preferredEnvironment ?? '—'} />
                                            <MessageRow label="Preferred time of day" value={extra.preferredTimeOfDay ?? '—'} />
                                            <MessageRow label="Session duration" value={extra.sessionDuration ?? '—'} />
                                            <MessageRow label="Strength metrics" value={
                                                extra.strengthMetrics
                                                    ? `Push-ups: ${extra.strengthMetrics.pushUps ?? '—'}, Squats: ${extra.strengthMetrics.squats ?? '—'}, Training days/week: ${extra.strengthMetrics.trainingDaysPerWeek ?? '—'}`
                                                    : '—'
                                            } />
                                        </>
                                    )}
                </div>
            </div>
        </section>
    );
};

export default ProfileCard;
