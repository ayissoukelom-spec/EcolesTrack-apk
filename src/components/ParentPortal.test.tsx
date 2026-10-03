import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ParentPortal from './ParentPortal';

describe('ParentPortal login identifier field', () => {
  it('accepts email or phone instead of applying browser email-only validation', () => {
    const markup = renderToStaticMarkup(createElement(ParentPortal, {
      token: null,
      parent: null,
      onLoginSuccess: vi.fn(),
      onLogout: vi.fn(),
      refreshAccessToken: async () => null,
      activeTab: 'home',
      setActiveTab: vi.fn(),
      selectedChild: null,
      setSelectedChild: vi.fn(),
      notifications: [],
      fetchNotifications: vi.fn(),
    }));

    expect(markup).toContain('Email ou numéro de téléphone');
    expect(markup).toContain('nom@email.com ou 90123456');
    expect(markup).not.toMatch(/<input[^>]*type="email"/);
  });
});