/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// User & Session types
export interface Parent {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  activeSchoolId: string;
  schools: Array<{ id: string; name: string }>;
}

export interface AuthResponse {
  parent: Parent;
  token: string;
}

// Student types
export interface Child {
  id: string;
  parentId: string;
  firstName: string;
  lastName: string;
  className: string;
  birthDate: string;
  avatarUrl: string;
}

export interface Absence {
  id: string;
  childId: string;
  date: string;
  reason: string;
  justified: boolean;
  justificationText?: string;
}

export interface Grade {
  id: string;
  childId: string;
  subject: string;
  grade: number; // Out of 20
  coefficient: number;
  examName: string;
  date: string;
}

// App Push Notification types
export interface AppNotification {
  id: string;
  parentId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  deepLink?: string;
}

// Parent Device Registration
export interface ParentDevice {
  id: string;
  parentId: string;
  platform: 'android' | 'ios';
  pushToken: string;
  appVersion: string;
  lastSeenAt: string;
}

// Notification Preferences
export interface NotificationPreferences {
  parentId: string;
  pushEnabled: boolean;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  quietHoursStart: string; // "HH:MM" e.g., "22:00"
  quietHoursEnd: string;   // "HH:MM" e.g., "07:00"
}

// Channel type for consent and delivery
export type NotificationChannel = 'push' | 'whatsapp' | 'sms';

// Consent Tracking
export interface ParentConsent {
  id: string;
  parentId: string;
  channel: 'whatsapp' | 'sms';
  consentGranted: boolean;
  consentTextVersion: string;
  consentedAt: string;
  revokedAt?: string;
}

// Notification System - Auditing & Queuing
export interface NotificationEvent {
  id: string;
  parentId: string;
  eventType: 'absence' | 'grade' | 'general' | 'test';
  payloadJson: string; // Stringified payload
  dedupeKey: string;   // Unique key to prevent duplicates
  createdAt: string;
}

export interface NotificationDelivery {
  id: string;
  eventId: string;
  channel: NotificationChannel;
  provider: 'fcm' | 'whatsapp_cloud_api' | 'twilio_sms' | 'mock_sms_gateway';
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  attempts: number;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  sentAt?: string;
  deliveredAt?: string;
}

// Complete log format for our Delivery Log inspector UI
export interface CompleteDeliveryLog {
  event: NotificationEvent;
  deliveries: NotificationDelivery[];
}
