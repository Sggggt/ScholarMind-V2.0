import { ArrowRight, Globe } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useWorkspaceStore((state) => state.login);
  const [email, setEmail] = useState('researcher@university.edu');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login(email);
    navigate('/workspace');
  };

  return (
    <div className="login-root">
      <div className="login-pane-left">
        <h1 className="login-brand-title serif">ScholarMind</h1>
        <div className="login-brand-copy">
          静谧的数字化策展空间，为深思熟虑的研究者而建。在这里，思想得以自由呼吸。
        </div>
        <div className="login-brand-divider" />
      </div>

      <div className="login-pane-right">
        <div className="login-form-card">
          <h2 className="login-form-title">进入研究工坊</h2>
          <div className="login-form-subtitle">请输入您的凭据以继续学术航程</div>

          <form onSubmit={handleSubmit}>
            <div className="login-input-group">
              <div className="login-input-header">
                <span className="login-input-label">电子邮箱</span>
              </div>
              <input
                className="login-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="researcher@university.edu"
              />
            </div>

            <div className="login-input-group" style={{ marginBottom: '16px' }}>
              <div className="login-input-header">
                <span className="login-input-label">访问密码</span>
                <button type="button" className="login-forgot-link" style={{ background: 'transparent', border: 'none' }}>忘记密码？</button>
              </div>
              <input
                className="login-input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                type="password"
              />
            </div>

            <div className="login-actions">
              <button className="button-primary" type="submit" style={{ padding: '12px 28px', fontSize: '13px', borderRadius: '6px' }}>
                开启会话
              </button>
              <button
                className="button-ghost"
                type="button"
                style={{ fontSize: '13px', gap: '6px', opacity: 0.8, color: 'var(--text-muted)' }}
              >
                使用学术通行证登录 <ArrowRight size={14} />
              </button>
            </div>
          </form>

          <div className="login-trust-badge">
            <div className="login-trust-icon">
              <Globe size={18} strokeWidth={1.5} />
            </div>
            <div className="login-trust-copy">
              Trusted by global<br />
              research institutes
            </div>
          </div>
        </div>

        <div className="login-footer">
          <a href="#" className="login-footer-link">服务条款</a>
          <a href="#" className="login-footer-link">隐私政策</a>
          <a href="#" className="login-footer-link">机构访问</a>
          <span style={{ color: 'rgba(133, 126, 113, 0.3)' }}>|</span>
          <span style={{ opacity: 0.7 }}>© 2024 DIGITAL ATELIER</span>
        </div>
      </div>
    </div>
  );
}
