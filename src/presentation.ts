import type { Project, Resource } from '../contracts/domain';

// Figma's revised display names; source records and stable references stay intact.
// Exact source-name checks keep user edits and imports authoritative.
const resourceNames: Record<string, [string, string]> = {
  'DEMO-TEXT': ['保温瓶研究准备｜合成阅读测试文本', '保温瓶研究准备｜文本笔记'],
  'DEMO-IMAGE': ['保温瓶版面｜合成选区测试图', '保温瓶版面｜图片笔记'],
  'DEMO-VIDEO': ['资料观察过程｜合成时间轴', '资料观察过程｜视频笔记'],
  'DEMO-RESTRICTED': ['受限资料｜权限演示记录', '受限资料｜权限限制'],
  'PRIVATE-DEMO': ['私人上传｜隐私隔离测试记录', '私人上传｜测试'],
};

export function resourceTitle(resource: Pick<Resource, 'id' | 'title'>): string {
  const names = resourceNames[resource.id];
  return names && resource.title === names[0] ? names[1] : resource.title;
}

export function projectTitle(project: Pick<Project, 'id' | 'title'>): string {
  return project.id === 'project-demo-01' && project.title === '日用品广告研究（演示项目）'
    ? '日用品广告研究' : project.title;
}

export function resourceDateLabel(resource: Resource): string {
  const label = resource.sourceDateType === 'publication' ? '出版日期'
    : resource.sourceDateType === 'object' ? '对象年代'
    : resource.sourceDateType === 'recording' ? '录制日期' : '原始日期';
  return `${label}：${resource.sourceDate || '未详'}`;
}
