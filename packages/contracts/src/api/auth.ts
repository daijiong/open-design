export type UserRole = 'admin' | 'member';
export type UserStatus = 'active' | 'disabled' | 'pending';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
}

export interface AuthUserResponse {
  user: CurrentUser;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  remember?: boolean;
}

export interface AdminUsersResponse {
  users: CurrentUser[];
}

export interface UpdateUserRequest {
  name?: string;
  role?: UserRole;
  status?: UserStatus;
}
