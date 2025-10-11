import type { ReactNode } from 'react';

export interface ProfileCardRowData {
  label: string;
  value: ReactNode;
  completed?: boolean;
}

export interface ProfileCardSectionData {
  title: string;
  rows: ProfileCardRowData[];
}

export interface ProfileCardHeaderField {
  label: string;
  value: ReactNode;
}

export interface ProfileCardData {
  loading: boolean;
  error: string | null;
  headerFields: ProfileCardHeaderField[];
  sections: {
    required: ProfileCardSectionData;
    bonus: ProfileCardSectionData;
  };
}
