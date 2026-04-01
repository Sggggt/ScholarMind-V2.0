import { EditorialPage, SectionBlock } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function SettingsPage() {
  const user = useWorkspaceStore((state) => state.user);

  return (
    <EditorialPage
      eyebrow="设置"
      title="工作台偏好与账户控制"
      description="设置页保持克制和安静，而不是做成密集的后台配置面板。"
    >
      <div className="grid-two">
        <SectionBlock title="账户信息" description="共享研究环境中的基础身份与机构信息。">
          <div className="stack">
            <label>
              <div className="kicker">姓名</div>
              <input className="text-input" defaultValue={user.name} />
            </label>
            <label>
              <div className="kicker">角色</div>
              <input className="text-input" defaultValue={user.role} />
            </label>
            <label>
              <div className="kicker">机构</div>
              <input className="text-input" defaultValue={user.affiliation} />
            </label>
          </div>
        </SectionBlock>

        <SectionBlock title="偏好设置" description="通知方式与工作台行为的基础配置。">
          <div className="stack">
            <label>
              <div className="kicker">默认入口</div>
              <select className="select-input" defaultValue="main">
                <option value="main">主工作台</option>
                <option value="workflow">流程总览</option>
                <option value="writing">论文写作</option>
              </select>
            </label>
            <label>
              <div className="kicker">通知方式</div>
              <select className="select-input" defaultValue="quiet">
                <option value="quiet">安静摘要</option>
                <option value="all">全部运行提醒</option>
                <option value="critical">仅关键提醒</option>
              </select>
            </label>
          </div>
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}
