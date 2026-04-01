import { ArrowRight, ShieldCheck } from 'lucide-react';
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
      <main className="login-main">
        <div className="login-pane-left">
          <div className="login-editorial-anchor">
            <h1 className="login-brand-title serif">ScholarMind</h1>
            <p className="login-brand-copy">
              安静的数字化研究空间，为深思熟虑的研究者而建。在这里，主题、证据与写作被组织成一条可追踪的学术路径。
            </p>
          </div>
          <div className="login-brand-divider" />
        </div>

        <div className="login-pane-right">
          <div className="login-form-card login-form-card-ref">
            <div className="login-mobile-brand">
              <h1 className="login-brand-title serif">ScholarMind</h1>
            </div>

            <header className="login-form-header">
              <h2 className="login-form-title">进入研究工作台</h2>
              <div className="login-form-subtitle">请输入你的凭据，以继续 ScholarMind 学术航程。</div>
            </header>

            <form className="login-form-stack" onSubmit={handleSubmit}>
              <div className="login-input-group">
                <div className="login-input-header">
                  <span className="login-input-label">电子邮箱</span>
                </div>
                <input
                  className="login-input login-input-underline"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="researcher@university.edu"
                  type="email"
                />
              </div>

              <div className="login-input-group">
                <div className="login-input-header">
                  <span className="login-input-label">访问密钥</span>
                  <button className="login-forgot-link" type="button">
                    忘记密码？
                  </button>
                </div>
                <input
                  className="login-input login-input-underline"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入你的访问密钥"
                  type="password"
                />
              </div>

              <div className="login-actions login-actions-ref">
                <button className="button-primary" type="submit">
                  <ShieldCheck size={14} />
                  开始会话
                </button>
                <button className="button-ghost login-passport-link" type="button">
                  使用学术通行证登录
                  <ArrowRight size={14} />
                </button>
              </div>
            </form>

            <div className="login-trust-badge login-trust-badge-ref">
              <div className="login-trust-emblem" />
              <div className="login-trust-separator" />
              <p>
                Trusted by Global
                <br />
                Research Institutes
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="login-footer login-footer-ref">
        <a className="login-footer-link" href="#">
          服务条款
        </a>
        <a className="login-footer-link" href="#">
          隐私政策
        </a>
        <a className="login-footer-link" href="#">
          机构访问
        </a>
        <span className="login-footer-divider">|</span>
        <span className="login-footer-copy">© 2024 ScholarMind</span>
      </footer>
      <div className="login-texture" />
    </div>
  );
}
