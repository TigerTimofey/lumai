import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import './ProfileEditor.css';

import { db } from '../../../config/firebase';
import type {
    AdditionalProfile,
    FirestoreUser,
    ProfileSummary,
    RequiredProfile,
} from './profileOptions/types';

interface ProfileCardProps {
    loading: boolean;
    error: string | null;
    profile: ProfileSummary | null;
    user: {
        uid: string;
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

const MessageRow: React.FC<{ label: string; value: React.ReactNode; completed?: boolean }> = ({ label, value, completed }) => (
    <div className="profile-card-row">
        <span className="profile-card-label">
            {typeof completed === 'boolean' && (
                <span
                    className={`profile-card-check ${completed ? 'profile-card-check-complete' : 'profile-card-check-missing'}`}
                    title={completed ? 'Provided' : 'Missing'}
                    aria-hidden="true"
                >
                    {completed ? '\u2713' : '\u2717'}
                </span>
            )}
            <span className="profile-card-label-text">{label}</span>
        </span>
        <span className="profile-card-value">{value}</span>
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
    const [firestoreProfile, setFirestoreProfile] = useState<FirestoreUser | null>(null);
    const [firestoreLoading, setFirestoreLoading] = useState(true);
    const [firestoreError, setFirestoreError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        if (!user.uid) {
            setFirestoreProfile(null);
            setFirestoreLoading(false);
            setFirestoreError('User ID missing');
            return () => {
                active = false;
            };
        }

        setFirestoreLoading(true);
        setFirestoreError(null);

        const ref = doc(db, 'users', user.uid);
        const unsubscribe = onSnapshot(
            ref,
            (snapshot) => {
                if (!active) return;
                if (snapshot.exists()) {
                    setFirestoreProfile(snapshot.data() as FirestoreUser);
                } else {
                    setFirestoreProfile(null);
                }
                setFirestoreLoading(false);
            },
            (err) => {
                if (!active) return;
                setFirestoreError(err.message ?? String(err));
                setFirestoreLoading(false);
            }
        );

        return () => {
            active = false;
            unsubscribe();
        };
    }, [user.uid]);

    const combinedError = error ?? firestoreError;
    const combinedLoading = loading || firestoreLoading;

    if (combinedLoading) {
        return (
            <section className="profile-editor-container">
                <h3 className="profile-editor-title">Profile card</h3>
                <div className="profile-editor-body">
                    <p>Loading…</p>
                </div>
            </section>
        );
    }

    if (combinedError) {
        return (
            <section className="profile-editor-container">
                <h3 className="profile-editor-title">Profile card</h3>
                <div className="profile-editor-body">
                    <p className="profile-editor-error">{combinedError}</p>
                </div>
            </section>
        );
    }

    const firestoreRequired = firestoreProfile?.requiredProfile;
    const apiRequired = profile?.requiredProfile;
    const mergedRequired: Partial<RequiredProfile> = {
        activityLevel: firestoreRequired?.activityLevel ?? apiRequired?.activityLevel ?? null,
        age: firestoreRequired?.age ?? apiRequired?.age ?? null,
        fitnessGoal: firestoreRequired?.fitnessGoal ?? apiRequired?.fitnessGoal ?? null,
        gender: firestoreRequired?.gender ?? apiRequired?.gender ?? null,
        height: firestoreRequired?.height ?? apiRequired?.height ?? null,
        weight: firestoreRequired?.weight ?? apiRequired?.weight ?? null,
    };

    const firestoreAdditional = firestoreProfile?.additionalProfile;
    const apiAdditional = profile?.additionalProfile;
    const mergedAdditional: Partial<AdditionalProfile> = {
        desiredActivityLevel: firestoreAdditional?.desiredActivityLevel ?? apiAdditional?.desiredActivityLevel ?? null,
        dietaryPreferences: firestoreAdditional?.dietaryPreferences ?? apiAdditional?.dietaryPreferences ?? null,
        dietaryRestrictions: firestoreAdditional?.dietaryRestrictions ?? apiAdditional?.dietaryRestrictions ?? null,
        endurance: firestoreAdditional?.endurance ?? apiAdditional?.endurance ?? null,
        exerciseTypes: firestoreAdditional?.exerciseTypes ?? apiAdditional?.exerciseTypes ?? null,
        fitnessLevel: firestoreAdditional?.fitnessLevel ?? apiAdditional?.fitnessLevel ?? null,
        occupationType: firestoreAdditional?.occupationType ?? apiAdditional?.occupationType ?? null,
        preferredEnvironment: firestoreAdditional?.preferredEnvironment ?? apiAdditional?.preferredEnvironment ?? null,
        preferredTimeOfDay: firestoreAdditional?.preferredTimeOfDay ?? apiAdditional?.preferredTimeOfDay ?? null,
        sessionDuration: firestoreAdditional?.sessionDuration ?? apiAdditional?.sessionDuration ?? null,
        strengthMetrics: firestoreAdditional?.strengthMetrics ?? apiAdditional?.strengthMetrics,
    };

    const hasValue = (value: unknown): boolean => {
        if (Array.isArray(value)) {
            return value.length > 0;
        }
        if (value === null || value === undefined) {
            return false;
        }
        if (typeof value === 'string') {
            return value.trim().length > 0;
        }
        if (typeof value === 'object') {
            return Object.values(value as Record<string, unknown>).some((v) => hasValue(v));
        }
        return true;
    };

    const formatNumber = (value: number | string | null | undefined, suffix?: string) => {
        if (value === null || value === undefined) return '—';
        const numeric = typeof value === 'string' ? Number(value) : value;
        if (Number.isFinite(numeric)) {
            return suffix ? `${numeric}${suffix}` : `${numeric}`;
        }
        return `${value}`;
    };

    const formatList = (value: unknown) => {
        if (!hasValue(value)) return '—';
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        return `${value}`;
    };

    const requiredRows = [
        {
            label: 'Activity level',
            value: mergedRequired.activityLevel ?? '—',
            completed: hasValue(mergedRequired.activityLevel),
        },
        {
            label: 'Age',
            value: formatNumber(mergedRequired.age),
            completed: hasValue(mergedRequired.age),
        },
        {
            label: 'Fitness goal',
            value: mergedRequired.fitnessGoal ?? '—',
            completed: hasValue(mergedRequired.fitnessGoal),
        },
        {
            label: 'Gender',
            value: mergedRequired.gender ?? '—',
            completed: hasValue(mergedRequired.gender),
        },
        {
            label: 'Height',
            value: formatNumber(mergedRequired.height, ' cm'),
            completed: hasValue(mergedRequired.height),
        },
        {
            label: 'Weight',
            value: formatNumber(mergedRequired.weight, ' kg'),
            completed: hasValue(mergedRequired.weight),
        },
    ];

    const strengthMetrics = mergedAdditional.strengthMetrics ?? null;
    const formattedStrength = hasValue(strengthMetrics)
        ? `Push-ups: ${formatNumber(strengthMetrics?.pushUps)}, Squats: ${formatNumber(strengthMetrics?.squats)}, Training days/week: ${formatNumber(strengthMetrics?.trainingDaysPerWeek)}`
        : '—';

    const extraRows = [
        {
            label: 'Desired activity level',
            value: mergedAdditional.desiredActivityLevel ?? '—',
            completed: hasValue(mergedAdditional.desiredActivityLevel),
        },
        {
            label: 'Dietary preferences',
            value: formatList(mergedAdditional.dietaryPreferences),
            completed: hasValue(mergedAdditional.dietaryPreferences),
        },
        {
            label: 'Dietary restrictions',
            value: formatList(mergedAdditional.dietaryRestrictions),
            completed: hasValue(mergedAdditional.dietaryRestrictions),
        },
        {
            label: 'Endurance (minutes)',
            value: formatNumber(mergedAdditional.endurance),
            completed: hasValue(mergedAdditional.endurance),
        },
        {
            label: 'Exercise types',
            value: formatList(mergedAdditional.exerciseTypes),
            completed: hasValue(mergedAdditional.exerciseTypes),
        },
        {
            label: 'Fitness level',
            value: mergedAdditional.fitnessLevel ?? '—',
            completed: hasValue(mergedAdditional.fitnessLevel),
        },
        {
            label: 'Occupation type',
            value: mergedAdditional.occupationType ?? '—',
            completed: hasValue(mergedAdditional.occupationType),
        },
        {
            label: 'Preferred environment',
            value: mergedAdditional.preferredEnvironment ?? '—',
            completed: hasValue(mergedAdditional.preferredEnvironment),
        },
        {
            label: 'Preferred time of day',
            value: mergedAdditional.preferredTimeOfDay ?? '—',
            completed: hasValue(mergedAdditional.preferredTimeOfDay),
        },
        {
            label: 'Session duration',
            value: mergedAdditional.sessionDuration ?? '—',
            completed: hasValue(mergedAdditional.sessionDuration),
        },
        {
            label: 'Strength metrics',
            value: formattedStrength,
            completed: hasValue(strengthMetrics),
        },
    ];

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
                            {requiredRows.map((row) => (
                                <MessageRow key={row.label} label={row.label} value={row.value} completed={row.completed} />
                            ))}
                        </>
                    ) : (
                        <>
                            <div><strong>Extra data</strong></div>
                            {extraRows.map((row) => (
                                <MessageRow key={row.label} label={row.label} value={row.value} completed={row.completed} />
                            ))}
                        </>
                    )}
                </div>
            </div>
        </section>
    );
};

export default ProfileCard;
