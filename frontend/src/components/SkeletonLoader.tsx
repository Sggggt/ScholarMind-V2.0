// ============================================================
// 骨架屏加载组件
// ============================================================

function Bone({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700 ${className}`}
    />
  );
}

/** 侧边栏任务列表骨架屏 */
export function SidebarSkeleton() {
  return (
    <div className="px-3 py-2 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Bone className="w-4 h-4 rounded-full shrink-0" />
          <Bone className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

/** 任务详情骨架屏 */
export function TaskDetailSkeleton() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 space-y-6">
      {/* User message bubble */}
      <div className="flex justify-end">
        <Bone className="h-12 w-[60%] rounded-2xl" />
      </div>

      {/* Agent response */}
      <div className="flex items-start gap-3">
        <Bone className="w-7 h-7 rounded-full shrink-0" />
        <div className="flex-1 space-y-4">
          {/* Status + date */}
          <div className="flex items-center gap-3">
            <Bone className="h-5 w-16 rounded-full" />
            <Bone className="h-4 w-32" />
          </div>

          {/* Tab bar */}
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Bone key={i} className="h-8 w-16 rounded-lg" />
            ))}
          </div>

          {/* Content area */}
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Bone className="w-4 h-4 rounded shrink-0" />
                <div className="flex-1 space-y-2">
                  <Bone className="h-4 w-[40%]" />
                  <Bone className="h-1.5 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Dashboard 骨架屏 */
export function DashboardSkeleton() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 space-y-8">
      <div className="text-center space-y-3">
        <Bone className="h-8 w-64 mx-auto" />
        <Bone className="h-4 w-96 mx-auto" />
      </div>
      <Bone className="h-28 w-full max-w-[680px] rounded-2xl" />
      <div className="w-full max-w-[680px] grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default Bone;
