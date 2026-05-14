import { useMemo, useState, type FormEvent } from 'react';
import type { CurrentUser } from '../types';
import { loginUser, registerUser } from '../state/auth';

interface AuthPageProps {
  initialMode?: 'login' | 'register';
  onAuthenticated: (user: CurrentUser) => void;
}

export function AuthPage({ initialMode = 'login', onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';
  const title = isRegister ? '创建团队账号' : '登录 Open Design';
  const subtitle = isRegister
    ? '团队成员注册后即可开始创建自己的设计。'
    : '使用你的团队账号进入设计工作台。';
  const submitLabel = useMemo(() => {
    if (busy) return isRegister ? '正在注册...' : '正在登录...';
    return isRegister ? '注册账号' : '登录';
  }, [busy, isRegister]);

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register');
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('请输入邮箱和密码。');
      return;
    }
    if (isRegister) {
      if (!name.trim()) {
        setError('请输入姓名。');
        return;
      }
      if (password.length < 8) {
        setError('密码至少需要 8 位。');
        return;
      }
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致。');
        return;
      }
    }
    setBusy(true);
    const result = isRegister
      ? await registerUser({ name: name.trim(), email: trimmedEmail, password })
      : await loginUser({ email: trimmedEmail, password, remember });
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onAuthenticated(result.user);
  };

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <div className="auth-brand">
          <span className="auth-brand-mark">OD</span>
          <span>Open Design</span>
        </div>
      </header>
      <section className="auth-shell" aria-label={title}>
        <form className="auth-panel" onSubmit={submit}>
          <div className="auth-heading">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {isRegister ? (
            <label className="auth-field">
              <span>姓名</span>
              <input
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="你的姓名"
              />
            </label>
          ) : null}
          <label className="auth-field">
            <span>邮箱</span>
            <input
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
            />
          </label>
          <label className="auth-field">
            <span>密码</span>
            <input
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位"
            />
          </label>
          {isRegister ? (
            <label className="auth-field">
              <span>确认密码</span>
              <input
                autoComplete="new-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入密码"
              />
            </label>
          ) : (
            <label className="auth-check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <span>保持登录</span>
            </label>
          )}
          {error ? <div className="auth-error" role="alert">{error}</div> : null}
          <button className="auth-submit" type="submit" disabled={busy}>
            {submitLabel}
          </button>
          <button className="auth-switch" type="button" onClick={switchMode}>
            {isRegister ? '已有账号？登录' : '没有账号？注册'}
          </button>
        </form>
      </section>
    </main>
  );
}
