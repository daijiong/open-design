import type { CurrentUser, UserRole, UserStatus } from '../types';

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const resp = await fetch('/api/auth/me');
    if (!resp.ok) return null;
    const json = (await resp.json()) as { user?: CurrentUser };
    return json.user ?? null;
  } catch {
    return null;
  }
}

export async function loginUser(input: {
  email: string;
  password: string;
  remember?: boolean;
}): Promise<{ user: CurrentUser } | { error: string }> {
  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { error: json?.error?.message ?? json?.error ?? '登录失败' };
    }
    return { user: json.user as CurrentUser };
  } catch {
    return { error: '无法连接服务器' };
  }
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user: CurrentUser } | { error: string }> {
  try {
    const resp = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { error: json?.error?.message ?? json?.error ?? '注册失败' };
    }
    return { user: json.user as CurrentUser };
  } catch {
    return { error: '无法连接服务器' };
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Logging out is best-effort; the UI clears local session state anyway.
  }
}

export async function listAdminUsers(): Promise<{ users: CurrentUser[] } | { error: string }> {
  try {
    const resp = await fetch('/api/admin/users');
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { error: json?.error?.message ?? json?.error ?? '无法加载用户列表' };
    }
    return { users: Array.isArray(json.users) ? (json.users as CurrentUser[]) : [] };
  } catch {
    return { error: '无法连接服务器' };
  }
}

export async function updateAdminUser(
  id: string,
  patch: { name?: string; role?: UserRole; status?: UserStatus; password?: string },
): Promise<{ user: CurrentUser } | { error: string }> {
  try {
    const resp = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { error: json?.error?.message ?? json?.error ?? '保存用户失败' };
    }
    return { user: json.user as CurrentUser };
  } catch {
    return { error: '无法连接服务器' };
  }
}
