export interface UserProfile {
  id: number;
  name: string;
  avatarUrl: string;
}

export enum ContactStatus {
  ONLINE = 'ONLINE',
  AWAY = 'AWAY',
  OFFLINE = 'OFFLINE',
}

export interface Contact {
  id: number;
  name: string;
  avatarUrl: string;
  status: ContactStatus;
}

export interface Group {
  id: number;
  name: string;
  avatarUrl: string;
  members: number[]; // Array of contact IDs
}

export enum CallType {
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
}

export enum AppState {
  AUTH = 'AUTH',
  CONTACTS = 'CONTACTS',
  CALL_HISTORY = 'CALL_HISTORY',
  USER_PROFILE = 'USER_PROFILE',
  SETTINGS = 'SETTINGS',
  CREATE_GROUP = 'CREATE_GROUP',
  OUTGOING_CALL = 'OUTGOING_CALL',
  INCOMING_CALL = 'INCOMING_CALL',
  IN_CALL = 'IN_CALL',
}

export interface Call {
    target: Contact | Group;
    type: CallType;
    direction: 'incoming' | 'outgoing';
}

export enum CallStatus {
  ANSWERED = 'ANSWERED',
  MISSED = 'MISSED',
  OUTGOING = 'OUTGOING',
}

export interface CallLog {
  id: string;
  target: Contact | Group;
  type: CallType;
  direction: 'incoming' | 'outgoing';
  timestamp: number;
  status: CallStatus;
}

export interface NotificationSettings {
  masterMute: boolean;
  soundUrl: string;
  mutedContacts: number[]; // Array of contact IDs
}

export interface AuthData {
    token: string;
    user: UserProfile;
    contacts: Contact[];
    groups: Group[];
}