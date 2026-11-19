import {useEffect, useRef, useState} from 'react';
import {Link} from './ui';

const navigation = [
  ['/search', '全站统一搜索'],
  ['/recommendations', '研究资源推荐'],
  ['/topics', '专题板块'],
  ['/me/projects', '工作台'],
];

export default function SiteHeader({path}: {path: string}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!anchor.current) return;
    // Observe the menu's original position; its slot stays in the document flow.
    const observer = new IntersectionObserver(([entry]) => {
      setPinned(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, []);

  return <header className="global-header">
    <Link className="brand" to="/">
      <span className="brand-icon" aria-hidden="true">▥</span>
      <span>文献研究中心<small>LITERATURE RESEARCH CENTER</small></span>
    </Link>
    <div className="global-nav-slot">
      <span ref={anchor} className="global-nav-anchor" aria-hidden="true"/>
      <nav className={pinned ? 'is-pinned' : undefined} aria-label="全站导航" data-testid="global-nav">
        <Link to="/" className={path === '/' ? 'active' : undefined} aria-current={path === '/' ? 'page' : undefined}>首页</Link>
        {navigation.map(([to, label]) => {
          const active = to === '/me/projects' ? path.startsWith('/me') : path.startsWith(to);
          return <Link key={to} to={to} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>{label}</Link>;
        })}
      </nav>
    </div>
  </header>;
}
